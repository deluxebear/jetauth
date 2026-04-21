# ReBAC (Zanzibar) 集成方案

> **Superseded by [`rebac-spec.md`](rebac-spec.md)** — 这是早期设计稿,保留仅供参考。
> 对齐方向已转向 OpenFGA DSL 兼容 + 模型版本化 + 条件 + 产品级 ListObjects,详见新 spec。

## 概述

在现有"应用授权"模块（`biz_*` 系列）中引入 Zanzibar 风格的 ReBAC（关系型授权），使用户创建应用时可选择 RBAC（Casbin）或 ReBAC 模型。两套引擎在同一模块中并存，对外暴露统一的 Enforce API。

## 方案选型

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| A: OpenFGA 外部服务 | 功能完整，标准兼容 | 破坏单体架构，多一个服务+独立DB | ❌ |
| **B: 轻量自建图引擎** | **复用现有DB/缓存，零运维增量** | 功能子集（够用） | ✅ |
| C: 嵌入 OpenFGA 包 | 进程内调用 | 无稳定 embed API，依赖冲突风险高 | ❌ |

**选择方案 B**：在现有数据库和架构内自建 Zanzibar 核心子集（Check / ListObjects / ListUsers）。

## 架构设计

```
JetAuth
  ├─ BizAppConfig (modelType: "casbin" | "rebac")
  ├─ Casbin 引擎 (现有，不动)
  │    ├─ BizRole
  │    └─ BizPermission
  └─ ReBAC 引擎 (新建)
       ├─ BizTuple 表 (xorm，复用现有 DB)
       ├─ Schema 定义 (JSON，存在 BizAppConfig.SchemaText)
       └─ 图遍历引擎 (Go 实现，带缓存)
```

## 一、数据模型

### 1.1 BizAppConfig 扩展

```go
type BizAppConfig struct {
    // ... 现有字段不变
    ModelType   string `xorm:"varchar(20) default 'casbin'" json:"modelType"` // "casbin" | "rebac"
    SchemaText  string `xorm:"mediumtext" json:"schemaText"`                  // ReBAC 类型/关系定义（JSON）
}
```

### 1.2 ReBAC Schema 格式（JSON）

存储在 `BizAppConfig.SchemaText` 中，定义对象类型和关系：

```json
{
  "types": {
    "user": {},
    "team": {
      "relations": {
        "member": { "types": ["user"] }
      }
    },
    "folder": {
      "relations": {
        "owner":  { "types": ["user"] },
        "editor": { "types": ["user", "team#member"], "also": ["owner"] },
        "viewer": { "types": ["user"], "also": ["editor"] }
      }
    },
    "document": {
      "relations": {
        "parent": { "types": ["folder"] },
        "owner":  { "types": ["user"] },
        "editor": { "types": ["user"], "also": ["owner"], "from": {"parent": "editor"} },
        "viewer": { "types": ["user"], "also": ["editor"], "from": {"parent": "viewer"} }
      }
    }
  }
}
```

关系定义三种来源：
- `types` — 直接赋予（如 `user:alice`）
- `also` — 同对象的其他关系隐含（如 `owner` 隐含 `editor`）
- `from` — 从关联对象继承（如 `parent.editor` → 当前对象的 `editor`）

### 1.3 BizTuple 表（关系元组）

```go
type BizTuple struct {
    Id          int64  `xorm:"pk autoincr"`
    Owner       string `xorm:"varchar(100) notnull index(idx_forward) index(idx_reverse)"`
    AppName     string `xorm:"varchar(100) notnull index(idx_forward) index(idx_reverse)"`
    ObjectType  string `xorm:"varchar(100) notnull index(idx_forward)"` // "document"
    ObjectId    string `xorm:"varchar(200) notnull index(idx_forward)"` // "design-doc-1"
    Relation    string `xorm:"varchar(100) notnull index(idx_forward)"` // "editor"
    SubjectType string `xorm:"varchar(100) notnull index(idx_reverse)"` // "user" | "team"
    SubjectId   string `xorm:"varchar(200) notnull index(idx_reverse)"` // "alice"
    SubjectRel  string `xorm:"varchar(100) index(idx_reverse)"`         // "" | "member"
    CreatedTime string `xorm:"varchar(100)"`
}
```

索引设计：
- `idx_forward`: `(owner, appName, objectType, objectId, relation)` — Check 查询
- `idx_reverse`: `(owner, appName, subjectType, subjectId, subjectRel)` — ListObjects 查询

Zanzibar 元组映射示例：

```
document:design-doc-1#editor@user:alice
  → ObjectType=document, ObjectId=design-doc-1, Relation=editor,
    SubjectType=user, SubjectId=alice, SubjectRel=""

folder:engineering#editor@team:eng-team#member
  → ObjectType=folder, ObjectId=engineering, Relation=editor,
    SubjectType=team, SubjectId=eng-team, SubjectRel="member"
```

## 二、图遍历引擎

### 2.1 核心接口

