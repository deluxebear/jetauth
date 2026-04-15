# JetAuth 待改进项

## 权限审批流 (Permission Approval Workflow)

**当前状态：半成品**

### 已有能力

- `State` 字段（Approved / Pending）**后端会检查** — 只有 `State=Approved` 的权限才在 `check.go` 中生效，Pending 状态直接跳过
- `submitter` / `approver` / `approveTime` 追踪字段存在于数据库和 API 中
- `GET /api/get-permissions-by-submitter` API 可查询"我提交的权限"
- 非管理员创建权限时 `state` 默认为 `Pending`，管理员默认为 `Approved`

### 缺失能力

- **无审批权限控制** — 任何能编辑权限的人都能直接把 State 从 Pending 改成 Approved，后端不校验操作者身份
- **无审批通知** — 没有邮件/站内消息通知管理员有新权限待审批
- **无审批队列页面** — 没有专门的"待审批"列表，管理员只能在权限列表里手动过滤
- **无审批动作 API** — 没有 `/api/approve-permission` 或 `/api/reject-permission` 等专用端点
- **无状态机校验** — 后端不限制状态流转（可以从 Approved 改回 Pending，也没有 Rejected 状态）
- **前端 approver 自动填充仅为前端行为** — 后端不验证也不自动设置

### 改进建议

1. **后端增加审批权限校验** — 只有 admin / 组织管理员才能将 State 改为 Approved
2. **增加 Rejected 状态** — 支持拒绝并记录拒绝原因
3. **审批队列页面** — 新前端增加"待审批权限"专用视图（利用已有的 `get-permissions-by-submitter` API）
4. **通知集成** — 权限提交时通知管理员，审批完成时通知提交者
5. **审批日志** — 记录每次状态变更的操作者和时间

### 相关代码位置

- 后端权限检查：`object/check.go:489` 和 `object/check.go:605`
- Permission 结构体：`object/permission.go:46-49`
- Submitter 查询 API：`controllers/permission.go:90`
- 前端审批区域：`web-new/src/pages/PermissionEditPage.tsx` Approval section

---

## 权限表单字段与模型联动 (Permission Fields × Model Awareness)

**当前状态：表单字段与所选模型无关，用户无法知道哪些字段有效**

### 问题描述

权限编辑页的「成员」和「资源」区域有 7 个可编辑字段（Users、Groups、Roles、Domains、Resources、Actions、Effect），但**并非所有字段在所有模型下都有意义**。当前前端对所有模型都展示完全相同的表单，用户无法判断哪些字段必填、哪些字段在当前模型下根本不生效。

### 后端策略生成逻辑分析

权限的核心是 `permission_enforcer.go:124-146` 的策略生成——一个笛卡尔积：

```
策略 = (Users ∪ Roles) × Resources × Actions × Domains(可选) → [sub, domain?, obj, act, eft]
```

这意味着：

| 字段 | 策略中的角色 | 为空时的后果 |
|------|------------|------------|
| **Users + Roles** | 策略主体 (sub) | 两者都为空 → **不生成任何策略**，权限完全无效 |
| **Resources** | 策略资源 (obj) | 空 → **不生成任何策略** |
| **Actions** | 策略操作 (act) | 空 → **不生成任何策略** |
| **Effect** | 策略效果 (eft) | 写入每条策略，Allow/Deny |
| **Domains** | 策略域维度 | 空 → 策略不含域字段（非错误，只是不按域隔离） |
| **Groups** | **不直接参与**策略生成 | 通过 `getRuntimeGroupingPolicies` 间接影响角色继承链 |

### 模型决定哪些字段有意义

Casbin 模型定义了策略的结构和匹配规则。不同模型下，字段的有效性不同：

| 模型类型 | `role_definition` | Users | Roles | Groups | Domains | 说明 |
|---------|-------------------|-------|-------|--------|---------|------|
| **纯 ACL** | 无 | 必填 | 填了当普通主体，**无继承** | **无效** | **无效** | 最简单模式，直接匹配用户-资源-操作 |
| **RBAC**（默认内置模型） | `g = _, _` | 可选 | **有效**（角色继承生效） | **有效**（通过角色间接） | **无效** | 用户→角色→权限 继承链 |
| **RBAC with domains** | `g = _, _, _` | 可选 | **有效** | **有效** | **有效** | 同一用户在不同域下可有不同角色 |
| **ABAC** | 无 | 必填 | **无效** | **无效** | 视 matcher 而定 | 基于属性匹配，不用角色 |

### 默认内置模型（Model 留空时）

```
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act, eft, "", permissionId

[role_definition]
g = _, _                    ← 有角色继承，但无 domain

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act
```

在此模型下：Roles 有效、Groups 有效（间接）、**Domains 填了不会报错但完全不生效**（模型 matcher 中没有 domain 维度）。

### 原版前端的部分检查

原版 `web/src/PermissionEditPage.js` 做了一个检查：选择 Model 后获取模型文本，检查是否包含 `role_definition`。若无，则禁用 Roles 字段。但这只是最基础的检查，不完整：
- 不检查 Domains 在当前模型下是否有意义
- 不检查 Groups 在无角色继承模型下是否无效
- 不标注 Users/Resources/Actions 为必填
- 不根据模型动态调整 Actions 的可选值

### 当前新前端状态

- 所有字段始终可编辑，无论选择了什么模型
- 没有任何必填标注（Users+Roles、Resources、Actions 实际上是必填的）
- 没有根据模型禁用/启用字段的逻辑
- Model 留空时不提示用户将使用默认内置模型

### 改进建议

1. **必填标注** — Users/Roles（至少一个非空）、Resources、Actions 标注为必填，保存前校验
2. **模型感知的字段联动** — 选择 Model 后解析模型文本：
   - 无 `role_definition` → 禁用 Roles 并清空、提示 Groups 无效
   - 无 `g = _, _, _`（三参数角色定义）→ 禁用 Domains 并提示
3. **Model 留空提示** — tooltip 或 help 文本说明将使用默认 RBAC 模型
4. **保存前验证** — 后端已有 `// TODO: return error if permissionModel is nil.` 注释（`permission_enforcer.go:106`），可考虑实现

### 相关代码位置

- 策略生成（笛卡尔积）：`object/permission_enforcer.go:124-146`
- 角色继承策略生成：`object/permission_enforcer.go:265-298`
- 模型加载与默认模型：`object/permission_enforcer.go:96-120` 和 `460-476`
- 默认模型 TODO 注释：`object/permission_enforcer.go:106`
- 原版前端模型检查：`web/src/PermissionEditPage.js` 中 `getModel()` 调用
- 新前端权限编辑页：`web-new/src/pages/PermissionEditPage.tsx`
