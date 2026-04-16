# 业务系统权限模块 — 详细架构设计

## 设计原则

1. **不碰已有代码** — 系统自身权限（check.go、permission_enforcer.go、authz.go）完全不动
2. **复用身份数据** — User、Organization、Group、Application 直接引用，不复制
3. **原生 Casbin** — 不经过 GetBuiltInModel 改造，策略格式和 Casbin SDK 100% 兼容
4. **应用级隔离** — 每个应用独立的角色、权限、策略表、Enforcer 缓存
5. **遵循现有模式** — 使用 Beego 控制器 + XORM ORM + owner/name 复合主键

---

## 一、数据表设计

### 1.1 biz_app_config（应用权限配置）

每个接入业务权限的应用一条记录，关联模型和策略表。

```sql
CREATE TABLE biz_app_config (
    owner          VARCHAR(100) NOT NULL,  -- 组织名（复用 Organization）
    app_name       VARCHAR(100) NOT NULL,  -- 应用名（引用 Application.name）
    created_time   VARCHAR(100),
    updated_time   VARCHAR(100),
    display_name   VARCHAR(100),
    description    TEXT,
    model_text     TEXT NOT NULL,           -- Casbin 模型文本（直接存，不引用 model 表）
    policy_table   VARCHAR(100) NOT NULL,   -- 策略表名（如 biz_erp_policy）
    is_enabled     TINYINT DEFAULT 1,
    PRIMARY KEY (owner, app_name)
);
```

**为什么模型文本直接存而不引用 model 表？**
- 业务系统的模型和系统自身的 model 表完全无关
- 避免和 GetBuiltInModel 的 6 字段限制产生交集
- 模型文本修改时可以直接做策略兼容性校验

### 1.2 biz_role（业务角色）

```sql
CREATE TABLE biz_role (
    owner          VARCHAR(100) NOT NULL,  -- 组织名
    app_name       VARCHAR(100) NOT NULL,  -- 所属应用
    name           VARCHAR(100) NOT NULL,  -- 角色名
    created_time   VARCHAR(100),
    display_name   VARCHAR(100),
    description    TEXT,
    users          TEXT,                    -- JSON 数组 ["org/alice", "org/bob"]（引用 User）
    groups         TEXT,                    -- JSON 数组 ["org/sales-dept"]（引用 Group）
    roles          TEXT,                    -- JSON 数组 ["admin"]（同应用内的子角色，不带 app 前缀）
    properties     TEXT,                    -- JSON 对象 {"dataScope":{"orders":"department"}}
    is_enabled     TINYINT DEFAULT 1,
    PRIMARY KEY (owner, app_name, name)
);
```

**和现有 Role 表的区别：**

| | 现有 role 表 | 新 biz_role 表 |
|---|---|---|
| 主键 | owner + name | owner + **app_name** + name |
| 应用维度 | 无 | 有（同一用户在不同应用可有不同角色） |
| properties | 无 | 有（数据范围、功能开关等） |
| 用途 | 系统自身权限 + Permission 系统 | 仅业务系统权限 |

### 1.3 biz_permission（业务权限规则）

```sql
CREATE TABLE biz_permission (
    owner          VARCHAR(100) NOT NULL,  -- 组织名
    app_name       VARCHAR(100) NOT NULL,  -- 所属应用
    name           VARCHAR(100) NOT NULL,  -- 权限名
    created_time   VARCHAR(100),
    display_name   VARCHAR(100),
    description    TEXT,
    users          TEXT,                    -- JSON 数组（直接授权的用户）
    roles          TEXT,                    -- JSON 数组（通过角色授权，引用 biz_role.name）
    resources      TEXT,                    -- JSON 数组 ["/api/orders/{id}", "/api/reports/*"]
    actions        TEXT,                    -- JSON 数组 ["GET", "POST|PUT"]
    effect         VARCHAR(20) DEFAULT 'Allow',  -- Allow / Deny
    is_enabled     TINYINT DEFAULT 1,
    -- 审批流
    submitter      VARCHAR(100),
    approver       VARCHAR(100),
    approve_time   VARCHAR(100),
    state          VARCHAR(20) DEFAULT 'Approved',
    PRIMARY KEY (owner, app_name, name)
);
```

**和现有 permission 表的区别：**

| | 现有 permission 表 | 新 biz_permission 表 |
|---|---|---|
| 主键 | owner + name | owner + **app_name** + name |
| model 字段 | 有（引用 model 表） | 无（模型在 biz_app_config 上统一管理） |
| adapter 字段 | 有（引用 adapter 表） | 无（策略表在 biz_app_config 上统一管理） |
| resourceType | 有（Application/API/Custom/TreeNode） | 无（业务系统只有自定义资源） |
| domains 字段 | 有 | 无（如需多租户在模型层定义） |
| effect | 仅对内部生效 | **对业务系统生效**（写入策略的 eft 字段） |