```go
// object/biz_rebac_engine.go

// Check: user:alice 是否是 document:doc1 的 viewer?
func ReBACCheck(owner, appName, object, relation, subject string) (bool, error)

// ListObjects: user:alice 能 view 的所有 document
func ReBACListObjects(owner, appName, objectType, relation, subject string) ([]string, error)

// ListUsers: 谁能 edit document:doc1
func ReBACListUsers(owner, appName, object, relation string) ([]Subject, error)
```

### 2.2 Check 算法（带深度限制 + 请求级 memo）

```go
func (e *ReBACEngine) check(ctx checkContext) (bool, error) {
    // 1. 深度限制
    if ctx.depth > maxDepth { return false, nil }

    // 2. 请求级 memo（防止同一次 Check 内重复遍历）
    if cached, ok := ctx.memo[ctx.cacheKey()]; ok {
        return cached, nil
    }

    // 3. 解析 schema 中该 relation 的定义
    relDef := e.schema.Types[ctx.objectType].Relations[ctx.relation]

    // 4. 直接关系查找
    tuples := e.getTuples(ctx.owner, ctx.appName,
        ctx.objectType, ctx.objectId, ctx.relation)
    for _, t := range tuples {
        if t.matches(ctx.subject) {
            return true, nil
        }
        // userset 展开: team:eng#member → 检查 subject 是否是 eng 的 member
        if t.SubjectRel != "" {
            if ok, _ := e.check(subCtx(t.SubjectType, t.SubjectId, t.SubjectRel, ctx)); ok {
                return true, nil
            }
        }
    }

    // 5. also 展开（同对象的其他关系）
    for _, alsoRel := range relDef.Also {
        if ok, _ := e.check(subCtx(ctx.objectType, ctx.objectId, alsoRel, ctx)); ok {
            return true, nil
        }
    }

    // 6. from 展开（从关联对象继承）
    for throughRel, targetRel := range relDef.From {
        parentTuples := e.getTuples(ctx.owner, ctx.appName,
            ctx.objectType, ctx.objectId, throughRel)
        for _, pt := range parentTuples {
            if ok, _ := e.check(subCtx(pt.SubjectType, pt.SubjectId, targetRel, ctx)); ok {
                return true, nil
            }
        }
    }

    ctx.memo[ctx.cacheKey()] = false
    return false, nil
}
```

### 2.3 性能保障

| 层级 | 策略 |
|------|------|
| 元组查询 | 复合索引 idx_forward / idx_reverse |
| Check 结果 | 请求级 memo map（同一次 Check 内去重） |
| 热点元组 | sync.Map 缓存，写入时失效 |
| 深度限制 | maxDepth=15，防止无限递归 |
| ListObjects | 并发遍历 + context 超时 |

## 三、API 层改造

### 3.1 统一 Enforce 入口路由

```go
func BizEnforce(owner, appName string, request []interface{}) (bool, error) {
    config, err := getBizAppConfigOrError(owner, appName)
    if err != nil { return false, err }
    if !config.IsEnabled { return false, fmt.Errorf("app is disabled") }

    switch config.ModelType {
    case "rebac":
        // request: ["user:alice", "document:doc1", "viewer"]
        return ReBACCheck(owner, appName,
            request[1].(string), // object  "document:doc1"
            request[2].(string), // relation "viewer"
            request[0].(string), // subject "user:alice"
        )
    default: // "casbin"
        e, err := GetBizEnforcer(owner, appName)
        if err != nil { return false, err }
        return e.Enforce(request...)
    }
}
```

### 3.2 新增 Tuple CRUD API

```
POST   /api/biz-write-tuples?appId=owner/appName    — 批量写入元组
POST   /api/biz-delete-tuples?appId=owner/appName    — 批量删除元组
GET    /api/biz-read-tuples?appId=...&object=...     — 读取元组（支持过滤）
GET    /api/biz-list-objects?appId=...&sub=...&rel=.. — 列出可访问对象
GET    /api/biz-list-users?appId=...&obj=...&rel=...  — 列出有权限的用户
GET    /api/biz-expand?appId=...&obj=...&rel=...      — 展开关系树（调试用）
```

### 3.3 现有 API 兼容

以下 API 按 modelType 路由，ReBAC 模式下返回不同数据：

| API | Casbin 模式 | ReBAC 模式 |
|-----|-----------|-----------|
| `biz-enforce` | Casbin enforce | 图遍历 Check |
| `biz-batch-enforce` | Casbin batch | 批量 Check |
| `biz-get-user-roles` | Casbin GetRolesForUser | 从 tuple 中提取角色关系 |
| `biz-get-user-permissions` | 遍历 BizPermission | 遍历用户可达的所有关系 |
| `biz-get-policies` | 导出 Casbin 策略 | 导出全部 tuple |
| `biz-sync-policies` | 重建 Casbin 策略 | 清除 tuple 缓存 |

## 四、前端 UI 扩展

### 4.1 AppConfig 创建向导增加模型选择

