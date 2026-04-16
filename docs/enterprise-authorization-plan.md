# JetAuth 企业级权限管理平台 — 改造方案

## 目标

将 JetAuth 打造为企业所有自研业务系统的**统一权限管理中心**，提供：
- 每个业务系统独立的权限策略
- 高性能权限判断（支持万级并发）
- 多种集成方式（API / SDK / 本地缓存）
- 完整的权限管理能力（操作权限 + 字段权限 + 数据范围）

---

## 一、核心问题分析

### 当前架构的根本矛盾

```
Permission 系统（易用层）          Enforcer 系统（原生层）
  ↓ GetBuiltInModel()              ↓ model.NewModelFromString()
  → 魔改模型为 6 字段               → 原样使用用户定义的模型
  → 策略带 permissionId             → 策略按模型原始结构
  → 按 V5 过滤加载                  → 全量加载
  → 每次请求重建，无缓存             → 可缓存（但和 Permission 策略不兼容）
```

**两套系统各自独立，写入的策略格式不同，无法互通。** 这导致：
- 业务系统不能通过 Enforcer 缓存 Permission 系统的策略
- 执行器的 get-policies API 返回空（模型字段不匹配）
- 6 字段限制阻止了复杂模型的使用

### 需要解决的 6 个问题

| # | 问题 | 影响 |
|---|------|------|
| 1 | Permission 和 Enforcer 策略格式不兼容 | 业务系统无法通过执行器拉取策略本地缓存 |
| 2 | 无 Enforcer 缓存 | 每次 enforce 产生 15-25 次 DB 查询 |
| 3 | 6 字段硬性限制 | 无法支持复杂模型（如 ABAC） |
| 4 | Role 无自定义属性 | 无法存储数据范围等业务元数据 |
| 5 | 无标准化 SDK 生成 | 每个业务系统需要自己封装调用逻辑 |
| 6 | 审批流半成品 | 权限变更无管控 |

---

## 二、整体架构设计

### 目标架构

```
┌─────────────────────────────────────────────────────────┐
│                    JetAuth 权限管理中心                     │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │
│  │ ERP 权限  │  │ CRM 权限  │  │ HR 权限   │  │ OA 权限  │  │
│  │ 独立模型   │  │ 独立模型   │  │ 独立模型   │  │ 独立模型  │  │
│  │ 独立策略表 │  │ 独立策略表 │  │ 独立策略表 │  │ 独立策略表│  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘  │
│       │              │              │              │       │
│  ┌────▼──────────────▼──────────────▼──────────────▼────┐  │
│  │              统一策略引擎（改造后的 Casbin）              │  │
│  │  · 统一的策略格式（消除 6 字段限制）                      │  │
│  │  · 内存缓存 + 变更通知                                  │  │
│  │  · 按应用隔离的策略加载                                  │  │
│  └────┬──────────────┬──────────────┬──────────────┬────┘  │
│       │              │              │              │       │
│  ┌────▼────┐    ┌────▼────┐   ┌────▼────┐   ┌────▼────┐  │
│  │ REST API │    │ gRPC API│   │ SDK 生成 │   │ Webhook │  │
│  └─────────┘    └─────────┘   └─────────┘   └─────────┘  │
└─────────────────────────────────────────────────────────────┘
         │              │              │              │
    ┌────▼────┐    ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
    │ ERP 系统 │    │ CRM 系统│   │ HR 系统  │   │ OA 系统  │
    │ SDK 集成 │    │ SDK 集成│   │ SDK 集成 │   │ API 调用 │
    └─────────┘    └─────────┘   └─────────┘   └─────────┘
```

### 核心设计原则

1. **一个应用一套完整配置** — 模型 + 适配器 + 策略表 + 角色体系，完全隔离
2. **统一策略格式** — 消除 Permission 和 Enforcer 的格式差异
3. **多种集成方式** — API 实时调用 / SDK 本地缓存 / Webhook 变更通知
4. **向后兼容** — 现有功能不受影响，新架构可渐进式迁移

---

## 三、分阶段实施计划

### Phase 1：统一策略引擎（后端核心改造）

**目标：消除 Permission 和 Enforcer 的格式差异，让业务系统能通过执行器拉取 Permission 的策略。**

#### 1.1 改造 Enforcer 的初始化逻辑

当 Enforcer 指向的适配器表中存有 Permission 系统写入的策略时，自动使用改造后的模型：