### 1.4 biz_{app}_policy（每应用独立策略表）

由 Casbin xorm-adapter 自动创建和管理，表名从 `biz_app_config.policy_table` 读取。

```sql
-- 例：biz_erp_policy（3 字段模型自动生成）
CREATE TABLE biz_erp_policy (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    ptype  VARCHAR(100),   -- "p" 或 "g"
    v0     VARCHAR(100),   -- sub
    v1     VARCHAR(100),   -- obj / role
    v2     VARCHAR(100),   -- act
    v3     VARCHAR(100),   -- (可选)
    v4     VARCHAR(100),   -- (可选)
    v5     VARCHAR(100)    -- (可选)
);
```

**策略格式完全由模型决定**，无 permissionId 注入，和 Casbin SDK 100% 兼容。

---

## 二、策略生成逻辑

### 和现有系统的对比

```
现有 Permission 系统：
  模型 p = sub, obj, act（3 字段）
  → GetBuiltInModel 魔改为 p = sub, obj, act, eft, "", permissionId（6 字段）
  → 策略写入 permission_rule：[alice, /orders, GET, allow, "", org/perm-name]
  → 按 V5=permissionId 过滤加载

新 Business Permission 系统：
  模型 p = sub, obj, act（3 字段）
  → 原样使用（不改造）
  → 策略写入 biz_erp_policy：[alice, /orders, GET]
  → 全量加载（每应用独立表，不需要 permissionId 隔离）
```

### 策略生成流程

```go
// object/biz_permission_engine.go（新文件）

func SyncAppPolicies(owner, appName string) error {
    // 1. 读取应用配置
    config := GetBizAppConfig(owner, appName)
    
    // 2. 用原生 Casbin 模型（不经过 GetBuiltInModel）
    m, _ := model.NewModelFromString(config.ModelText)
    
    // 3. 连接应用独立的策略表
    a, _ := xormadapter.NewAdapterByEngineWithTableName(ormer.Engine, config.PolicyTable, "")
    
    // 4. 创建 Enforcer
    e, _ := casbin.NewEnforcer(m, a)
    e.ClearPolicy()
    
    // 5. 加载所有启用的权限规则
    permissions := GetBizPermissions(owner, appName)
    
    // 6. 生成 p 策略（笛卡尔积）
    for _, perm := range permissions {
        if !perm.IsEnabled || perm.State != "Approved" { continue }
        subjects := append(perm.Users, perm.Roles...)  // 用户 + 角色
        for _, sub := range subjects {
            for _, res := range perm.Resources {
                for _, act := range perm.Actions {
                    if perm.Effect == "Deny" {
                        e.AddNamedPolicy("p", sub, res, act, "deny")
                    } else {
                        e.AddNamedPolicy("p", sub, res, act, "allow")
                    }
                }
            }
        }
    }
    
    // 7. 生成 g 策略（角色继承）
    roles := GetBizRoles(owner, appName)
    for _, role := range roles {
        for _, user := range role.Users {
            e.AddGroupingPolicy(user, role.Name)
        }
        for _, subRole := range role.Roles {
            e.AddGroupingPolicy(subRole, role.Name)
        }
    }
    
    // 8. 持久化到策略表
    e.SavePolicy()
    
    // 9. 刷新缓存
    refreshEnforcerCache(owner, appName)
    
    return nil
}
```

### 策略同步触发时机

| 操作 | 触发 |
|------|------|
| 创建/更新/删除 biz_permission | SyncAppPolicies |
| 创建/更新/删除 biz_role（用户变更） | SyncAppPolicies |
| 修改 biz_app_config（模型变更） | SyncAppPolicies |
| 手动触发 | POST /api/biz-sync-policies |

---

## 三、Enforcer 缓存设计

```go
// object/biz_enforcer_cache.go（新文件）

var bizEnforcerCache sync.Map  // key: "owner/appName" → value: *casbin.Enforcer

func GetBizEnforcer(owner, appName string) (*casbin.Enforcer, error) {
    key := owner + "/" + appName
    
    // 命中缓存
    if cached, ok := bizEnforcerCache.Load(key); ok {
        return cached.(*casbin.Enforcer), nil
    }
    
    // 未命中：构建 Enforcer
    config := GetBizAppConfig(owner, appName)
    m, _ := model.NewModelFromString(config.ModelText)
    a, _ := xormadapter.NewAdapterByEngineWithTableName(ormer.Engine, config.PolicyTable, "")
    e, _ := casbin.NewEnforcer(m, a)
    
    // 缓存
    bizEnforcerCache.Store(key, e)
    return e, nil
}

func refreshEnforcerCache(owner, appName string) {
    key := owner + "/" + appName
    bizEnforcerCache.Delete(key)  // 下次访问时重建
}
```