```
步骤 2: 选择授权模型
  ┌─────────────────┐  ┌─────────────────┐
  │   RBAC (Casbin)  │  │   ReBAC (关系型) │
  │   基于角色的       │  │   基于对象关系的   │
  │   访问控制         │  │   访问控制         │
  └─────────────────┘  └─────────────────┘

RBAC → 步骤 3: Casbin model 编辑器 (现有)
ReBAC → 步骤 3: Schema 编辑器 (新增，或使用预设模板)
```

### 4.2 AppAuthorizationPage Tab 切换

```
Casbin 模式 (现有不变):
  概览 | 角色 | 权限 | 测试 | 集成

ReBAC 模式 (新增):
  概览 | 类型定义 | 关系数据 | 测试 | 集成
```

### 4.3 ReBAC 专用组件

**Schema 编辑器** — 可视化编辑对象类型和关系定义：
```
┌─ document ─────────────────────────┐
│  parent:  → folder (直接关系)       │
│  owner:   → user (直接关系)         │
│  editor:  → owner ∪ parent.editor  │
│  viewer:  → editor ∪ parent.viewer │
└────────────────────────────────────┘
```

**Tuple 管理表格** — 增删查元组：
```
| 对象              | 关系    | 主体                  | 操作   |
|------------------|---------|----------------------|--------|
| document:doc1    | owner   | user:alice           | [删除] |
| document:doc1    | parent  | folder:engineering   | [删除] |
| folder:eng       | editor  | team:eng-team#member | [删除] |
[+ 添加关系]
```

**Check 测试器** — 带路径展示：
```
主体: [user:alice     ▼]
对象: [document:doc1  ▼]
关系: [viewer         ▼]
       [ 检查权限 ]
结果: ✅ 允许
路径: user:alice →(owner)→ document:doc1 →(also: editor)→ (also: viewer) ✓
```

**集成代码示例** — 补充 ReBAC 模式的 SDK 用法。

## 五、文件清单

### 后端新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| `object/biz_app_config.go` | 修改 | 增加 ModelType, SchemaText 字段 |
| `object/biz_tuple.go` | **新增** | BizTuple 结构体 + CRUD |
| `object/biz_rebac_schema.go` | **新增** | Schema JSON 解析 → 内存结构 |
| `object/biz_rebac_engine.go` | **新增** | Check / ListObjects / ListUsers 图遍历 |
| `object/biz_rebac_cache.go` | **新增** | 元组查询缓存 + 失效机制 |
| `object/biz_enforcer_cache.go` | 修改 | BizEnforce 按 modelType 路由 |
| `object/ormer.go` | 修改 | 注册 BizTuple 表 |
| `controllers/biz_permission_api.go` | 修改 | 增加 tuple CRUD + list-objects/list-users 端点 |
| `routers/router.go` | 修改 | 注册新 API 路由 |

### 前端新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| `web/src/pages/AuthorizationPage.tsx` | 修改 | 创建向导增加模型类型选择 |
| `web/src/pages/AppAuthorizationPage.tsx` | 修改 | 按 modelType 显示不同 Tab |
| `web/src/components/BizSchemaEditor.tsx` | **新增** | ReBAC 类型/关系定义可视化编辑器 |
| `web/src/components/BizTupleManager.tsx` | **新增** | 元组管理表格组件 |
| `web/src/components/BizReBACTester.tsx` | **新增** | Check 测试器（带路径展示） |
| `web/src/backend/BizBackend.ts` | 修改 | 增加 tuple API + list-objects/list-users |
| `web/src/locales/zh.ts` | 修改 | 增加 ReBAC 相关 i18n |
| `web/src/locales/en.ts` | 修改 | 增加 ReBAC 相关 i18n |

## 六、实施分期

| 阶段 | 内容 | 预估工作量 |
|------|------|-----------|
| **P1: 数据模型** | BizAppConfig 扩展 + BizTuple 表 + Schema 解析 | 2-3 天 |
| **P2: 图遍历引擎** | Check 算法 + memo 缓存 + 深度限制 | 3-4 天 |
| **P3: API 层** | Enforce 路由改造 + Tuple CRUD + ListObjects/ListUsers | 2 天 |
| **P4: 前端 Schema + Tuple** | Schema 编辑器 + Tuple 管理表格 + 创建向导 | 3-4 天 |
| **P5: 前端测试 + 集成** | Check 测试器 + 集成代码示例 + i18n | 1-2 天 |
| **P6: 缓存优化** | sync.Map 元组缓存 + 可选 Redis 缓存 | 2 天 |
| **总计** | | **约 2-3 周** |

## 七、与现有系统的兼容性

- **零破坏性**：所有现有 Casbin 应用不受影响，`modelType` 默认为 `"casbin"`
- **统一入口**：`biz-enforce` / `biz-batch-enforce` API 签名不变，内部路由
- **前端渐进**：`AppAuthorizationPage` 按 `modelType` 渲染不同 Tab，Casbin 模式完全不变
- **数据库无迁移**：新增 `biz_tuple` 表 + `biz_app_config` 加两列，不改现有表结构
