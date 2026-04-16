# JetAuth 授权管理 — 产品说明文档

## 目录

- [概述](#概述)
- [核心概念](#核心概念)
- [架构设计](#架构设计)
- [快速开始：接入业务系统权限管理（Biz 模块）](#快速开始接入业务系统权限管理biz-模块)
- [应用授权详情页](#应用授权详情页)
- [角色编辑页](#角色编辑页)
- [权限编辑页](#权限编辑页)
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

### 两套业务权限系统

JetAuth 提供两套面向业务系统的权限管理方案：

| | 旧版 Permission 系统 | **新版 Biz 模块（推荐）** |
|---|---|---|
| **代码路径** | `permission_enforcer.go` | `biz_permission_engine.go` |
| **适用场景** | JetAuth 内部权限、已有集成 | **新业务系统接入（推荐）** |
| **模型存储** | 引用 Model 表 | 直接存储在 BizAppConfig.modelText |
| **字段限制** | 最多 6 字段，第 6 个必须是 permissionId | **无限制**，原生 Casbin 模型 |
| **应用隔离** | 通过 Adapter 表名区分 | owner + appName 复合主键天然隔离 |
| **缓存** | 无（每次重建 Enforcer） | **内存缓存**（sync.Map + singleflight）+ 可选 Redis |
| **角色属性** | 无 properties 字段 | **有** properties（JSON，存储 dataScope 等） |
| **策略同步** | 自动（CRUD 时触发） | 自动 + 手动 sync 按钮 |

> **建议**：新业务系统统一使用 Biz 模块。旧版 Permission 系统仍然可用，已有集成无需迁移。

---

## 核心概念

### 旧版 Permission 系统概念

| 概念 | 说明 | 类比 |
|------|------|------|
| **应用 (Application)** | 一个需要接入认证和权限管理的业务系统 | 一个网站/App |
| **模型 (Model)** | 定义权限规则的结构和匹配方式（ACL/RBAC/ABAC） | SQL 表结构 |
| **适配器 (Adapter)** | 定义策略存储的位置（哪个数据库、哪张表） | 数据库连接 |
| **执行器 (Enforcer)** | 模型 + 适配器的组合体，可直接做权限判断 | 数据库连接 + 表结构 = 可查询 |
| **角色 (Role)** | 用户分组，可继承其他角色的权限 | 部门/职位 |
| **权限 (Permission)** | 具体的授权规则：谁可以对什么资源做什么操作 | 门禁卡的权限配置 |

### 新版 Biz 模块概念

| 概念 | 说明 | 与旧版的区别 |
|------|------|-------------|
| **BizAppConfig** | 业务应用的权限配置，包含模型文本和策略表名 | 取代 Model + Adapter + Enforcer 三件套，一个对象搞定 |
| **BizRole** | 业务角色，支持用户分配、角色继承和自定义属性 | 增加了 `properties`（JSON）字段，可存储 dataScope、features 等业务元数据 |
| **BizPermission** | 业务权限规则，直接使用 Casbin 原生字段 | 无 permissionId 注入，无字段数限制；权限按 owner+appName 天然隔离 |

### Biz 模块概念关系图

```
Organization（组织/owner）
  └── BizAppConfig（业务应用配置）
        ├── modelText（Casbin 模型文本，直接存储）
        ├── policyTable（策略表名）
        ├── BizRole（角色）
        │     ├── Users（用户列表）
        │     ├── Roles（子角色，同应用内继承）
        │     └── Properties（JSON，dataScope/features 等）
        └── BizPermission（权限）
              ├── Users + Roles → 主体
              ├── Resources → 资源
              ├── Actions → 操作
              ├── Effect → Allow / Deny
              └── State → Approved / Pending / Rejected
```

### 旧版概念关系图（仍然有效）

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

### 三套独立的权限引擎

JetAuth 内部有三套权限检查系统，服务于不同场景：

| | JetAuth 内部权限 | 旧版 Permission 系统 | **新版 Biz 模块** |
|---|---|---|---|
| **用途** | 控制谁能登录哪个应用、谁能调管理 API | 控制业务系统中谁能做什么 | **控制业务系统中谁能做什么（推荐）** |
| **代码路径** | `authz.go` → `Enforcer.Enforce()` | `permission_enforcer.go` → `getPermissionEnforcer()` | `biz_enforcer_cache.go` → `GetBizEnforcer()` |
| **模型来源** | `api-model-built-in`（6 字段路由级 ACL） | 引用 Model 表 + GetBuiltInModel 6 字段补齐 | **直接存储在 BizAppConfig.modelText，原生 Casbin** |
| **触发方式** | 每次访问 JetAuth API 自动触发 | 业务系统主动调用 `/api/enforce` | 业务系统主动调用 `/api/biz-enforce` |
| **应用隔离** | 全局一套 | 通过 Adapter 策略表名区分 | **owner + appName 复合主键天然隔离** |
| **Enforcer 缓存** | 有（全局单例） | **无**（每次重建） | **有**（sync.Map + singleflight + 可选 Redis） |
| **字段限制** | 固定 6 字段 | 最多 6 字段，第 6 个必须是 permissionId | **无限制** |

> **重要**：旧版 Permission 表单中的 "效果"（Effect）字段和 "资源类型"（ResourceType）字段仅对 JetAuth 内部权限检查生效。外部业务系统通过 `/api/enforce` 调用时，allow/deny 逻辑由模型的 `policy_effect` 定义决定。Biz 模块则直接使用 BizPermission.Effect 字段生成带 eft 的策略。

### JetAuth 内部权限检查流程

```
用户请求 JetAuth API
  → authz.go:IsAllowed()
    → GlobalAdmin（built-in 组织用户）？ → 直接放行
    → OrgAdmin（组织管理员）且同组织？ → 直接放行
    → Enforcer.Enforce()         → 内置 ACL 检查（api-model-built-in）
    → CheckApiPermission()       → ResourceType="API" 的权限检查
    → CheckLoginPermission()     → ResourceType="Application" 的权限检查
```

### Biz 模块权限检查流程

```
业务系统请求 /api/biz-enforce?appId=org/my-app
Body: ["alice", "/api/orders/123", "GET"]

  → GetBizEnforcer(owner, appName)
    → 检查内存缓存（sync.Map）
    → 缓存命中 → 直接使用
    → 缓存未命中 → singleflight 防重入
      → 尝试 Redis 缓存 → 命中则从 Redis 数据重建 Enforcer
      → Redis 也未命中 → 从 DB 加载 BizAppConfig，buildBizEnforcer()
      → 存入内存缓存 + 写回 Redis
  → enforcer.Enforce("alice", "/api/orders/123", "GET")
  → 返回 true / false
```

---

## 快速开始：接入业务系统权限管理（Biz 模块）

### 创建业务应用配置

在 **授权管理** 页面点击「创建应用」进入向导：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 选择已有应用 | 从 Application 列表中选择业务系统 |
| 2 | 配置 Casbin 模型 | 默认预填 RBAC 模型，可自定义修改 |
| 3 | 设置策略表名 | 如 `my_app_policy`，留空则使用默认表 |

点击确认后，系统创建一个 **BizAppConfig** 记录，即可开始配置角色和权限。

> 与旧版「一键创建」的区别：Biz 模块只创建一个 BizAppConfig，**不需要** 单独创建 Adapter、Enforcer、Permission 等实体。模型文本直接存储在 BizAppConfig 中。

### 旧版创建方式（仍然可用）

#### 一键创建

在授权管理页面使用旧版创建流程，系统自动生成：

| 资源 | 命名规则 | 说明 |
|------|---------|------|
| 应用 | `{appName}` | 业务系统在 JetAuth 中的注册 |
| 管理员角色 | `{appName}-admin` | 默认管理员角色，domain 设为应用名 |
| 适配器 | `{appName}-adapter` | 独立策略表 `{app_name}_policy`，同数据库 |
| 默认权限 | `{appName}-access` | 关联模型 + 适配器，Application 类型 |
| 执行器 | `{appName}-enforcer` | 关联模型 + 适配器，供 SDK 调用 |

#### 手动配置

1. **创建应用**：应用管理 → 添加应用，获得 `ClientId` 和 `ClientSecret`
2. **选择或创建模型**：模型管理 → 添加模型（推荐使用 RBAC + keyMatch5）
3. **创建适配器**：适配器管理 → 添加适配器（建议每个应用独立表）
4. **创建执行器**：执行器管理 → 添加执行器，关联模型和适配器
5. **创建角色**：角色管理 → 添加角色，分配用户
6. **创建权限**：权限管理 → 添加权限，配置资源和操作

---

## 应用授权详情页

创建完成后，在授权管理概览页点击应用卡片进入详情页，包含 5 个 Tab：

| Tab | 功能 |
|-----|------|
| **概况** | 模型文本（只读显示）、策略表名、同步策略按钮（触发 biz-sync-policies） |
| **角色** | BizRole 列表（DataTable），点击进入独立的角色编辑页 |
| **权限** | BizPermission 列表（DataTable），根据模型 policy_definition 动态显示字段列 |
| **测试** | biz-enforce 测试工具，输入请求参数即时验证权限判断结果 |
| **集成指南** | 自动填入凭证的 biz-get-policies + SDK 代码，复制即用 |

### 概况 Tab

- **模型文本**：显示 BizAppConfig.modelText 的内容，当前为只读（编辑功能计划中）
- **策略表名**：显示 BizAppConfig.policyTable
- **同步策略**：点击按钮手动触发 `SyncAppPolicies`，重新生成所有 Casbin 策略并刷新缓存

### 测试 Tab

输入 Casbin 请求参数（如 `["alice", "/api/orders/123", "GET"]`），调用 `biz-enforce` API，返回 `true` / `false`。

### 集成指南 Tab

展示调用 `biz-get-policies` 和 `biz-enforce` 的 SDK 代码示例，自动填入当前应用的 appId 和凭证。

---

## 角色编辑页

点击角色列表中的角色名进入独立的角色编辑页，包含以下部分：

### 基本信息

| 字段 | 说明 |
|------|------|
| name | 角色标识（创建后不可修改） |
| displayName | 显示名称 |
| description | 角色描述 |
| isEnabled | 是否启用（禁用的角色不生成策略） |

### 用户分配

以表格形式展示当前角色的用户列表，支持：
- **添加用户**：从组织用户列表中选择
- **移除用户**：从角色中移除用户

### 角色继承

配置当前角色继承的子角色（同一应用内），对应 Casbin 的 `g` 策略：

```
BizRole: editor
  Roles: [viewer]

→ 生成 g 策略：g, viewer, editor
→ editor 自动继承 viewer 的所有权限
```

### 自定义属性（Properties）

JSON 编辑器，用于存储业务元数据，例如：

```json
{
  "dataScope": "department",
  "features": ["export", "print"],
  "maxApprovalAmount": 50000
}
```

业务系统通过 `biz-get-user-permissions` API 获取用户所有角色的 properties 合集，用于数据范围过滤、功能开关等场景。

---

## 权限编辑页

点击权限列表中的权限名进入独立的权限编辑页。

### 基本信息

| 字段 | 说明 |
|------|------|
| name | 权限标识（创建后不可修改） |
| displayName | 显示名称 |
| effect | `Allow` 或 `Deny`，对应 Casbin 策略中的 eft 字段 |
| state | 审批状态：`Approved` / `Pending` / `Rejected`（仅 Approved 的权限生效） |
| isEnabled | 是否启用 |

### 动态策略字段

权限编辑页根据模型的 `policy_definition` 动态渲染字段。标准 RBAC 模型 `p = sub, obj, act` 对应的字段映射：

| 模型字段 | UI 字段 | 编辑方式 |
|---------|---------|---------|
| `sub` | 主体（Subjects） | 由 Users + Roles 两部分组成：Users 从组织用户列表选择，Roles 从同应用 BizRole 列表选择 |
| `obj` | 资源（Resources） | 多行文本输入（textarea），每行一个资源路径 |
| `act` | 操作（Actions） | 标签输入（tags）+ 快捷操作按钮（如 GET/POST/PUT/DELETE） |
| `dom` | 域（Domain） | 文本输入（仅当模型包含 domain 时显示） |
| `eft` | 效果（Effect） | Allow/Deny 切换（对应基本信息中的 effect 字段） |

### 审批信息

| 字段 | 说明 |
|------|------|
| submitter | 提交人 |
| approver | 审批人 |
| approveTime | 审批时间 |
| state | 审批状态 |

> 当前审批流为基础实现：后端会检查 `State` 字段，`Pending` 和 `Rejected` 的权限不会生成策略。但暂无完整的审批流转、通知机制和专用审批 API。

---

## 数据校验规则

所有校验在后端执行，前端会展示翻译后的错误信息（支持中英文）。

### 角色校验（创建和更新时）

| 规则 | 说明 | 错误示例 |
|------|------|---------|
| 名称必填 | `name` 不能为空 | "角色名称不能为空" |
| 组织和应用必填 | `owner`、`appName` 不能为空 | "角色的组织和应用名不能为空" |
| 禁止自引用 | 角色不能继承自己 | "角色「admin」不能继承自身" |
| 子角色必须存在 | `roles` 中引用的角色必须存在于同一应用 | "子角色「xyz」在应用 org/app 中不存在" |
| 循环继承检测 | DFS 遍历继承链，检测有向环 | "检测到循环角色继承：admin → editor → viewer → admin" |
| 继承深度限制 | 最大 10 层继承深度 | "角色继承深度超过限制（10），当前深度：12" |
| Properties 格式 | 非空时必须是合法 JSON | "角色属性必须是合法的 JSON 格式" |
| 自动去重 | Users 和 Roles 数组自动去除重复项和空值 | （静默处理，不报错） |

### 角色删除校验

| 规则 | 说明 | 错误示例 |
|------|------|---------|
| 不能删除被继承的角色 | 如果其他角色的 `roles` 字段引用了该角色，拒绝删除 | "无法删除角色「viewer」：角色「editor」正在继承该角色" |
| 不能删除被权限引用的角色 | 如果权限的 `roles` 字段引用了该角色，拒绝删除 | "无法删除角色「viewer」：权限「order-read」正在引用该角色" |
| 有用户的角色可删除 | 允许删除，但前端弹出警告提示 | "该角色下有 3 个用户，删除后他们将失去该角色关联的所有权限。" |

> **设计原则**：角色被引用时禁止删除（强约束），角色有用户时允许删除但警告（弱约束）。避免"级联删除"带来的不可控风险。

### 权限校验（创建和更新时）

| 规则 | 说明 | 错误示例 |
|------|------|---------|
| 名称必填 | `name` 不能为空 | "权限名称不能为空" |
| 组织和应用必填 | `owner`、`appName` 不能为空 | "权限的组织和应用名不能为空" |
| 至少一个主体 | `users` 和 `roles` 不能同时为空 | "权限必须至少包含一个授权主体（用户或角色）" |
| 至少一个资源 | `resources` 不能为空 | "权限必须至少包含一个资源" |
| 至少一个操作 | `actions` 不能为空 | "权限必须至少包含一个操作" |
| 角色必须存在 | `roles` 中引用的角色必须存在于同一应用 | "角色「xyz」在应用 org/app 中不存在" |
| 效果枚举 | `effect` 必须是 `Allow` 或 `Deny` | "效果必须是「Allow」或「Deny」" |
| 状态枚举 | `state` 必须是 `Approved`、`Pending` 或 `Rejected` | "状态必须是「Approved」、「Pending」或「Rejected」" |
| 自动去重 | Users、Roles、Resources、Actions 数组自动去重去空 | （静默处理，不报错） |

### 模型修改校验（概况 Tab 编辑模型时）

| 规则 | 说明 |
|------|------|
| 字段结构变化 → 高风险警告 | 如果 `policy_definition` 的字段定义变了（如从 `p = sub, obj, act` 改为 `p = sub, dom, obj, act`），弹出详细警告：所有策略将重建、现有权限可能不兼容、enforce 可能全部返回拒绝 |
| 仅 matcher/effect 变化 → 低风险确认 | 字段不变时仅提示"将触发策略重新同步" |
| 禁用开关 | 关闭后该应用的所有 `biz-enforce` 调用立即返回错误 |

---

## 权限模型详解

### Biz 模块模型（推荐）

Biz 模块使用原生 Casbin 模型，无任何字段限制。默认预填的 RBAC 模型：

```ini
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act
```

模型文本直接存储在 `BizAppConfig.modelText` 中，不引用 Model 表。支持任意 Casbin 模型结构，包括：
- 多 policy_definition（`p = sub, obj, act, eft`）
- ABAC 匹配器（`r.sub.Age > 18`）
- 多 role_definition（`g = _, _` 和 `g2 = _, _`）
- 自定义函数（`keyMatch5`, `regexMatch` 等）

### 旧版默认内置模型（Model 为空时使用）

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

- 固定 6 字段 policy_definition，最后一个字段是 `permissionId`
- 用于按权限过滤策略（一个策略表存多个 Permission 的策略）

### 内置模型对比

| 模型 | 字段数 | 特点 | 用途 |
|------|--------|------|------|
| `user-model-built-in` | 3（`sub, obj, act`） | 基础 RBAC | 应用登录权限 |
| `api-model-built-in` | 6（`subOwner, subName, method, urlPath, objOwner, objName`） | 路由级 ACL | JetAuth 内部 API 保护（**不能用于 Permission 系统**） |
| 旧版默认（空） | 6（含 eft + permissionId） | 标准 RBAC | 旧版通用权限 |
| **Biz 默认** | **3**（`sub, obj, act`） | **原生 RBAC** | **Biz 模块推荐默认** |

### 旧版模型兼容性

旧版 Permission 系统对模型有约束（因为需要用 `permissionId` 字段区分不同权限的策略）：

| 字段数 | 结果 |
|--------|------|
| 1~5 | 自动补齐到 6 字段，末尾添加 `permissionId` → **兼容** |
| 6 且第 6 个是 `permissionId` | 直接通过 → **兼容** |
| 6 且第 6 个不是 `permissionId` | **不兼容**（如 `api-model-built-in`） |
| 7+ | **不兼容**，超过上限 |

> Biz 模块没有这些限制。模型文本原样传递给 Casbin，不做任何字段补齐或改写。

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

### 第一层：操作权限（Casbin enforce）

控制「谁能访问哪个 API」。这是最基础的一层，直接用 `biz-enforce` 判断。

**JetAuth 管什么**：存储和判断权限规则（谁 + 什么资源 + 什么操作 = 允许/拒绝）

**业务系统做什么**：在 API 中间件中调用 enforce，拒绝无权请求

```
请求流程：
  用户请求 GET /api/orders/123
    → 业务系统中间件提取 userId
    → 调用 JetAuth: biz-enforce("org/erp", ["org/alice", "/api/orders/123", "GET"])
    → JetAuth 返回 true/false
    → true → 继续处理请求
    → false → 返回 403
```

**Go 后端集成示例**：

```go
func AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        userId := getUserFromJWT(r)
        allowed, err := bizEnforce(userId, r.URL.Path, r.Method)
        if err != nil || !allowed {
            http.Error(w, "Forbidden", 403)
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

**JetAuth 中对应的配置**：

在授权管理页面创建权限规则：
- 授权主体（sub）：选择角色 `erp-viewer` 或用户 `org/alice`
- 资源（obj）：填写 API 路径，如 `/api/orders/*`
- 操作（act）：填写 HTTP 方法，如 `GET`

---

### 第二层：字段权限（Casbin + 应用层过滤）

控制「返回数据中哪些字段可见/可编辑」。例如：普通员工看订单只能看基本信息，财务人员能看金额字段，管理员能看全部。

**核心思路**：将字段分组，在资源路径中用 `#` 分隔组名，Casbin 的 `keyMatch5` 天然支持匹配。

**JetAuth 管什么**：存储字段组级别的权限规则

**业务系统做什么**：
1. 定义字段分组（哪些字段归哪个组）
2. API 返回数据前，逐组 enforce，过滤掉无权字段

#### 步骤一：业务系统定义字段分组

这一步在**业务系统代码**中完成，不在 JetAuth 中：

```typescript
// 应用层定义（与业务相关，JetAuth 不感知）
const FIELD_GROUPS: Record<string, string[]> = {
  basic:      ["id", "orderNo", "status", "createTime", "customerName"],
  financial:  ["amount", "cost", "profit", "discount", "taxRate"],
  sensitive:  ["idCard", "phone", "bankAccount", "salary"],
  internal:   ["notes", "auditLog", "profitMargin", "internalRemark"],
};
```

#### 步骤二：在 JetAuth 中配置权限规则

在授权管理 → ERP 系统 → 权限 Tab 中创建规则：

| 权限名 | 授权主体 | 资源 | 操作 |
|--------|---------|------|------|
| order-basic-read | erp-viewer | `/api/orders/{id}#basic` | `GET` |
| order-finance-read | erp-finance | `/api/orders/{id}#financial` | `GET` |
| order-sensitive-read | erp-hr | `/api/orders/{id}#sensitive` | `GET` |
| order-all-access | erp-admin | `/api/orders/{id}#*` | `.*` |

生成的 Casbin 策略：
```
p, erp-viewer,  /api/orders/{id}#basic,      GET
p, erp-finance, /api/orders/{id}#financial,  GET
p, erp-hr,      /api/orders/{id}#sensitive,  GET
p, erp-admin,   /api/orders/{id}#*,          .*
```

> `#*` 通过 `keyMatch5` 匹配所有分组名。

#### 步骤三：业务系统 API 中过滤字段

```go
// Go 后端示例
func GetOrder(w http.ResponseWriter, r *http.Request) {
    userId := getUserFromJWT(r)
    orderId := chi.URLParam(r, "id")
    order := db.FindOrder(orderId)

    // 逐组检查权限，收集可见字段
    visibleFields := []string{}
    for group, fields := range FIELD_GROUPS {
        resource := fmt.Sprintf("/api/orders/%s#%s", orderId, group)
        allowed, _ := bizEnforce(userId, resource, "GET")
        if allowed {
            visibleFields = append(visibleFields, fields...)
        }
    }

    // 只返回有权限的字段
    json.NewEncoder(w).Encode(pickFields(order, visibleFields))
}
```

```typescript
// TypeScript 后端示例
app.get("/api/orders/:id", async (req, res) => {
  const userId = req.user.id;
  const order = await db.orders.findById(req.params.id);

  const visibleFields = new Set<string>();
  for (const [group, fields] of Object.entries(FIELD_GROUPS)) {
    const allowed = await bizEnforce(appId, [userId, `/api/orders/${req.params.id}#${group}`, "GET"]);
    if (allowed) fields.forEach(f => visibleFields.add(f));
  }

  res.json(pick(order, [...visibleFields]));
});
```

#### 步骤四：前端控制字段显示

前端不需要知道分组逻辑，只根据 API 返回的字段来渲染：

```typescript
// API 返回什么字段就显示什么字段
const order = await fetch(`/api/orders/${id}`).then(r => r.json());

// 字段不存在 → 自动不渲染
{order.amount !== undefined && <div>金额: {order.amount}</div>}
{order.profit !== undefined && <div>利润: {order.profit}</div>}
```

#### 优化：批量 enforce 减少网络请求

如果字段分组多，逐组 enforce 会产生多次 API 调用。用 `biz-batch-enforce` 一次判断所有分组：

```go
groups := []string{"basic", "financial", "sensitive", "internal"}
requests := make([][]interface{}, len(groups))
for i, g := range groups {
    requests[i] = []interface{}{userId, fmt.Sprintf("/api/orders/%s#%s", orderId, g), "GET"}
}

// 一次请求判断所有分组
results, _ := bizBatchEnforce(appId, requests)
// results = [true, true, false, false]

for i, allowed := range results {
    if allowed {
        visibleFields = append(visibleFields, FIELD_GROUPS[groups[i]]...)
    }
}
```

#### 前端也可以用本地缓存的策略判断

如果已通过 `biz-get-policies` 下载了策略到本地，字段权限判断可以完全在前端完成，不需要额外网络请求：

```typescript
// 前端本地 enforce（零延迟）
const canSeeFinancial = await localEnforcer.enforce(userId, `/api/orders/${id}#financial`, "GET");
const canSeeSensitive = await localEnforcer.enforce(userId, `/api/orders/${id}#sensitive`, "GET");
```

---

### 第三层：数据范围（BizRole Properties + 应用层查询过滤）

控制「能看到哪些行的数据」。例如：销售只看自己的订单，经理看本部门的订单，总监看全公司的订单。

**核心思路**：数据范围不适合用 Casbin enforce（无法枚举所有数据行），而是存储在角色属性（`BizRole.properties`）中，应用层查询时动态加过滤条件。

**JetAuth 管什么**：存储角色的数据范围配置（通过 BizRole 的 `properties` JSON 字段）

**业务系统做什么**：查询前根据数据范围加 WHERE 条件

#### 步骤一：在 JetAuth 中配置角色属性

在授权管理 → ERP 系统 → 角色 Tab → 编辑角色 → 角色属性（JSON）：

```json
// 角色: sales（销售）
{
  "dataScope": {
    "orders": "self",
    "customers": "self"
  }
}

// 角色: sales-manager（销售经理）
{
  "dataScope": {
    "orders": "department",
    "customers": "department",
    "reports": "department"
  }
}

// 角色: director（总监）
{
  "dataScope": {
    "orders": "company",
    "customers": "company",
    "reports": "company"
  }
}
```

数据范围的值由业务系统自定义，常见的：

| 值 | 含义 | SQL 效果 |
|---|---|---|
| `self` | 只看自己创建的 | `WHERE created_by = ?` |
| `department` | 看本部门的 | `WHERE dept_id = ?` |
| `company` | 看全公司的 | 不加过滤 |
| `custom` | 自定义范围 | 由业务系统解释 |

#### 步骤二：业务系统获取用户的数据范围

通过 `biz-get-user-permissions` API 获取用户所有角色属性的合集：

```
GET /api/biz-get-user-permissions?appId=org/erp&userId=org/alice

响应：
{
  "data": {
    "roles": ["sales-manager"],
    "allowedResources": ["/api/orders/*", "/api/reports/*"],
    "allowedActions": ["GET", "POST", "PUT"],
    "properties": {
      "dataScope": {
        "orders": "department",
        "customers": "department",
        "reports": "department"
      }
    }
  }
}
```

> 如果用户有多个角色且数据范围冲突，后端自动取**最后一个角色**的值（last-role-wins）。业务系统可自行实现更复杂的合并策略（如取最大范围）。

#### 步骤三：业务系统查询时加过滤条件

```go
// Go 后端示例
func ListOrders(w http.ResponseWriter, r *http.Request) {
    userId := getUserFromJWT(r)
    user := getUser(userId)

    // 获取用户的数据范围
    permResp := bizGetUserPermissions(appId, userId)
    scope := permResp.Properties["dataScope"].(map[string]interface{})
    orderScope := scope["orders"].(string) // "self" / "department" / "company"

    query := db.Table("orders")
    switch orderScope {
    case "self":
        query = query.Where("created_by = ?", user.ID)
    case "department":
        query = query.Where("dept_id = ?", user.DeptID)
    case "company":
        // 不加过滤，看全部
    }

    var orders []Order
    query.Find(&orders)
    json.NewEncoder(w).Encode(orders)
}
```

```typescript
// TypeScript 后端示例
app.get("/api/orders", async (req, res) => {
  const userId = req.user.id;
  const user = await db.users.findById(userId);

  // 获取数据范围
  const resp = await fetch(
    `${jetauthUrl}/api/biz-get-user-permissions?appId=${appId}&userId=${userId}`,
    { headers: { "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}` } }
  );
  const { data } = await resp.json();
  const orderScope = data.properties?.dataScope?.orders || "self";

  let query = db.orders.createQueryBuilder("order");
  switch (orderScope) {
    case "self":
      query = query.where("order.createdBy = :uid", { uid: user.id });
      break;
    case "department":
      query = query.where("order.deptId = :dept", { dept: user.deptId });
      break;
    case "company":
      break; // 不加过滤
  }

  const orders = await query.getMany();
  res.json(orders);
});
```

#### 性能建议：缓存用户的数据范围

数据范围不需要每次请求都调 API，可以在用户登录时获取一次并缓存到 session/JWT 中：

```go
// 登录成功后，获取并缓存到 JWT claims
func OnLoginSuccess(userId string) string {
    permResp := bizGetUserPermissions(appId, userId)
    claims := jwt.MapClaims{
        "sub": userId,
        "scope": permResp.Properties,  // 数据范围存入 JWT
        "exp": time.Now().Add(2 * time.Hour).Unix(),
    }
    token, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
    return token
}

// 请求时直接从 JWT 读取，不调 API
func getDataScope(r *http.Request, resource string) string {
    claims := getJWTClaims(r)
    scope := claims["scope"].(map[string]interface{})
    dataScope := scope["dataScope"].(map[string]interface{})
    return dataScope[resource].(string)
}
```

---

### 三层配合的完整示例

以下展示一个完整的 ERP 订单接口如何同时应用三层权限：

```go
// GET /api/orders/:id — 获取单个订单详情
func GetOrder(w http.ResponseWriter, r *http.Request) {
    userId := getUserFromJWT(r)
    orderId := chi.URLParam(r, "id")

    // ══ 第一层：操作权限 ══
    allowed, _ := bizEnforce(userId, fmt.Sprintf("/api/orders/%s", orderId), "GET")
    if !allowed {
        http.Error(w, "Forbidden", 403) // 无权访问此 API
        return
    }

    // ══ 第三层：数据范围 ══
    order := db.FindOrder(orderId)
    scope := getDataScope(r, "orders") // 从 JWT 读取
    switch scope {
    case "self":
        if order.CreatedBy != userId { http.Error(w, "Forbidden", 403); return }
    case "department":
        if order.DeptID != getUser(userId).DeptID { http.Error(w, "Forbidden", 403); return }
    case "company":
        // 允许
    }

    // ══ 第二层：字段权限 ══
    groups := []string{"basic", "financial", "sensitive", "internal"}
    requests := make([][]interface{}, len(groups))
    for i, g := range groups {
        requests[i] = []interface{}{userId, fmt.Sprintf("/api/orders/%s#%s", orderId, g), "GET"}
    }
    results, _ := bizBatchEnforce(appId, requests)

    visibleFields := []string{}
    for i, ok := range results {
        if ok { visibleFields = append(visibleFields, FIELD_GROUPS[groups[i]]...) }
    }

    json.NewEncoder(w).Encode(pickFields(order, visibleFields))
}
```

```
alice（销售）请求 GET /api/orders/123：
  第一层 → enforce("org/alice", "/api/orders/123", "GET") → ✓ 允许
  第三层 → dataScope = "self" → 订单是 alice 创建的 → ✓ 通过
  第二层 → basic ✓, financial ✗, sensitive ✗, internal ✗
  → 返回: { id, orderNo, status, createTime, customerName }

bob（财务）请求 GET /api/orders/123：
  第一层 → enforce("org/bob", "/api/orders/123", "GET") → ✓ 允许
  第三层 → dataScope = "company" → ✓ 通过（看全公司）
  第二层 → basic ✓, financial ✓, sensitive ✗, internal ✗
  → 返回: { id, orderNo, status, createTime, customerName, amount, cost, profit }

charlie（管理员）请求 GET /api/orders/123：
  第一层 → enforce("org/charlie", "/api/orders/123", "GET") → ✓ 允许
  第三层 → dataScope = "company" → ✓ 通过
  第二层 → #* 匹配所有组 → basic ✓, financial ✓, sensitive ✓, internal ✓
  → 返回: 全部字段
```

> **前端完全无感知**：同一个接口、同一个页面，不同用户看到不同数据范围和不同字段，前端代码零修改。

---

## API 参考

所有 API 支持两种认证方式：

- **Cookie**：用户在 JetAuth 管理后台的登录 session
- **HTTP Basic Auth**：`Authorization: Basic base64(clientId:clientSecret)`，业务系统后端调用

### Biz 模块 API（推荐）

#### BizAppConfig CRUD（5 个）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/biz-get-app-configs?owner={org}` | 获取组织下所有业务应用配置 |
| GET | `/api/biz-get-app-config?id={owner/appName}` | 获取单个业务应用配置 |
| POST | `/api/biz-add-app-config` | 创建业务应用配置 |
| POST | `/api/biz-update-app-config?id={owner/appName}` | 更新业务应用配置 |
| POST | `/api/biz-delete-app-config` | 删除业务应用配置 |

**AddBizAppConfig 请求体：**

```json
{
  "owner": "my-org",
  "appName": "erp-system",
  "displayName": "ERP 系统",
  "modelText": "[request_definition]\nr = sub, obj, act\n...",
  "policyTable": "erp_system_policy",
  "isEnabled": true
}
```

#### BizRole CRUD（5 个）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/biz-get-roles?owner={org}&app={appName}` | 获取应用下所有角色 |
| GET | `/api/biz-get-role?owner={org}&app={appName}&name={roleName}` | 获取单个角色 |
| POST | `/api/biz-add-role` | 创建角色 |
| POST | `/api/biz-update-role?owner={org}&app={appName}&name={roleName}` | 更新角色 |
| POST | `/api/biz-delete-role` | 删除角色 |

**AddBizRole 请求体：**

```json
{
  "owner": "my-org",
  "appName": "erp-system",
  "name": "editor",
  "displayName": "编辑员",
  "users": ["my-org/alice", "my-org/bob"],
  "roles": ["viewer"],
  "properties": "{\"dataScope\":\"department\",\"features\":[\"export\"]}",
  "isEnabled": true
}
```

#### BizPermission CRUD（5 个）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/biz-get-permissions?owner={org}&app={appName}` | 获取应用下所有权限 |
| GET | `/api/biz-get-permission?owner={org}&app={appName}&name={permName}` | 获取单个权限 |
| POST | `/api/biz-add-permission` | 创建权限 |
| POST | `/api/biz-update-permission?owner={org}&app={appName}&name={permName}` | 更新权限 |
| POST | `/api/biz-delete-permission` | 删除权限 |

**AddBizPermission 请求体：**

```json
{
  "owner": "my-org",
  "appName": "erp-system",
  "name": "order-crud",
  "displayName": "订单增删改查",
  "users": ["my-org/alice"],
  "roles": ["editor"],
  "resources": ["/api/orders/{id}", "/api/orders"],
  "actions": ["GET", "POST", "PUT", "DELETE"],
  "effect": "Allow",
  "state": "Approved",
  "isEnabled": true
}
```

#### 权限判断（2 个）

**biz-enforce — 单次权限判断**

```
POST /api/biz-enforce?appId={owner/appName}
Content-Type: application/json
Authorization: Basic base64(clientId:clientSecret)

Body: ["alice", "/api/orders/123", "GET"]

Response:
{
    "status": "ok",
    "data": true
}
```

**biz-batch-enforce — 批量权限判断**

```
POST /api/biz-batch-enforce?appId={owner/appName}
Content-Type: application/json

Body: [
    ["alice", "/api/orders/123", "GET"],
    ["bob", "/api/products/456", "DELETE"]
]

Response:
{
    "status": "ok",
    "data": [true, false]
}
```

#### 策略导出（1 个）

**biz-get-policies — 获取策略数据（供 SDK 本地缓存）**

```
GET /api/biz-get-policies?appId={owner/appName}

Response:
{
    "status": "ok",
    "data": {
        "modelText": "[request_definition]\nr = sub, obj, act\n...",
        "policies": [
            ["alice", "/api/orders/{id}", "GET"],
            ["editor", "/api/orders/{id}", "POST|PUT|DELETE"]
        ],
        "groupingPolicies": [
            ["alice", "editor"],
            ["viewer", "editor"]
        ],
        "version": "2026-04-15T10:30:00Z"
    }
}
```

#### 用户查询（2 个）

**biz-get-user-roles — 查询用户角色**

```
GET /api/biz-get-user-roles?appId={owner/appName}&userId={org/username}

Response:
{
    "status": "ok",
    "data": ["editor", "viewer"]
}
```

**biz-get-user-permissions — 查询用户权限摘要**

```
GET /api/biz-get-user-permissions?appId={owner/appName}&userId={org/username}

Response:
{
    "status": "ok",
    "data": {
        "roles": ["editor", "viewer"],
        "allowedResources": ["/api/orders/{id}", "/api/products/{id}"],
        "allowedActions": ["GET", "POST", "PUT"],
        "properties": {
            "dataScope": "department",
            "features": ["export", "print"]
        }
    }
}
```

#### 策略同步（1 个）

**biz-sync-policies — 手动触发策略重建**

```
POST /api/biz-sync-policies?appId={owner/appName}

Response:
{
    "status": "ok",
    "data": {
        "policyCount": 24,
        "roleCount": 5
    }
}
```

#### 策略变更监听（计划中）

**biz-watch-policies** — 长轮询或 WebSocket 方式监听策略变更，用于 SDK 端实时更新本地缓存。当前未实现，SDK 可通过轮询 `biz-get-policies` 并比对 `version` 字段来实现变更检测。

### 旧版 API（仍然可用）

#### Enforce — 单次权限判断

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

#### BatchEnforce — 批量权限判断

```
POST /api/batch-enforce?permissionId=org/perm-name
Body: [["alice", "res1", "GET"], ["bob", "res2", "POST"]]

Response: { "data": [[true, false]] }
```

#### GetAllRoles — 查询用户角色

```
GET /api/get-all-roles?userId=org/alice

Response: { "data": ["erp-admin", "erp-editor"] }
```

#### GetAllObjects — 查询用户可访问资源

```
GET /api/get-all-objects?userId=org/alice

Response: { "data": ["erp-system", "/api/orders"] }
```

#### GetAllActions — 查询用户可执行操作

```
GET /api/get-all-actions?userId=org/alice

Response: { "data": ["Read", "Write"] }
```

---

## SDK 集成

### Go 后端中间件（Biz 模块）

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
)

const (
    jetauthEndpoint = "https://auth.company.com"
    clientId        = "your-client-id"
    clientSecret    = "your-client-secret"
    appId           = "your-org/your-app"
)

func bizEnforce(userId, resource, action string) (bool, error) {
    body, _ := json.Marshal([]string{userId, resource, action})
    url := fmt.Sprintf("%s/api/biz-enforce?appId=%s", jetauthEndpoint, appId)

    req, _ := http.NewRequest("POST", url, bytes.NewReader(body))
    req.SetBasicAuth(clientId, clientSecret)
    req.Header.Set("Content-Type", "application/json")

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return false, err
    }
    defer resp.Body.Close()

    data, _ := io.ReadAll(resp.Body)
    var result struct {
        Status string `json:"status"`
        Data   bool   `json:"data"`
    }
    json.Unmarshal(data, &result)
    return result.Data, nil
}

func AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        userId := getUserFromJWT(r) // 从 JWT 中提取用户 ID
        allowed, err := bizEnforce(userId, r.URL.Path, r.Method)
        if err != nil || !allowed {
            http.Error(w, "Forbidden", 403)
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

### TypeScript 前端 — 本地缓存策略（推荐）

通过 `biz-get-policies` 下载全量策略到前端，使用 casbin.js 在本地进行权限判断，零延迟：

```typescript
import { newEnforcer, newModel, MemoryAdapter } from "casbin.js";

const APP_ID = "your-org/your-app";

interface PoliciesData {
    modelText: string;
    policies: string[][];
    groupingPolicies: string[][];
    version: string;
}

let cachedVersion = "";
let enforcer: any = null;

// 拉取策略并构建本地 Enforcer
async function loadPolicies(): Promise<void> {
    const resp = await fetch(`/api/biz-get-policies?appId=${APP_ID}`, {
        headers: {
            "Authorization": "Basic " + btoa("clientId:clientSecret"),
        },
    });
    const { data } = await resp.json() as { data: PoliciesData };

    if (data.version === cachedVersion && enforcer) return; // 无变更

    const model = newModel(data.modelText);
    const adapter = new MemoryAdapter();

    // 加载 p 策略
    for (const p of data.policies) {
        adapter.addPolicy("p", "p", p);
    }
    // 加载 g 策略
    for (const g of data.groupingPolicies) {
        adapter.addPolicy("g", "g", g);
    }

    enforcer = await newEnforcer(model, adapter);
    cachedVersion = data.version;
}

// 本地权限判断（零延迟）
async function canDo(user: string, resource: string, action: string): Promise<boolean> {
    if (!enforcer) await loadPolicies();
    return enforcer.enforce(user, resource, action);
}

// 定时轮询检查策略更新（每 5 分钟）
setInterval(loadPolicies, 5 * 60 * 1000);

// 使用示例
// <Button disabled={!await canDo(userId, "/orders", "DELETE")}>删除订单</Button>
// {await canDo(userId, "/finance/reports", "GET") && <MenuItem>财务报表</MenuItem>}
```

### 版本轮询 / Watch 模式（计划中）

当前推荐定时轮询 `biz-get-policies` 并比对 `version` 字段。未来将实现 `biz-watch-policies` 接口，支持长轮询或 WebSocket 推送策略变更事件，SDK 端可实时更新本地缓存。

### 旧版 SDK 集成（仍然可用）

#### Go 后端（旧版 SDK）

```go
import casdoorsdk "github.com/casdoor/casdoor-go-sdk"

func init() {
    casdoorsdk.InitConfig(
        "https://auth.company.com",
        "your-client-id",
        "your-client-secret",
        "",
        "your-org",
        "your-app",
    )
}

func AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        userId := getUserFromJWT(r)
        allowed, _ := casdoorsdk.Enforce(
            "org/permission-name",
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

#### Python 后端（旧版 SDK）

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

---

## 内部工作原理

### Biz 模块策略生成（SyncAppPolicies）

当创建或更新 BizRole / BizPermission 时，后端自动调用 `SyncAppPolicies` 重建全量策略（`biz_permission_engine.go`）：

```
输入：BizAppConfig + 所有 BizRole + 所有 BizPermission

1. 从 BizAppConfig.modelText 构建原生 Casbin Enforcer（无 GetBuiltInModel 魔法）
2. 清空现有策略
3. 检查模型是否包含 eft 字段（解析 policy_definition 的 tokens）
4. 生成 p 策略（笛卡尔积）：
   仅处理 isEnabled=true 且 state="Approved" 的权限
   策略 = (Users ∪ Roles) × Resources × Actions
   有 eft → [sub, obj, act, eft]
   无 eft → [sub, obj, act]
5. 生成 g 策略（角色继承）：
   仅处理 isEnabled=true 的角色
   用户分配 → [user, roleName]
   子角色   → [subRoleName, parentRoleName]
6. 批量写入策略表（SavePolicy）
7. 存入内存缓存（StoreBizEnforcerCache）
8. 写入 Redis 缓存（如果启用）
```

示例：Users=[alice], Roles=[editor], Resources=[/api/orders], Actions=[GET, POST], Effect=Allow

```
→ ["alice",  "/api/orders", "GET",  "allow"]
→ ["alice",  "/api/orders", "POST", "allow"]
→ ["editor", "/api/orders", "GET",  "allow"]
→ ["editor", "/api/orders", "POST", "allow"]
```

> 与旧版的关键区别：Biz 模块**不注入 permissionId**，策略字段完全由模型定义决定。

### Enforcer 缓存（sync.Map + singleflight）

Biz 模块使用两级缓存架构避免每次请求重建 Enforcer：

```
biz-enforce 请求
  → 检查内存缓存 sync.Map（key: "owner/appName"）
  → 命中 → 直接使用 Enforcer
  → 未命中 → singleflight.Group.Do() 防止重入
    → 双重检查（Double-Check）
    → 尝试 Redis 缓存
      → 命中 → 从 Redis 数据构建内存 Enforcer（不需要 DB adapter）
      → 未命中 → 从 DB 加载 BizAppConfig，buildBizEnforcer()
    → 存入 sync.Map
    → 写回 Redis（如果启用）
  → enforcer.Enforce(...)
```

**缓存失效时机：**
- **自动失效**：BizRole / BizPermission / BizAppConfig 的增删改操作自动触发 `SyncAppPolicies`，重建 Enforcer 并更新缓存
- **手动失效**：UI 点击「同步策略」按钮，调用 `biz-sync-policies` API
- **删除失效**：删除 BizAppConfig 时调用 `ClearBizEnforcerCache`，同时清除内存和 Redis

### Redis 缓存结构

启用条件：配置文件中 `redisEndpoint` 不为空 **且** `bizPolicyCacheEnabled = true`。

```
Key 格式：jetauth:biz:policies:{owner}/{appName}
TTL：30 分钟

Value（JSON）：
{
    "modelText": "[request_definition]\nr = sub, obj, act\n...",
    "policies": [["alice", "/api/orders", "GET"], ...],
    "groupingPolicies": [["alice", "editor"], ...],
    "policyTable": "erp_system_policy",
    "updatedTime": "2026-04-15T10:30:00Z"
}
```

Redis 缓存的作用：
- **跨进程共享**：多实例部署时，一个实例 SyncAppPolicies 后，其他实例可从 Redis 快速恢复 Enforcer
- **冷启动加速**：进程重启后，首次请求无需查 DB，直接从 Redis 重建
- **降级容错**：Redis 不可用时透明降级到 DB 查询，不影响功能

### 旧版 Permission 策略生成

旧版 Permission 系统的策略生成逻辑（`permission_enforcer.go`）：

```
策略 = (Users ∪ Roles) × Resources × Actions → [sub, obj, act, eft, "", permissionId]
```

- `permissionId` 固定在第 6 位（V5 列），用于按权限过滤策略
- 适配器为空时存入默认表 `permission_rule`
- 适配器不为空时存入适配器指定的表
- 角色继承关系**不持久化到策略表**，而是在每次权限检查时从 Role 表动态构建（`getRuntimeGroupingPolicies`）

### 旧版 Enforce 调用流程

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

> 旧版每次调用都重建 Enforcer（无缓存），Biz 模块通过缓存避免了这一开销。

---

## 已知限制

### 1. Biz 列表无分页

BizRole 和 BizPermission 的列表 API（`biz-get-roles`、`biz-get-permissions`）返回全量数据，暂不支持分页。数据量较大时可能影响响应速度。

### 2. 模型文本 UI 只读

BizAppConfig 的 modelText 在管理后台为只读显示，不能直接从 UI 编辑。修改模型需要通过 API（`biz-update-app-config`）。UI 编辑功能计划中。

### 3. 审批流半成品

- `State` 字段（Approved/Pending/Rejected）后端会检查，Pending 和 Rejected 的权限不生效
- 但无审批权限控制、无通知、无专用审批 API、无状态机校验
- Biz 模块和旧版 Permission 系统均存在此限制

### 4. 前端权限控制非安全屏障

前端的按钮隐藏、菜单控制只是用户体验优化，真正的安全屏障在后端 API 层。用户可以通过浏览器控制台绕过前端限制。

### 5. Watch 机制未实现

`biz-watch-policies` 接口尚未实现。当前 SDK 端需要通过定时轮询 `biz-get-policies` 并比对 `version` 字段来检测策略变更。

### 6. 旧版特有限制（Biz 模块已解决）

以下限制仅存在于旧版 Permission 系统，Biz 模块已解决：

- **无 Enforcer 缓存**：旧版每次权限检查都重建 Casbin Enforcer 实例，单次 API 请求可能产生 15-25 次数据库查询。Biz 模块通过 sync.Map + singleflight + Redis 缓存解决。
- **模型字段数限制**：旧版限制 policy_definition 最多 6 个字段，第 6 个必须是 permissionId。Biz 模块使用原生 Casbin，无此限制。
- **Role 无自定义属性**：旧版 Role 结构体没有 properties 字段，无法存储数据范围等业务元数据。BizRole 有 properties 字段（JSON），可存储任意业务属性。