**性能对比：**

| | 现有 Permission 系统 | 新 Business Permission 系统 |
|---|---|---|
| 每次 enforce | 重建 Enforcer（3-5 次 DB 查询） | 内存缓存命中（0 次 DB） |
| 单次延迟 | 5-20ms | **0.01-0.1ms** |
| 万级并发 | 数据库先挂 | 轻松承载 |

---

## 四、API 设计

### 4.1 应用配置 CRUD

```
POST   /api/biz-add-app-config          创建应用权限配置
GET    /api/biz-get-app-config?id=owner/appName  获取配置
POST   /api/biz-update-app-config?id=owner/appName  更新配置
POST   /api/biz-delete-app-config        删除配置
GET    /api/biz-get-app-configs?owner=org  获取组织下所有配置
```

### 4.2 业务角色 CRUD

```
POST   /api/biz-add-role                 创建角色
GET    /api/biz-get-role?owner=org&app=erp&name=admin  获取角色
POST   /api/biz-update-role?owner=org&app=erp&name=admin  更新角色
POST   /api/biz-delete-role              删除角色
GET    /api/biz-get-roles?owner=org&app=erp  获取应用下所有角色
```

### 4.3 业务权限 CRUD

```
POST   /api/biz-add-permission           创建权限
GET    /api/biz-get-permission?owner=org&app=erp&name=order-read  获取权限
POST   /api/biz-update-permission?owner=org&app=erp&name=order-read  更新
POST   /api/biz-delete-permission        删除权限
GET    /api/biz-get-permissions?owner=org&app=erp  获取应用下所有权限
```

### 4.4 权限判断（核心）

```
POST   /api/biz-enforce
Query: appId=owner/appName（必填）
Auth:  Basic clientId:clientSecret
Body:  ["org/alice", "/api/orders/123", "GET"]

Response:
{
    "status": "ok",
    "data": true
}
```

```
POST   /api/biz-batch-enforce
Query: appId=owner/appName
Body:  [["org/alice", "/orders/123", "GET"], ["org/bob", "/orders/456", "DELETE"]]

Response:
{
    "status": "ok",
    "data": [true, false]
}
```

### 4.5 策略拉取（SDK 本地缓存用）

```
GET    /api/biz-get-policies?appId=owner/appName
Auth:  Basic clientId:clientSecret

Response:
{
    "status": "ok",
    "data": {
        "modelText": "[request_definition]\nr = sub, obj, act\n...",
        "policies": [
            ["org/admin", "/api/orders/{id}", "GET|POST|PUT"],
            ["org/viewer", "/api/orders/{id}", "GET"]
        ],
        "groupingPolicies": [
            ["org/alice", "admin"],
            ["org/bob", "viewer"],
            ["editor", "viewer"]
        ],
        "version": "2026-04-16T10:30:00Z"
    }
}
```

**version 字段**：业务系统 SDK 可以轮询 `?since=version`，只在策略变更时才拉取。

### 4.6 用户权限查询

```
GET    /api/biz-get-user-roles?appId=owner/appName&userId=org/alice
Response: { "data": ["admin", "editor"] }

GET    /api/biz-get-user-permissions?appId=owner/appName&userId=org/alice
Response: { 
    "data": {
        "roles": ["admin"],
        "allowedResources": ["/api/orders/{id}", "/api/reports/*"],
        "allowedActions": ["GET", "POST", "PUT", "DELETE"],
        "properties": {"dataScope": {"orders": "department"}}
    }
}
```

### 4.7 策略同步

```
POST   /api/biz-sync-policies?appId=owner/appName
Auth:  管理员 Session 或 Basic Auth

Response: { "status": "ok", "data": {"policyCount": 42, "roleCount": 5} }
```

---

## 五、后端文件结构

```
object/
├── biz_app_config.go           -- 应用权限配置 CRUD
├── biz_role.go                 -- 业务角色 CRUD
├── biz_permission.go           -- 业务权限 CRUD
├── biz_permission_engine.go    -- 策略生成 + 同步逻辑
├── biz_enforcer_cache.go       -- Enforcer 内存缓存
└── biz_enforce.go              -- enforce / batch-enforce / 用户权限查询

controllers/
└── biz_permission_api.go       -- 所有 /api/biz-* 端点的控制器

routers/
└── router.go                   -- 新增 biz-* 路由注册（不改已有路由）
```

**和现有文件完全隔离，零冲突。**

---

## 六、前端改造

### 复用的部分

