# JetAuth 授权管理 — 产品说明文档

## 目录

- [概述](#概述)
- [核心概念](#核心概念)
- [架构设计](#架构设计)
- [快速开始：接入业务系统权限管理](#快速开始接入业务系统权限管理)
- [权限模型详解](#权限模型详解)
- [推荐模型：ERP/CRM 业务系统](#推荐模型erpcrm-业务系统)
- [权限三层架构](#权限三层架构)
- [API 参考](#api-参考)
- [SDK 集成](#sdk-集成)
- [内部工作原理](#内部工作原理)
- [已知限制](#已知限制)

---

## 概述

JetAuth 的授权管理模块基于 [Casbin](https://casbin.org/) 引擎，为业务系统提供集中式的权限管理能力。业务系统通过 SDK 或 API 调用 JetAuth 进行权限判断，无需自行实现权限引擎。

**核心价值：一套规则，两端消费**
- 后端 API 中间件调用 `enforce` 拦截无权请求（安全屏障）
- 前端登录后批量查询用户权限，控制按钮/菜单显示（体验优化）

---

## 核心概念

| 概念 | 说明 | 类比 |
|------|------|------|
| **应用 (Application)** | 一个需要接入认证和权限管理的业务系统 | 一个网站/App |
| **模型 (Model)** | 定义权限规则的结构和匹配方式（ACL/RBAC/ABAC） | SQL 表结构 |
| **适配器 (Adapter)** | 定义策略存储的位置（哪个数据库、哪张表） | 数据库连接 |
| **执行器 (Enforcer)** | 模型 + 适配器的组合体，可直接做权限判断 | 数据库连接 + 表结构 = 可查询 |
| **角色 (Role)** | 用户分组，可继承其他角色的权限 | 部门/职位 |
| **权限 (Permission)** | 具体的授权规则：谁可以对什么资源做什么操作 | 门禁卡的权限配置 |

### 概念关系图

```
Organization（组织）
  └── Application（应用/业务系统）
        ├── Model（模型）──────→ Enforcer（执行器）←── Adapter（适配器）
        ├── Role（角色）
        │     └── Users（用户）
        └── Permission（权限）
              ├── 主体：Users + Roles
              ├── 资源：Resources
              ├── 操作：Actions
              └── 效果：Allow / Deny
```

---

## 架构设计

### 两套独立的权限引擎

JetAuth 内部有两套权限检查系统，服务于不同场景：

| | JetAuth 内部权限 | 业务系统权限 |
|---|---|---|
| **用途** | 控制谁能登录哪个应用、谁能调 JetAuth 管理 API | 控制业务系统中谁能做什么 |
| **代码路径** | `authz.go` → `Enforcer.Enforce()` | `permission_enforcer.go` → `getPermissionEnforcer()` |
| **模型** | `api-model-built-in`（6 字段路由级 ACL） | 用户自定义或默认 RBAC |
| **触发方式** | 每次访问 JetAuth API 自动触发 | 业务系统主动调用 `/api/enforce` |
| **Effect 字段** | 生效 | **不生效**（需在模型中定义 allow/deny） |
| **ResourceType** | `Application` / `API` 有特殊含义 | 仅分类标签，不影响判断 |

> **重要**：Permission 表单中的 "效果"（Effect）字段和 "资源类型"（ResourceType）字段仅对 JetAuth 内部权限检查生效。外部业务系统通过 `/api/enforce` 调用时，allow/deny 逻辑由模型的 `policy_effect` 定义决定。

### 内部权限检查流程

```
用户请求 JetAuth API
  → authz.go:IsAllowed()
    → GlobalAdmin（built-in 组织用户）？ → 直接放行
    → OrgAdmin（组织管理员）且同组织？ → 直接放行
    → Enforcer.Enforce()         → 内置 ACL 检查（api-model-built-in）
    → CheckApiPermission()       → ResourceType="API" 的权限检查
    → CheckLoginPermission()     → ResourceType="Application" 的权限检查
```

---

## 快速开始：接入业务系统权限管理

### 方式一：一键创建（推荐）

在 **授权管理** 页面点击「创建应用」，填入应用标识和显示名称后一键创建，系统自动生成：

| 资源 | 命名规则 | 说明 |
|------|---------|------|
| 应用 | `{appName}` | 业务系统在 JetAuth 中的注册 |
| 管理员角色 | `{appName}-admin` | 默认管理员角色，domain 设为应用名 |
| 适配器 | `{appName}-adapter` | 独立策略表 `{app_name}_policy`，同数据库 |
| 默认权限 | `{appName}-access` | 关联模型 + 适配器，Application 类型 |
| 执行器 | `{appName}-enforcer` | 关联模型 + 适配器，供 SDK 调用 |

### 方式二：手动配置

1. **创建应用**：应用管理 → 添加应用，获得 `ClientId` 和 `ClientSecret`
2. **选择或创建模型**：模型管理 → 添加模型（推荐使用 RBAC + keyMatch5，见下文）
3. **创建适配器**：适配器管理 → 添加适配器（建议每个应用独立表）
4. **创建执行器**：执行器管理 → 添加执行器，关联模型和适配器
5. **创建角色**：角色管理 → 添加角色，分配用户
6. **创建权限**：权限管理 → 添加权限，配置资源和操作

### 应用授权详情页

创建完成后，在授权管理概览页点击应用卡片进入详情页，包含 5 个 Tab：

| Tab | 功能 |
|-----|------|
| **概况** | 统计指标 + 模型/适配器配置（可直接切换） |
| **角色** | 该应用的角色列表，点击用户数打开抽屉管理用户 |
| **权限** | 该应用的权限规则，含审批状态 |
| **测试** | Enforce Playground，输入用户/资源/操作即时验证 |
| **集成指南** | 自动填入凭证的 SDK 代码，复制即用 |

---

## 权限模型详解

### 默认内置模型（Model 为空时使用）

```ini
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act, eft, "", permissionId

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act
```

- **RBAC**：支持角色继承（`g = _, _`），用户 → 角色 → 权限
- **精确匹配**：资源和操作必须完全一致
- **适用场景**：简单的应用级权限控制

### 内置模型对比

| 模型 | 字段数 | 特点 | 用途 |
|------|--------|------|------|
| `user-model-built-in` | 3（`sub, obj, act`） | 基础 RBAC | 应用登录权限 |
| `api-model-built-in` | 6（`subOwner, subName, method, urlPath, objOwner, objName`） | 路由级 ACL | JetAuth 内部 API 保护（**不能用于 Permission 系统**） |
| 默认（空） | 6（含 eft + permissionId） | 标准 RBAC | 通用权限 |

### 模型兼容性

Permission 系统对模型有约束（因为需要用 `permissionId` 字段区分不同权限的策略）：

| 字段数 | 结果 |
|--------|------|
| 1~5 | 自动补齐到 6 字段，末尾添加 `permissionId` → **兼容** |
| 6 且第 6 个是 `permissionId` | 直接通过 → **兼容** |
| 6 且第 6 个不是 `permissionId` | **不兼容**（如 `api-model-built-in`） |
| 7+ | **不兼容**，超过上限 |

---

## 推荐模型：ERP/CRM 业务系统

```ini
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))

[matchers]
m = g(r.sub, p.sub) && keyMatch5(r.obj, p.obj) && regexMatch(r.act, p.act)
```

### 相比默认模型的优势

| 特性 | 默认模型 | 推荐模型 |
|------|---------|---------|
| 角色继承 | `g(r.sub, p.sub)` | `g(r.sub, p.sub)`（一样） |
| 资源匹配 | `r.obj == p.obj`（精确） | **`keyMatch5`**（RESTful 路径模式） |
| 操作匹配 | `r.act == p.act`（精确） | **`regexMatch`**（正则匹配） |
| 拒绝策略 | 不支持显式 Deny | **支持** `!some(where (p.eft == deny))` |

### 匹配示例

**keyMatch5 — RESTful 路径匹配：**

| 策略资源 | 请求资源 | 匹配？ |
|---------|---------|--------|
| `/api/orders/{id}` | `/api/orders/123` | 匹配 |
| `/api/users/{uid}/profile` | `/api/users/alice/profile` | 匹配 |
| `/api/*` | `/api/anything/here` | 匹配 |

**regexMatch — 正则操作匹配：**

| 策略操作 | 请求操作 | 匹配？ |
|---------|---------|--------|
| `GET` | `GET` | 匹配 |
| `GET\|POST` | `GET` | 匹配 |
| `.*` | 任何操作 | 匹配 |

### 完整策略示例

```
# 角色继承
g, alice, erp-admin
g, bob, erp-editor
g, erp-editor, erp-viewer        ← 编辑继承只读

# 只读角色
p, erp-viewer, /api/orders/{id}, GET, allow
p, erp-viewer, /api/products/{id}, GET, allow
p, erp-viewer, /api/reports/*, GET, allow

# 编辑角色（继承了只读的 GET）
p, erp-editor, /api/orders/{id}, POST|PUT|DELETE, allow
p, erp-editor, /api/products/{id}, POST|PUT, allow

# 管理员（继承了编辑+只读）
p, erp-admin, /api/*, .*, allow

# 显式禁止 — 编辑不能删产品
p, erp-editor, /api/products/{id}, DELETE, deny
```

---

## 权限三层架构

对于 ERP/CRM 等业务系统，完整的权限控制需要三层：

```
┌──────────────────────────────────────────────────┐
│                  JetAuth 管理                      │
├──────────┬───────────┬───────────────────────────┤
│ 第一层   │ 操作权限   │ Casbin：谁能访问哪个 API    │
│ 第二层   │ 字段权限   │ 字段分组 + Casbin 控制组    │
│ 第三层   │ 数据范围   │ 角色属性 + 应用层过滤       │
└──────────┴───────────┴───────────────────────────┘
```

### 第一层：操作权限（Casbin 管）

控制「谁能访问哪个 API」，通过 `/api/enforce` 判断。

```python
allowed = sdk.enforce("org/alice", "/api/orders/123", "GET")
if not allowed:
    return 403
```

### 第二层：字段权限（Casbin + 应用层）

控制「返回数据中哪些字段可见/可改」。推荐字段分组方案：

```
字段分组（应用层配置）：
├── basic:      id, name, status, createTime
├── financial:  amount, cost, profit, price
├── sensitive:  idCard, phone, salary
└── internal:   notes, auditLog, margin

Casbin 策略（控制到组）：
p, erp-viewer,  /api/orders/{id}#basic,      GET, allow
p, erp-finance, /api/orders/{id}#financial,  GET, allow
p, erp-admin,   /api/orders/{id}#*,          .*, allow
```

应用层根据权限结果过滤返回字段：

```typescript
for (const group of ["basic", "financial", "sensitive", "internal"]) {
    const allowed = await sdk.enforce(user, `${resource}#${group}`, "GET");
    if (allowed) visibleFields.add(...FIELD_GROUPS[group]);
}
return pick(data, [...visibleFields]);
```

### 第三层：数据范围（应用层管）

控制「能看到哪些行的数据」（只看自己 / 看部门 / 看全公司）。

用 Permission 的资源路径编码数据范围：

```
p, sales,         /scope/orders, self, allow        ← 销售只看自己
p, sales-manager, /scope/orders, department, allow  ← 经理看本部门
p, director,      /scope/orders, company, allow     ← 总监看全公司
```

应用层查询时动态加过滤条件：

```typescript
const scope = await getDataScope(user, "/scope/orders");
switch (scope) {
    case "self":       query.where("created_by = ?", user.id); break;
    case "department": query.where("dept_id = ?", user.deptId); break;
    case "company":    /* 不加过滤 */ break;
}
```

> **注意**：同一个 API，不同用户看到不同数据范围，前端无感知。

---

## API 参考

所有 API 支持两种认证方式：

- **Cookie**：用户在 JetAuth 管理后台的登录 session
- **HTTP Basic Auth**：`Authorization: Basic base64(clientId:clientSecret)`，业务系统后端调用

### Enforce — 单次权限判断

```
POST /api/enforce?{filter}
Content-Type: application/json
Authorization: Basic base64(clientId:clientSecret)

Body: ["subject", "object", "action"]
```

**过滤参数（五选一）：**

| 参数 | 说明 | 示例 |
|------|------|------|
| `permissionId` | 指定一条权限 | `org/erp-access` |
| `modelId` | 该模型下所有权限 | `org/rbac-model` |
| `resourceId` | 引用该资源的所有权限 | `erp-system` |
| `enforcerId` | 用预配置的执行器 | `org/erp-enforcer` |
| `owner` | 该组织下所有权限 | `org-name` |

**响应：**

```json
{
    "status": "ok",
    "data": [true],
    "data2": ["org/model/adapter"]
}
```

### BatchEnforce — 批量权限判断

```
POST /api/batch-enforce?permissionId=org/perm-name
Body: [["alice", "res1", "GET"], ["bob", "res2", "POST"]]

Response: { "data": [[true, false]] }
```

### GetAllRoles — 查询用户角色

```
GET /api/get-all-roles?userId=org/alice

Response: { "data": ["erp-admin", "erp-editor"] }
```

### GetAllObjects — 查询用户可访问资源

```
GET /api/get-all-objects?userId=org/alice

Response: { "data": ["erp-system", "/api/orders"] }
```

### GetAllActions — 查询用户可执行操作

```
GET /api/get-all-actions?userId=org/alice

Response: { "data": ["Read", "Write"] }
```

---

## SDK 集成

### Go 后端中间件

```go
import casdoorsdk "github.com/casdoor/casdoor-go-sdk"

func init() {
    casdoorsdk.InitConfig(
        "https://auth.company.com",   // JetAuth 地址
        "your-client-id",             // 应用 ClientId
        "your-client-secret",         // 应用 ClientSecret
        "",                           // Certificate（可选）
        "your-org",                   // 组织名
        "your-app",                   // 应用名
    )
}

func AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        userId := getUserFromJWT(r)
        allowed, _ := casdoorsdk.Enforce(
            "org/permission-name",     // permissionId
            "", "", "", "",
            casdoorsdk.CasbinRequest{userId, r.URL.Path, r.Method},
        )
        if !allowed {
            http.Error(w, "Forbidden", 403)
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

### Python 后端

```python
from casdoor import CasdoorSDK

sdk = CasdoorSDK(
    endpoint="https://auth.company.com",
    client_id="your-client-id",
    client_secret="your-client-secret",
    org_name="your-org",
    application_name="your-app",
)

result = sdk.enforce(
    permission_model_name="permission-name",
    sub="org/alice",
    obj="/api/orders/123",
    act="GET",
)
```

### 前端权限查询

```typescript
// 登录成功后，批量查询当前用户的权限
const resp = await fetch("/api/enforce?owner=your-org", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + btoa("clientId:clientSecret"),
    },
    body: JSON.stringify([userId, resource, action]),
});
const { data } = await resp.json();

// 前端权限判断（纯本地，无延迟）
function canDo(resource: string, action: string): boolean {
    return permissions.some(p =>
        matchResource(p.resource, resource) && p.actions.includes(action)
    );
}

// 按钮级控制
<Button disabled={!canDo("/orders", "DELETE")}>删除订单</Button>

// 菜单级控制
{canDo("/finance/reports", "GET") && <MenuItem>财务报表</MenuItem>}
```

---

## 内部工作原理

### Permission 策略生成

当创建或更新权限时，后端通过笛卡尔积生成 Casbin 策略（`permission_enforcer.go:124-146`）：

```
策略 = (Users ∪ Roles) × Resources × Actions → [sub, obj, act, eft, "", permissionId]
```

示例：Users=[alice], Roles=[editor], Resources=[/api/orders], Actions=[GET, POST]

```
→ ["alice",  "/api/orders", "GET",  "allow", "", "org/perm-name"]
→ ["alice",  "/api/orders", "POST", "allow", "", "org/perm-name"]
→ ["editor", "/api/orders", "GET",  "allow", "", "org/perm-name"]
→ ["editor", "/api/orders", "POST", "allow", "", "org/perm-name"]
```

### 策略存储

- `permissionId` 固定在第 6 位（V5 列），用于按权限过滤策略
- 适配器为空时存入默认表 `permission_rule`
- 适配器不为空时存入适配器指定的表（如 `erp_system_policy`）
- 建议每个应用使用独立的适配器和策略表，避免不同模型结构冲突

### 角色继承（g 策略）

角色继承关系**不持久化到策略表**，而是在每次权限检查时从 Role 表动态构建（`getRuntimeGroupingPolicies`）：

```
Role: erp-editor
  Users: [alice, bob]
  Roles: [erp-viewer]    ← 继承 erp-viewer

→ 运行时生成 g 策略：
  g, alice, erp-editor
  g, bob, erp-editor
  g, erp-editor, erp-viewer
```

### Enforce 调用流程

```
POST /api/enforce?permissionId=org/perm-name
Body: ["org/alice", "/api/orders/123", "GET"]

→ getPermissionEnforcer(permission)
    → setEnforcerModel()      加载 Casbin 模型
    → setEnforcerAdapter()    连接策略表
    → LoadFilteredPolicy()    按 permissionId 过滤加载策略
    → loadRuntimeGroupingPolicies()  动态构建角色继承
→ enforcer.Enforce("org/alice", "/api/orders/123", "GET")
→ 返回 true/false
```

---

## 已知限制

### 1. 无 Enforcer 缓存

每次权限检查都重建 Casbin Enforcer 实例（创建对象 → 查模型 → 查策略 → 构建角色继承 → 判断 → 丢弃）。单次 API 请求可能产生 15-25 次数据库查询。

**影响**：高并发场景下数据库会成为瓶颈。  
**规划**：见 `TODO.md` — Enforcer 内存缓存 / Redis Watcher 方案。

### 2. 模型字段数限制

Permission 系统限制模型 `policy_definition` 最多 6 个字段，第 6 个必须是 `permissionId`。超过 5 个自定义字段的模型不能用于 Permission 系统。

### 3. 审批流半成品

- `State` 字段（Approved/Pending）后端会检查，Pending 权限不生效
- 但无审批权限控制、无通知、无专用审批 API、无状态机校验

### 4. Role 无自定义属性

Role 结构体没有 `properties` 字段，无法存储数据范围等业务元数据。当前替代方案：用 Permission 资源路径编码数据范围。

### 5. 前端权限控制非安全屏障

前端的按钮隐藏、菜单控制只是用户体验优化，真正的安全屏障在后端 API 层。用户可以通过浏览器控制台绕过前端限制。