```go
// object/enforcer.go — InitEnforcer()
func (enforcer *Enforcer) InitEnforcer() error {
    // ...现有逻辑...

    // 新增：检测策略表是否由 Permission 系统写入（V5 列有 permissionId）
    // 如果是，使用 GetBuiltInModel() 改造模型（和 Permission 系统一致）
    if enforcer.isPermissionPolicyTable() {
        m, err := GetBuiltInModel(modelObj.ModelText)  // 改造成 6 字段
    } else {
        m, err = model.NewModelFromString(modelObj.ModelText)  // 原样
    }
}
```

**改动范围**：`object/enforcer.go` 的 `InitEnforcer` 方法
**风险**：低 — 新增判断分支，不影响原有 Enforcer（原有 Enforcer 用独立的表，不含 permissionId）

#### 1.2 新增「按应用获取策略」API

```
GET /api/get-app-policies?appName=erp-system&owner=jetems1
Authorization: Basic clientId:clientSecret

Response:
{
    "status": "ok",
    "data": {
        "model": "[request_definition]\nr = sub, obj, act\n...",
        "policies": [
            {"ptype": "p", "v0": "org/admin", "v1": "erp-system", "v2": "Read", ...},
            ...
        ],
        "groupingPolicies": [
            {"ptype": "g", "v0": "org/alice", "v1": "org/erp-admin"},
            ...
        ]
    }
}
```

这个 API 做三件事：
1. 找到该应用关联的所有 Permission
2. 收集所有策略（p 规则）
3. 动态构建角色继承（g 规则）— 现有的 `getRuntimeGroupingPolicies` 逻辑

**业务系统拿到这个响应后，可以直接初始化本地 Casbin Enforcer。**

#### 1.3 Enforcer 内存缓存

```go
var enforcerCache sync.Map  // key: permissionId → value: *casbin.Enforcer

func getPermissionEnforcer(p *Permission) (*casbin.Enforcer, error) {
    if cached, ok := enforcerCache.Load(p.GetId()); ok {
        return cached.(*casbin.Enforcer), nil
    }
    enforcer := ... // 现有创建逻辑
    enforcerCache.Store(p.GetId(), enforcer)
    return enforcer, nil
}
```

缓存失效时机：
- Permission 更新/删除 → 清该 Permission 缓存
- Role 用户变更 → 清引用该 Role 的所有 Permission 缓存
- Model/Adapter 更新 → 清引用它们的所有 Permission 缓存

**改动范围**：`object/permission_enforcer.go`
**性能提升**：单次判断从 5-20ms（多次 DB）→ 0.01-0.1ms（内存匹配）

### Phase 2：数据模型增强

#### 2.1 Role 增加 properties 字段

```go
type Role struct {
    // ...现有字段
    Properties string `xorm:"mediumtext" json:"properties"`  // JSON 格式
}
```

用于存储：
- 数据范围配置：`{"dataScope": {"orders": "department", "users": "self"}}`
- 业务属性：`{"level": 3, "department": "sales"}`
- 功能开关：`{"canExport": true, "canApprove": false}`

前端：角色编辑页增加属性编辑器（JSON key-value 表单）

#### 2.2 Permission 增加应用关联字段（可选）

```go
type Permission struct {
    // ...现有字段
    Application string `xorm:"varchar(100)" json:"application"`  // 可选：显式绑定应用
}
```

当前通过 resources 间接关联应用，加上显式字段后：
- 查询更精确（不用靠 resources 猜测）
- 概览页统计更准确
- 不影响现有权限（空值表示不绑定）

### Phase 3：SDK 自动化生成

#### 3.1 集成配置页

在应用授权详情页的「集成指南」Tab 增强：

```
┌─────────────────────────────────────────────────┐
│  集成指南 — ERP 管理系统                          │
│                                                  │
│  集成方式                                         │
│  ○ API 实时调用（简单，每次请求调 JetAuth）         │
│  ● SDK 本地缓存（推荐，高性能，本地判权）          │
│  ○ 数据库直连（最高性能，需要共享数据库）           │
│                                                  │
│  语言                                            │
│  [Go ▼]  [Java]  [Python]  [Node.js]  [.NET]   │
│                                                  │
│  ┌─ 生成的代码 ──────────────────────────────┐  │
│  │ // 自动生成的中间件代码                      │  │
│  │ // 已填入 ClientId/Secret/Endpoint         │  │
│  │ // 包含缓存刷新逻辑                         │  │
│  │ ...                                        │  │
│  └──────────────────────────── [复制] [下载] ─┘  │
└─────────────────────────────────────────────────┘
```