| 组件/页面 | 复用方式 |
|----------|---------|
| 授权管理概览页（应用卡片） | 数据源改为 `biz-get-app-configs` |
| 用户/分组选择器 | 100% 复用现有的 User/Group API |
| 应用选择器 | 复用 Application API |
| StickyEditHeader / FormSection / DataTable | 100% 复用 |
| RoleUserDrawer（用户抽屉） | 改为调 `biz-update-role` API |

### 改造的部分

| 页面 | 改造内容 |
|------|---------|
| 快速创建向导 | 调 `biz-add-app-config`（同时创建配置 + 默认角色 + 默认权限） |
| 概况 Tab | 读 `biz_app_config`，模型文本直接编辑（CodeMirror） |
| 角色 Tab | 读写 `biz_role`，增加 properties 编辑器 |
| 权限 Tab | 读写 `biz_permission`，去掉 ResourceType/Adapter/Model 选择器 |
| 测试 Tab | 调 `biz-enforce`（有缓存，秒级响应） |
| 集成 Tab | 调 `biz-get-policies` 展示策略数据，SDK 代码用新 API |
| 用户权限画像 | 调 `biz-get-user-permissions` |

### 侧边栏结构

```
授权
├── 授权管理          ← 业务系统权限（新系统）
├── ──────────       ← 分割线
├── 角色              ← 系统自身权限（保留）
├── 权限              ← 系统自身权限（保留）
├── 模型              ← 系统自身权限（保留）
├── 适配器            ← 系统自身权限（保留）
└── 执行器            ← 系统自身权限（保留）
```

---

## 七、SDK 模板设计

### Go SDK

```go
package jetauth

type Client struct {
    enforcer     *casbin.Enforcer
    endpoint     string
    clientId     string
    clientSecret string
    appId        string
    version      string
    mu           sync.RWMutex
}

// 初始化：拉取策略，构建本地 Enforcer
func NewClient(endpoint, clientId, clientSecret, appId string) (*Client, error)

// 权限判断（纯内存，<0.1ms）
func (c *Client) CanAccess(userId, resource, action string) bool

// 批量判断
func (c *Client) BatchCheck(requests [][]string) []bool

// 获取用户角色
func (c *Client) GetUserRoles(userId string) []string

// 获取用户属性（数据范围等）
func (c *Client) GetUserProperties(userId string) map[string]interface{}

// 刷新策略（手动触发或定时轮询）
func (c *Client) Refresh() error

// 启动自动刷新（后台 goroutine）
func (c *Client) StartAutoRefresh(interval time.Duration)
```

### 业务系统集成示例

```go
func main() {
    // 一行初始化
    auth, _ := jetauth.NewClient(
        "https://auth.company.com",
        "erp-client-id",
        "erp-client-secret", 
        "jetems1/erp-system",
    )
    auth.StartAutoRefresh(30 * time.Second)

    // 中间件
    r.Use(func(c *gin.Context) {
        userId := getUserFromToken(c)
        if !auth.CanAccess(userId, c.Request.URL.Path, c.Request.Method) {
            c.AbortWithStatus(403)
            return
        }
        c.Next()
    })
}
```

---

## 八、实施路径

### 第一步：后端核心（1-2 天）

```
1. 创建 3 张表的 Go 结构体 + XORM 自动建表
   - biz_app_config.go
   - biz_role.go  
   - biz_permission.go

2. 实现策略引擎
   - biz_permission_engine.go（SyncAppPolicies）
   - biz_enforcer_cache.go（缓存）

3. 实现 API 端点
   - biz_permission_api.go（控制器）
   - router.go（注册路由）

4. 实现 enforce
   - biz_enforce.go（使用缓存的 Enforcer）
```

### 第二步：前端适配（1-2 天）

```
1. 新增 BizBackend.ts（所有 biz-* API 的前端封装）
2. 改造授权管理概览页（数据源切换到 biz-*）
3. 改造应用详情页各 Tab
4. 改造快速创建向导
```

### 第三步：SDK + 集成（1 天）

```
1. Go SDK 模板
2. 集成 Tab 代码生成
3. 策略轮询机制
```

---

## 九、迁移策略

对于已用现有 Permission 系统配置的应用（如 erp-system-access），提供一键迁移：

```
POST /api/biz-migrate-from-permission?appName=erp-system&owner=jetems1

1. 读取 permission 表中 resources 包含 erp-system 的权限
2. 读取关联的 role
3. 创建 biz_app_config（使用默认 RBAC 模型）
4. 创建对应的 biz_role（转换 users/groups/roles）
5. 创建对应的 biz_permission（转换 resources/actions/effect）
6. 同步策略到新表
7. 返回迁移报告
```

迁移后旧数据不删除，两套并行运行，验证无误后可手动清理。