#### 3.2 SDK 模板（本地缓存模式）

为业务系统生成的 SDK 包含：

```go
// jetauth-sdk-erp.go（自动生成）

type JetAuthClient struct {
    enforcer    *casbin.Enforcer
    endpoint    string
    clientId    string
    clientSecret string
    appName     string
    refreshInterval time.Duration
}

// 初始化：从 JetAuth 拉取策略，本地构建 Enforcer
func NewClient(config Config) (*JetAuthClient, error) {
    // 1. GET /api/get-app-policies?appName=erp-system
    // 2. 用返回的 model + policies 初始化本地 Casbin Enforcer
    // 3. 启动定时刷新 goroutine
}

// 权限判断：纯内存，无网络调用
func (c *JetAuthClient) CanAccess(userId, resource, action string) bool {
    result, _ := c.enforcer.Enforce(userId, resource, action)
    return result
}

// 获取用户角色
func (c *JetAuthClient) GetUserRoles(userId string) []string { ... }

// 获取数据范围
func (c *JetAuthClient) GetDataScope(userId, resource string) string {
    // 查 /scope/{resource} 的策略
}

// 获取字段权限
func (c *JetAuthClient) GetFieldGroups(userId, resource string) []string {
    // 查 {resource}#basic, {resource}#financial 等
}
```

#### 3.3 策略变更通知（Webhook / Redis）

```
权限/角色变更 → JetAuth 发通知 → 业务系统 SDK 刷新缓存

方式一：Webhook
  POST https://erp.company.com/jetauth/refresh
  Body: {"event": "policy_changed", "app": "erp-system", "timestamp": "..."}

方式二：Redis Pub/Sub
  PUBLISH jetauth:policy:erp-system "{\"event\":\"changed\"}"
  SDK 订阅 → 自动刷新

方式三：轮询（最简单）
  SDK 每 30s 调 GET /api/get-app-policies?since=lastSync
  有变更则刷新本地缓存
```

### Phase 4：权限管理 UI 完善

#### 4.1 授权管理页增强

在现有的应用授权详情页基础上补充：

**概况 Tab**
- 显示策略表状态（行数、最后更新时间）
- 一键同步策略到适配器表
- 健康检查（模型是否兼容、适配器是否连通）

**角色 Tab**
- 属性编辑器（properties JSON）
- 数据范围配置（可视化）
- 角色继承可视化（树形图）

**权限 Tab**
- 适配器选择器（已完成）
- 策略预览（展示实际生成的 Casbin 策略行）
- 批量导入/导出策略

**测试 Tab**（已完成，增强）
- 增加 GetAllRoles/Objects/Actions 查询
- 批量测试（CSV 导入测试用例）
- 测试报告导出

**集成 Tab**（增强）
- 多种集成方式选择
- 多语言 SDK 代码生成
- 连接状态检测

#### 4.2 用户权限画像增强

使用后端 `get-all-objects` / `get-all-actions` / `get-all-roles` API 替代当前的前端聚合，数据更准确。

### Phase 5：高级功能

#### 5.1 审批流完善

```
非管理员创建权限 → State=Pending → 通知管理员
管理员审批 → State=Approved → 策略生效 → 通知申请人
管理员拒绝 → State=Rejected → 记录原因 → 通知申请人
```

需要新增：
- `POST /api/approve-permission` — 审批专用端点
- `POST /api/reject-permission` — 拒绝专用端点
- 状态机校验（Pending → Approved/Rejected，不可逆）
- 审批通知（站内消息 / 邮件 / Webhook）

#### 5.2 权限模板

预置常见的权限模板，一键应用：

| 模板 | 包含内容 |
|------|---------|
| **基础 RBAC** | admin/editor/viewer 三角色 + 基础 CRUD 权限 |
| **API 网关** | RBAC + keyMatch5 + regexMatch，按 RESTful 路径控制 |
| **多租户** | RBAC with domains，按租户隔离 |
| **ABAC** | 基于属性的访问控制，支持动态条件 |

#### 5.3 权限审计日志

记录每次权限变更和判断结果：

```
[2026-04-16 10:23:05] ENFORCE app=erp-system user=org/alice resource=/api/orders/123 action=GET result=ALLOW rule=order-read latency=0.05ms
[2026-04-16 10:23:12] POLICY_CHANGE app=erp-system perm=order-write action=ADD by=admin
```

---

## 四、实施优先级和时间线

```
Phase 1: 统一策略引擎（核心，必做）
├── 1.1 改造 Enforcer 初始化           ← 后端改动小，解决最大痛点
├── 1.2 新增 get-app-policies API      ← 业务系统集成的基础
└── 1.3 Enforcer 内存缓存              ← 性能提升 100-500 倍

Phase 2: 数据模型增强
├── 2.1 Role properties 字段           ← 支持数据范围等业务需求
└── 2.2 Permission application 字段    ← 可选，提升查询精度

Phase 3: SDK 自动化
├── 3.1 集成配置页增强                   ← 前端 UI
├── 3.2 SDK 模板（Go/Java/Python/JS）  ← 业务系统可直接引用
└── 3.3 策略变更通知                     ← Webhook / Redis / 轮询

Phase 4: UI 完善
├── 4.1 授权管理页增强                   ← 前端 UI
└── 4.2 用户权限画像增强                 ← 使用后端 API 替代前端聚合

Phase 5: 高级功能
├── 5.1 审批流                          ← 企业级必备
├── 5.2 权限模板                        ← 降低使用门槛
└── 5.3 审计日志                        ← 合规需求
```

### 改动量估算

| Phase | 后端改动 | 前端改动 | 风险 |
|-------|---------|---------|------|
| 1.1 | ~50 行 | 无 | 低（新增判断分支） |
| 1.2 | ~100 行（新 API） | 无 | 低（只读接口） |
| 1.3 | ~80 行 + 各 CRUD 加缓存失效 | 无 | 中（缓存一致性） |
| 2.1 | ~10 行（加字段）| ~200 行（属性编辑器）| 低 |
| 2.2 | ~10 行 | ~50 行 | 低 |
| 3.1 | 无 | ~300 行 | 低 |
| 3.2 | 无（模板文件）| 无 | 低 |
| 3.3 | ~150 行 | ~50 行 | 中 |
| 4.x | 无 | ~500 行 | 低 |
| 5.1 | ~200 行 | ~300 行 | 中 |
| 5.2 | ~100 行 | ~200 行 | 低 |
| 5.3 | ~150 行 | ~200 行 | 低 |

---

## 五、业务系统集成方式对比

改造完成后，业务系统有三种集成方式：

### 方式一：API 实时调用（最简单）

```
业务系统每次请求 → 调 JetAuth /api/enforce → 返回 allow/deny
```

| 优点 | 缺点 |
|------|------|
| 零配置，HTTP 调用即可 | 每次请求增加网络延迟（~5ms） |
| 权限实时生效 | JetAuth 宕机则所有系统权限失效 |
| 适合低频场景 | 高并发下压力集中在 JetAuth |

**适用**：内部管理系统、低频操作

### 方式二：SDK 本地缓存（推荐）

```
业务系统启动 → 从 JetAuth 拉取策略 → 本地 Casbin 引擎 → 内存判权
策略变更 → Webhook/轮询通知 → SDK 自动刷新
```

| 优点 | 缺点 |
|------|------|
| 判权延迟 <0.1ms | 策略变更有短暂延迟（秒级） |
| JetAuth 宕机不影响已缓存的权限 | 需要引入 SDK 依赖 |
| 支持万级并发 | 内存占用（通常 <100MB） |

**适用**：高并发业务系统（ERP、CRM、电商）

### 方式三：数据库直连（最高性能）

```
业务系统直连 JetAuth 同一个数据库 → 本地 Casbin 引擎 + xorm-adapter
```

| 优点 | 缺点 |
|------|------|
| 实时读取最新策略 | 需要共享数据库访问权限 |
| 无网络依赖 | 角色继承（g 策略）需自行处理 |
| 极致性能 | 耦合度高 |

**适用**：和 JetAuth 部署在同一环境的核心系统

---

## 六、安全考虑

1. **API 认证**：所有 enforce API 必须携带 Basic Auth（clientId:clientSecret），不可裸调
2. **策略隔离**：每个应用只能查询自己的策略，不能跨应用访问
3. **前端权限非安全屏障**：前端按钮/菜单控制只是体验优化，真正的安全在后端 API 层
4. **敏感操作审计**：权限变更、角色分配等操作必须记录审计日志
5. **最小权限原则**：业务系统 SDK 只获取该应用范围内的策略，不获取全局策略
