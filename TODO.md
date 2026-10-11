# JetAuth 待改进项

> 2026-10-11 更新：自 `2017b796` 起的一批工作已落地（审批流、字段校验、Enforcer 缓存、策略布局、biz 版本/Watch/Webhook/Redis Watcher/LRU、数据范围、分页与迁移、RFC 7009 吊销、Syncer 组同步、Site 网关 P2、ReBAC CAS 与 ListObjects 优化）。各节"当前状态"已改写，并在"未完成"小节中列出明确遗留项。
>
> 全局遗留（跨模块）：各类缓存 / Watcher 开关默认均为关闭。`swagger/` 已重新生成（`4a21140b`，补齐 32 个此前缺失的接口）。
>
> 同日追加：对本批后端代码做了一轮安全审查，11 个问题（2 高 / 5 中 / 4 低）已全部修复并附回归测试，详见下方"2026-10-11 安全审查修复"；前端 ESLint 错误清零（483 → 0），CI 前端 job 新增 `npm run lint` 与 `vitest run`。

## 2026-10-11 安全审查修复

**当前状态：已全部修复。** 每项均有回归测试。

| 级别 | 问题 | 修复 |
|---|---|---|
| 高 | biz 授权过滤器先看 `owner`/`organization` 再看 `appId`，且 POST body 不读 `appId` → A 组织管理员可读写 B 组织的 biz 应用（watch / write-tuples 等） | `routers/authz_filter.go` 解析 query + body 中所有租户标识，必须指向同一组织，否则拒绝；新增 `controllers/biz_tenant_guard.go`（`parseBizAppId`）在每个带 `appId` 的 biz / ReBAC 处理器里再校验一次 |
| 高 | `/api/enforce` 不看审批状态：Pending / Rejected / 编辑后降级的权限策略行照样生效 | 只有 `IsPolicyLive()`（Approved，或旧数据的空状态）的权限才写策略行；所有状态流转经 `UpdatePermission` 增删行；enforce 控制器跳过非生效权限；启动时 `InitPermissionPolicyReconciliation()` 清理存量非 Approved 权限的策略行（见 `docs/permission-approval-enforcement.md`） |
| 中 | biz Enforcer 缓存可被重建中的陈旧/空结果覆盖并推送到 Redis 30 分钟 | 同步写缓存时推进代数；只有 `StoreIfGen` 成功才回写 Redis；`xormadapter.SavePolicy` 改为单事务 delete + insert（不再 drop/create） |
| 中 | Watch 全量快照可能比所标版本旧 | 全量快照直接从数据库策略表读取，不走缓存 |
| 中 | 并发 `syncAppPolicies` 丢更新，SDK 增量与服务端分叉 | 按 (owner, app) 串行并合并突发同步（`object/biz_sync_serialize.go`）；合并多次调用时记 `full_rebuild` |
| 中 | 审批没有绑定管理员审阅时的内容 | 新增非持久化 `Permission.ContentHash`；approve 必须携带、reject 可选，不一致则拒绝；前端审批页/编辑页已携带并提示冲突 |
| 中 | 权限增改接口对 `app/<name>`（client credentials）会话回归，且可经 `?userId=` 冒充操作人 | `requirePermissionOperator`：应用会话身份为 `app/<name>`，不再读取 `userId` |
| 低 | Excel 上传绕过审批（保留文件里的 State / Approver / Owner） | 每行走 `PreparePermissionForAdd`，Owner 强制为上传者组织（全局管理员除外） |
| 低 | 提交人只比对用户名 | 新记录存 `owner/name`；旧的纯用户名只在同组织内匹配 |
| 低 | ReBAC CAS 激活当前模型时在 MySQL 上误报 stale | 期望值等于目标值时短路；UPDATE 影响 0 行时回读确认 |
| 低 | 网关变更检测用秒级 `MAX(updated_time)`，同秒修改与证书/应用修改要等 60s 强制刷新 | 指纹改为对相关列内容做哈希 |

### 需要留意的默认行为

- [ ] **升级后未批准的权限不再生效** — 启动对账会删掉所有非 Approved 权限的策略行；如有"Pending 但实际在用"的权限，升级前先批准
- [ ] **`IsEnabled` 不参与 `/api/enforce` 生效判断**（与改动前一致；`check.go` 会看它）。若希望禁用的权限也不生效，改 `Permission.IsPolicyLive()` 一行即可
- [ ] 审批的内容哈希校验与读取之间仍有极小竞争窗口：并发编辑会被审阅过的内容覆盖（批准写入的是被哈希的那份）
- [ ] `Submitter` 列仍为 `varchar(100)`，很长的 `owner/name` 可能被截断（未做破坏性迁移）
- [ ] 同步串行化只在进程内生效；多实例下仍可能交错（最后完成的那次重建包含其开始前已提交的全部变更）
- [ ] `ruleFingerprint` 仍使用 `updated_time` 计数 + 最大值

## 权限审批流 (Permission Approval Workflow)

**当前状态（2026-10-11）：已完成（后端状态机 + 审计日志 + 邮件通知 + Web UI）。** 遗留项见下方"未完成"。

### 已完成

- [x] **后端审批权限控制** — 只有全局管理员或该组织管理员（`isPermissionApprover`，`controllers/permission.go`）才能 Approve / Reject；非管理员创建权限强制为 `Pending`
- [x] **Rejected 状态 + 拒绝原因** — 状态机 `ValidatePermissionTransition`（`object/permission_approval.go`）：`Pending→Approved|Rejected`（仅管理员，Reject 必须带原因）、`Rejected→Pending`（提交人或管理员，重新提交）、`Approved→Pending`（仅管理员，撤销）；其余流转一律拒绝（例如 Approved 不能直接变 Rejected）
- [x] **专用审批 API** — `POST /api/approve-permission`、`POST /api/reject-permission`（body `{reason}`）、`GET /api/get-permission-approval-logs`；`get-permissions-by-submitter` 保留
- [x] **审批日志** — `PermissionApprovalLog` 表记录 operator / fromState / toState / reason / 时间；权限编辑页读取并展示
- [x] **审批通知** — 提交/重新提交/内容变更回到 Pending 时邮件通知组织管理员；批准/拒绝时邮件通知提交人（`notifyPermissionApproval`，通过该组织 Application 的 Email Provider 发送）
- [x] **编辑即降级** — 非审批人修改 Approved/Rejected 权限中影响策略的字段（模型、Adapter、资源类型、效果、启用状态、用户、组、角色、域、资源、动作，`permissionPolicyFieldsChanged`）后自动回到 Pending，写日志并通知管理员
- [x] **审批队列与我的提交页面** — `web/src/pages/PermissionApprovalsPage.tsx`；权限编辑页提供批准/拒绝/撤销/重新提交控件，撤销/重提会带上未保存的表单修改

### 未完成 / 已知限制

- [ ] 通知仅有邮件通道（需要该组织的 Application 配置了 Email Provider；找不到 Provider 或管理员没有邮箱时静默跳过），没有站内消息 / Webhook 通知
- [ ] 审批状态对 `/api/enforce` 的影响、内容哈希绑定、应用会话、上传路径等后续加固见"2026-10-11 安全审查修复"
- [ ] 无批量审批、无指定审批人（任何组织管理员均可审批），无多级审批

### 相关代码位置

- 状态机 / 日志 / 通知：`object/permission_approval.go`
- 控制器：`controllers/permission.go`（`ApprovePermission` / `RejectPermission` / `GetPermissionApprovalLogs`）
- 后端权限检查（只有 `Approved` 生效）：`object/check.go`
- 前端：`web/src/pages/PermissionApprovalsPage.tsx`、`web/src/pages/PermissionEditPage.tsx`
---

## 权限表单字段与模型联动 (Permission Fields × Model Awareness)

**当前状态（2026-10-11）：已完成。** 前端按所选模型解析并联动字段，后端保存时校验；见下方"已完成 / 未完成"。下文"问题描述 / 分析"保留作设计背景。

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

### 已完成

- [x] **必填标注与保存前校验** — 前端标注 Users/Roles（至少一个）、Resources、Actions 为必填并在保存前校验；后端 `object/permission_fields.go` 同样校验（`PermissionErrNoSubject` 等）
- [x] **模型感知联动** — 解析所选模型（留空 = 内置默认模型，`web/src/utils/casbinModel.ts` 的 `getModelSupport`）：无 `role_definition` 禁用并清空 Roles、提示 Groups 无效；无三参数 `g = _, _, _` 禁用并清空 Domains
- [x] **Model 留空提示** — 帮助文本说明将使用默认内置模型，并可展开查看默认模型文本
- [x] **后端域校验** — 模型没有 domain-aware 角色定义时拒绝填写 Domains（`PermissionErrDomains`）；**仅在 domains/model 发生变化时校验**，避免阻塞存量数据
- [x] **缺失模型 fail-closed** — 权限引用不存在的模型时 enforcer 构建失败而不是 nil 解引用（原 `permission_enforcer.go` 的 `TODO: return error if permissionModel is nil` 已解决）

### 未完成 / 已知限制

- [ ] **Actions 可选值不随模型变化** — 目前只按 `resourceType` 切换（API: GET/POST/PUT/DELETE/PATCH；其它: Read/Write/Admin），不会根据模型 matcher 推导
- [ ] ABAC 类模型（不用 Roles/Groups、matcher 依赖属性）没有专门提示，只按 `role_definition` / 三参数 `g` 判断
- [ ] Groups 字段只给出文字提示（"间接生效/无效"），不会被禁用或校验
- [ ] 保存校验对**存量**权限不回溯（只有改动 domains/model 时才触发域校验）

### 相关代码位置

- 策略生成（笛卡尔积）：`object/permission_enforcer.go:124-146`
- 角色继承策略生成：`object/permission_enforcer.go:265-298`
- 模型加载与默认模型：`object/permission_enforcer.go:96-120` 和 `460-476`
- 字段校验：`object/permission_fields.go`；前端模型解析：`web/src/utils/casbinModel.ts`
- 原版前端模型检查：`web/src/PermissionEditPage.js` 中 `getModel()` 调用
- 新前端权限编辑页：`web/src/pages/PermissionEditPage.tsx`

---

## Casbin Enforcer 性能优化 (Permission Enforcer Caching)

**当前状态（2026-10-11）：平台 Enforcer 缓存已实现，但默认关闭（`permissionEnforcerCacheEnabled=false`）。** 下文"问题描述 / 单次请求开销 / 规模估算"是实现前的分析，保留作背景。

### 已完成

- [x] **LRU + TTL 内存缓存** — `object/permission_enforcer_cache.go`：`getPermissionEnforcer()` 先查缓存；配置 `permissionEnforcerCacheEnabled`（默认 `false`）、`permissionEnforcerCacheSize`（默认 `1000`）、`permissionEnforcerCacheTtlSeconds`（默认 `60`，同时是陈旧上限）
- [x] **自动失效** — `object/permission_enforcer_invalidate.go`：xorm After* 钩子覆盖 Role / Permission / Model / Adapter 的增改删，加上 p 规则写入时的显式失效；写入路径统一使用不经缓存的 `newPermissionEnforcer()`；代数计数（generation guard）防止重建与失效竞争时缓存陈旧结果
- [x] **Redis pub/sub 跨实例失效** — `object/permission_enforcer_watcher.go`：`permissionEnforcerWatcherEnabled`（默认 `false`，需缓存已启用），可选 `permissionEnforcerWatcherAddr`（回退 `redisEndpoint`）/ `Password` / `DB` / `Channel`（默认 `jetauth:permission-enforcer:invalidations`）；Redis 故障时清空缓存并回退到 TTL；启动时连不上则跳过并告警
- [x] **Prometheus 指标** — `permission_enforcer_cache_hits_total` / `_misses_total` / `_evictions_total{reason}` / `_invalidations_total{scope,source}` / `permission_enforcer_cache_entries`
- [x] **基准** — SQLite、4 层角色链：未缓存约 255us/op，缓存后约 4.6us/op（`permission_enforcer_cache_bench_test.go`）
- [x] **启动钩子** — `main.go` 调用 `object.InitPermissionEnforcerCache()`；配置说明见 `docs/configuration-reference.md`

### 未完成 / 已知限制

- [ ] **默认关闭** — 缓存和 Watcher 默认都是关闭状态，需要手动在 `conf/app.conf` 打开；尚未做大规模场景的线上验证
- [ ] 绕过 JetAuth 直接改库（手写 SQL）只能靠 TTL 过期发现；多实例且未开启 Watcher 时，陈旧窗口最长为 TTL
- [ ] 方案三（外部系统用 SDK 本地判断平台 Permission）未做 — 平台 Permission 的 `g` 策略是运行时动态生成的，业务系统请使用 biz 子系统的 SDK（见下文）
- [ ] 没有 Redis 策略文本缓存（仅 biz 子系统有 `bizPolicyCacheEnabled`）
- [ ] 群组成员关系变化不触发失效（enforcer 只读 `role.users` / `role.roles`，因此设计上不需要，但若将来让 Groups 参与策略生成需要补）


### 问题描述

`getPermissionEnforcer()` (`permission_enforcer.go:30`) 在**每次权限检查时**都从零创建 Casbin Enforcer 实例：创建对象 → 查数据库取 Model → 查数据库取策略 → 递归查数据库展开角色继承 → 判断完丢弃。没有任何内存缓存、Redis 缓存或 Watcher 机制。

### 单次请求开销

| 步骤 | 操作 | 数据库查询 |
|------|------|-----------|
| `casbin.NewEnforcer()` | 创建实例 | 无 |
| `GetModel(p.Model)` | 查模型 | 1 次 |
| `LoadFilteredPolicy(filter)` | 按 permissionId 过滤加载策略 | 1 次 |
| `getRolesInRole()` | 递归展开角色继承 | N 次（取决于角色嵌套深度） |
| 总计（单条 Permission） | | **3-5 次 DB 查询** |

`CheckApiPermission()` 遍历该组织下**所有** Permission，假设匹配 5 条 → 单次 API 请求产生 **15-25 次数据库查询**。

### 规模估算（10 万用户 / 100 应用 / 每应用 200 API）

**RBAC 模式下的策略规模：**

```
角色:   100 应用 × 5 角色/应用 = 500 角色
g 策略: 10 万用户-角色映射 = 10 万条
p 策略: 100 应用 × 200 API × 3 权限级别 = 6 万条
总计:   ~16 万条策略
```

**内存占用（如果缓存到内存）：**

| 场景 | 策略条数 | 内存占用 |
|------|---------|---------|
| 标准 RBAC | ~16 万条 | ~60-80 MB |
| 角色较多（每应用 20 角色） | ~50 万条 | ~200 MB |
| 极端细粒度 | ~500 万条 | ~2 GB |

**性能对比：**

| 指标 | 当前（无缓存） | 加缓存后 |
|------|-------------|---------|
| 单次判断延迟 | 5-20ms（多次 DB 查询） | 0.01-0.1ms（纯内存匹配） |
| 数据库压力 | 每请求 15-25 次查询 | 仅策略变更时查询 |
| 内存占用 | ~0（不缓存） | 60-80 MB（RBAC 模式） |
| 万级并发 | 数据库先挂 | 轻松承载（纯内存计算） |

### 当前 Redis 使用现状

项目中 Redis 仅用于 **Session 存储**（`conf/app.conf:redisEndpoint`、`main.go:43`），与 Casbin 权限缓存无关。Casbin 提供的 Redis Watcher / Redis Adapter 等缓存机制均未使用。

### 改进方案

#### 方案一：Enforcer 内存缓存（最小改动）

```go
var enforcerCache sync.Map  // key: permissionId → value: *casbin.Enforcer

func getPermissionEnforcer(p *Permission) (*casbin.Enforcer, error) {
    if cached, ok := enforcerCache.Load(p.GetId()); ok {
        return cached.(*casbin.Enforcer), nil
    }
    enforcer := ...  // 原有创建逻辑
    enforcerCache.Store(p.GetId(), enforcer)
    return enforcer, nil
}
```

需要在以下时机清除缓存：
- Permission 更新/删除时 → 清该 Permission 的缓存
- Role 更新时 → 清引用该 Role 的所有 Permission 缓存
- Model/Adapter 更新时 → 清引用它们的所有 Permission 缓存

#### 方案二：Redis Watcher（多实例部署）

```go
import rediswatcher "github.com/casbin/redis-watcher/v2"

watcher, _ := rediswatcher.NewWatcher("redis:6379")
enforcer.SetWatcher(watcher)
// 策略变更时自动通知其他节点刷新内存
```

适用于 JetAuth 多实例部署（负载均衡），确保一个实例改了策略，其他实例也能及时刷新。

#### 方案三：外部系统用 SDK 本地判断

外部系统高频调用场景下，不走 `/api/enforce` API，而是直接引入 Casbin SDK 连接同一数据库，启动时加载策略到内存，本地判断。需要注意：
- `g` 策略（角色继承）不在策略表中，是运行时从 Role 表动态生成的，外部系统需自行处理
- 策略同步可通过 Watcher 或定时 reload 实现

### 相关代码位置

- 缓存 / 失效 / Watcher：`object/permission_enforcer_cache.go`、`permission_enforcer_invalidate.go`、`permission_enforcer_watcher.go`
- Enforcer 创建（缓存未命中时回源，原无缓存路径）：`object/permission_enforcer.go`
- 策略按 permissionId 过滤加载：`object/permission_enforcer.go:49-60`
- 角色继承动态构建（不持久化）：`object/permission_enforcer.go:265-298`
- API 权限检查（遍历所有 Permission）：`object/check.go:476-579`
- 应用登录权限检查：`object/check.go:581-680`
- Redis 仅用于 Session：`main.go:39-44`、`conf/app.conf:10`

---

## 角色自定义属性 (Role Custom Properties)

**当前状态（2026-10-11）：`biz_role` 已完成（类型化 properties + dataScope 校验/合并 + 编辑器 + 消费端 API）；平台 `Role` 结构体仍无 properties。**

### 已完成（biz 子系统）

- [x] **`biz_role.properties` JSON 字段** — `object/biz_role_properties.go`：键名正则白名单、最多 50 个键、总大小 ≤16KB；`dataScope` 结构化校验（`type`: `all` / `org` / `dept` / `dept_and_children` / `self` / `custom`，`values` 最多 500 个，可选 `resources` 按业务资源覆盖，最多 50 个）
- [x] **多角色合并** — 用户拥有多个角色时标准范围取最宽松，`custom` 取并集；无角色声明时返回 `none`
- [x] **消费端 API** — `GET /api/biz-get-user-data-scope`（`BizGetUserDataScope`）返回用户生效的数据范围；用户角色接口同时带出 role properties
- [x] **Casbin SDK 片段** — 集成 Tab 的 Go/TS 模板展示数据范围用法
- [x] **前端编辑器** — `web/src/components/BizRoleDataScopeEditor.tsx`（`BizRoleEditPage` 属性区）

### 未完成 / 已知限制

- [ ] **平台 `Role`（`object/role.go`）没有 properties 字段** — 仅 `biz_role` 支持；平台权限体系下仍只能用"资源路径编码数据范围"的替代方案；迁移工具（见下）也无法迁移该信息
- [ ] **按资源（per-resource）数据范围没有 UI 编辑器** — 后端 `dataScope.resources` 已支持并校验，但 `BizRoleDataScopeEditor` 只编辑顶层 `type` / `values`；per-resource 覆盖目前只能通过 JSON / API 写入
- [ ] properties 中 `dataScope` 之外的键没有专用编辑器（原始 JSON）
- [ ] SDK 没有独立的 `getRoleProperties()` 封装，业务系统直接调用上述 HTTP API

### 以下为实现前的需求分析（保留作背景）

### 问题描述

Role 结构体只有固定字段（Users、Groups、Roles、Domains、IsEnabled），没有 `properties` / `attributes` / `metadata` 等可扩展字段。业务系统需要在角色上附加额外信息（如数据范围、功能开关等），当前无处存放。

### 典型需求：数据范围权限（Data Scope）

ERP/CRM 等业务系统常见的三级数据范围控制：

| 数据范围 | 含义 | 示例 |
|---------|------|------|
| `self` | 只看自己创建的数据 | 销售只看自己的订单 |
| `department` | 看本部门的数据 | 销售经理看整个销售部订单 |
| `company` | 看全公司的数据 | 总监看所有订单 |

理想的存储方式：

```go
type Role struct {
    // ...现有字段
    Properties map[string]interface{} `xorm:"mediumtext" json:"properties"`
}
```

```json
{
  "dataScope": {
    "orders": "department",
    "products": "company"
  }
}
```

### 当前替代方案

用 Permission 的资源路径编码数据范围（不改后端）：

```
p, sales,         /scope/orders, self, allow
p, sales-manager, /scope/orders, department, allow
p, director,      /scope/orders, company, allow
```

业务系统依次检查 `company → department → self`，取匹配的最大范围作为查询过滤条件。可行但不够直观。

### 改进建议

1. **给 Role 加 `properties` JSON 字段** — `xorm:"mediumtext" json:"properties"`
2. **前端角色编辑页加属性编辑器** — JSON key-value 编辑，或按业务预定义的属性模板
3. **SDK 提供 `getRoleProperties()` 方法** — 业务系统登录后获取用户角色属性，用于数据范围等业务逻辑

### 相关代码位置

- Role 结构体：`object/role.go`
- Role CRUD：`object/role.go:100-220`
- 角色继承解析：`object/permission_enforcer.go:265-298`

---

## Permission 系统的模型兼容性限制 (Policy Definition Field Limit)

**当前状态（2026-10-11）：部分解决 — 策略行按模型 `policy_definition` 的字段名生成，权限 id 固定在保留的 `v5` 列；"6 字段且第 6 个不是 permissionId"与"7+ 字段"仍然不支持（有意保留）。** 详见 `docs/permission-policy-layout.md`。

### 已完成

- [x] **模型驱动的策略布局** — `object/permission_policy_layout.go`：按字段名（大小写不敏感）识别 sub/subject/user、dom/domain/tenant、obj/object/res/resource、act/action、eft/effect，各值写入对应列；无法识别时使用旧的位置布局，存量行和存量模型的生成结果逐字节不变
- [x] **按保留列删除** — 删除/更新用 `RemoveFilteredPolicy(5, id)`（按 `v5` 权限 id），旧布局写入的行也能清掉
- [x] **`GetAllObjects` / `GetAllActions` 跟随模型布局**
- [x] 无需数据迁移，缓存键 / 失效逻辑不变

### 未完成 / 已知限制（有意保留）

- [ ] **6 个字段且第 6 个不是 `permissionId`**（如 `api-model-built-in`）仍被拒绝 — xorm-adapter 表只有 `v0..v5` 六列，权限 id 占用 `v5`；支持需要加宽 `casbin_rule` 表，会同时影响 Enforcer 实体路径和两套授权子系统，当前明确不做
- [ ] **7+ 字段**仍被拒绝；`permissionId` 出现在非第 6 位同样被拒绝
- [ ] 实际支持宽度是"**最多 5 个模型字段 + 保留 id 列**"

### 以下为实现前的问题分析（保留作背景）

### 问题描述

`GetBuiltInModel()` (`permission_enforcer.go:460-513`) 对所有模型强制要求：

- `policy_definition` 字段数不超过 6（`builtInMaxFields = 6`）
- 如果恰好 6 个字段，第 6 个必须是 `permissionId`
- 不满足条件直接报错，无法创建或更新权限

这导致 `api-model-built-in`（`p = subOwner, subName, method, urlPath, objOwner, objName`，6 字段，第 6 个是 `objName`）不能用于 Permission 系统。

### 根本原因

Permission 系统依赖 xorm-adapter 的 V5 列（第 6 位）存储 `permissionId`，用于按权限过滤策略（`LoadFilteredPolicy(V5: [permissionId])`）。这是和 Enforcer 路径完全不同的两套代码：

| | Permission 路径 | Enforcer 路径 |
|---|---|---|
| 模型处理 | `GetBuiltInModel()` 强制改造 | `model.NewModelFromString()` 原样使用 |
| 策略存储 | `getPolicies()` 固定 6 字段 | 由 adapter 直接管理 |
| 限制 | 最多 6 字段、第 6 必须 permissionId | 无限制 |

### 影响范围

- 1~5 字段的模型：自动补齐到 6 字段 → **正常工作**
- 6 字段且第 6 个是 permissionId → **正常工作**
- 6 字段且第 6 个不是 permissionId → **报错**
- 7+ 字段 → **报错**

### 相关代码位置

- 字段限制常量：`object/permission.go:52`（`builtInMaxFields = 6`）
- 模型改造逻辑：`object/permission_enforcer.go:460-513`
- 策略生成（固定 6 字段）：`object/permission_enforcer.go:124-146`
- 策略过滤（V5 列）：`object/permission_enforcer.go:49-58`

---

## 业务权限模块 (Biz Permission) 改进计划

### 一、Redis 缓存 — 多实例部署支持

**当前状态（2026-10-11）：阶段 1（Redis pub/sub 跨实例失效）、阶段 2 的 Redis 策略缓存、阶段 3 的 LRU + 空闲 TTL 均已实现；全部默认关闭/不限制，需在 `conf/app.conf` 手动开启。**

> 历史说明：2026-04-20 WAF 网关"URL 级授权"上线后，`GetBizEnforcer` 成为每个 HTTP 请求的必经路径，多实例部署下节点间策略陈旧会直接影响线上安全正确性。现在可通过 `bizPolicyWatcherEnabled=true`（需 Redis）解决；未开启时仍建议单实例部署或关闭 `Site.EnableBizAuthz`。

### 已完成

- [x] **阶段 1：Redis pub/sub 跨实例失效** — `object/biz_policy_watcher.go`：`bizPolicyWatcherEnabled`（默认 `false`）；`bizPolicyWatcherAddr`（回退 `redisEndpoint`）/ `Password` / `DB` / `Channel`（默认 `/jetauth/biz-policy-update`）；`SyncAppPolicies` 与缓存清除会发布 `{owner, appName}`，其它实例丢弃本地 Enforcer；Redis 不可用时降级为单实例行为并告警（实现用 `go-redis` 直接 pub/sub，未引入 `casbin/redis-watcher`）
- [x] **阶段 2：Redis 策略数据缓存** — 此前已有（`object/biz_redis_cache.go`，`bizPolicyCacheEnabled` + `redisEndpoint` 双条件）
- [x] **阶段 3：LRU 上限 + 空闲 TTL** — `object/biz_enforcer_lru.go` 替换原 `sync.Map`：`bizEnforcerCacheMaxEntries`（默认 `0` = 不限制）、`bizEnforcerCacheIdleTtlSeconds`（默认 `0` = 关闭，后台每 TTL/2 清扫）；代数计数保证重建与失效竞争时不缓存陈旧结果；指标 `biz_enforcer_cache_hits_total` / `_misses_total` / `_evictions_total{reason=lru|ttl|invalidate}` / `biz_enforcer_cache_entries`
- [x] **配置文档** — `docs/configuration-reference.md` 已覆盖上述键

### 未完成 / 已知限制

- [ ] **Redis 策略文本缓存未做压缩 / 拆 key** — 文中的 Snappy 压缩、按 ptype 拆 key、Redis Hash 方案均未实现；策略量 >1 万条时再评估
- [ ] 所有开关默认关闭 — 多实例部署必须显式开启 `bizPolicyWatcherEnabled`；尚无多节点集成测试 / 压测记录
- [ ] LRU 淘汰只丢弃本进程 Enforcer（下次访问重建，不影响鉴权结果，但首次访问延迟变高）
- [ ] 网关进程内直调 `object.BizEnforce` 的路径没有基于 `policy_version` 的对账，依赖 Watcher 消息；Redis 断连期间的失效消息会丢失（只能等下一次变更或重启）

#### 问题描述（实现前分析）

`bizEnforcerCache sync.Map` 在每个进程内独立维护。当 Node A 调用 `SyncAppPolicies` 更新策略后，Node B 的缓存仍是旧的，直到该缓存条目被手动清除或进程重启。

#### 改进方案（按部署阶段递进）

**阶段 1：Casbin Redis Watcher（推荐首选）**

保持内存 Enforcer（0.01ms enforce），Redis Pub/Sub 仅负责跨节点通知刷新：

```go
import rediswatcher "github.com/casbin/redis-watcher/v2"

var bizWatcher persist.Watcher

func InitBizWatcher(redisAddr string) error {
    w, _ := rediswatcher.NewWatcher(redisAddr, rediswatcher.WatcherOptions{
        Channel: "/jetauth/biz-policy-update",
    })
    w.SetUpdateCallback(func(msg string) {
        // msg 携带 owner/appName，清除对应缓存
        owner, appName := parseMsg(msg)
        ClearBizEnforcerCache(owner, appName)
    })
    bizWatcher = w
    return nil
}

// SyncAppPolicies 末尾新增：
if bizWatcher != nil {
    bizWatcher.Update()  // 广播到所有节点
}
```

依赖：`github.com/casbin/redis-watcher/v2`

优点：改动极小（SyncAppPolicies 末尾加一行），enforce 性能不变（0.01ms）

**阶段 2：Redis 策略文本缓存（策略量 >1 万条时）**

在内存缓存 miss 时，先查 Redis 缓存的策略文本，避免每次都读 DB 重建：

```
GetBizEnforcer 查找顺序：
  1. 本地 sync.Map → 命中 → 0.01ms
  2. Redis GET "biz:policies:{key}" → 命中 → 反序列化策略 → 建 Enforcer → ~1ms
  3. DB 回源 → 建 Enforcer → ~5ms → 回写 Redis + 本地缓存
```

适用场景：单个应用策略量超过 1 万条，DB 重建耗时 >10ms 时才值得加这一层。

**阶段 3：Enforcer TTL + LRU 淘汰**

当前 `sync.Map` 无限增长。应用被删除后缓存条目成为僵尸（虽然 `DeleteBizAppConfig` 会清理，但非正常关闭可能遗留）。

改进：替换 `sync.Map` 为带 TTL 的 LRU 缓存（如 `hashicorp/golang-lru/v2` 或 `patrickmn/go-cache`），设置 10-30 分钟 TTL，自动淘汰不活跃应用的 Enforcer。

**阶段 2 补充：Redis 策略数据缓存**

独立开关控制，Redis 连接复用 `redisEndpoint`：

```conf
# conf/app.conf
redisEndpoint = 192.168.1.100:6379    # Redis 连接（已有，用于 Session）
bizPolicyCacheEnabled = false          # 策略缓存开关（新增，默认关闭）
```

启用条件矩阵：

| redisEndpoint | bizPolicyCacheEnabled | 行为 |
|---|---|---|
| 空 | 任意 | Redis 不可用，纯 DB + 内存 |
| 有值 | false | Redis 仅 Session（现有行为不变） |
| 有值 | true | Redis 同时用于 Session + 策略缓存 |

读写流程：

```go
func GetBizEnforcer(owner, appName string) (*casbin.Enforcer, error) {
    key := util.GetId(owner, appName)

    // 1. 本地内存缓存
    if cached, ok := bizEnforcerCache.Load(key); ok {
        return cached.(*casbin.Enforcer), nil
    }

    // 2. Redis 策略缓存（仅 bizPolicyCacheEnabled=true 时）
    if conf.GetConfigBool("bizPolicyCacheEnabled") {
        if data, err := redis.Get("biz:policies:" + key); err == nil && data != "" {
            e := buildEnforcerFromCachedPolicies(data)
            bizEnforcerCache.Store(key, e)
            return e, nil
        }
    }

    // 3. DB 回源
    e, err := buildFromDB(owner, appName)
    if err != nil { return nil, err }
    bizEnforcerCache.Store(key, e)

    // 回写 Redis
    if conf.GetConfigBool("bizPolicyCacheEnabled") {
        redis.Set("biz:policies:" + key, serializePolicies(e), 30*time.Minute)
    }
    return e, nil
}

// SyncAppPolicies 末尾：写 DB 后同步更新 Redis
if conf.GetConfigBool("bizPolicyCacheEnabled") {
    redis.Set("biz:policies:" + key, serializePolicies(e), 30*time.Minute)
}
```

Redis 中存储格式：JSON 序列化的 `{ modelText, policies [][]string, groupingPolicies [][]string, updatedTime }`，和 `biz-get-policies` 接口返回格式一致，SDK 拉策略时也可直接从 Redis 取。

**大数据量优化（策略 > 1 万条时）：**

单 key 体积估算：1 万条策略 ≈ 500 KB，10 万条 ≈ 5 MB。超过 5 MB 时 Redis 大 key 会影响性能。优化方案：

1. **Snappy 压缩**（推荐首选）— 改动最小，压缩率 ~10:1：
```go
// 写入
data, _ := json.Marshal(cacheData)
compressed := snappy.Encode(nil, data)   // 5MB → ~500KB
redis.Set(key, compressed, ttl)

// 读取
compressed, _ := redis.Get(key)
data, _ := snappy.Decode(nil, compressed)
json.Unmarshal(data, &cacheData)
```

2. **拆分 key**（策略 > 10 万条时）— 按 ptype 拆分：
```
jetauth:biz:policies:org/app:meta     → { modelText, policyTable, updatedTime }
jetauth:biz:policies:org/app:p        → [[...], [...]]  // p 策略
jetauth:biz:policies:org/app:g        → [[...], [...]]  // g 策略
```

3. **改用 Redis Hash**（需要部分读取时）：
```
HSET jetauth:biz:policies:org/app modelText "..." policies "[...]" grouping "[...]"
HGET jetauth:biz:policies:org/app policies   // 只读策略，不读模型
```

依赖：`github.com/golang/snappy`（方案 1）。当前策略量级无需优化。

#### 性能对比

| 场景 | 当前 (sync.Map) | + Watcher | + Redis 缓存 |
|------|----------------|-----------|-------------|
| 单节点 enforce | 0.01ms | 0.01ms | 0.01ms |
| 多节点策略同步 | 不一致 | <100ms 全局一致 | <100ms |
| 缓存 miss 重建 | 5-20ms (DB) | 5-20ms (DB) | ~1ms (Redis) |
| 节点重启预热 | 冷启动 | 冷启动 | 从 Redis 快速恢复 |

#### 实施建议

| 条件 | 做什么 |
|------|-------|
| 单实例部署 | 不需要改动，现有 sync.Map 够用 |
| 多实例部署 | 加阶段 1（Redis Watcher），约 20 行代码 |
| 策略量 >1 万条 | 加阶段 2（Redis 策略缓存） |
| 应用数 >100 | 加阶段 3（LRU + TTL） |

#### 相关代码位置

- Enforcer 内存缓存：`object/biz_enforcer_cache.go:24-26`（bizEnforcerCache + singleflight）
- 缓存存/取/清：`StoreBizEnforcerCache`、`GetBizEnforcer`、`ClearBizEnforcerCache`
- 策略同步触发缓存刷新：`object/biz_permission_engine.go` — `SyncAppPolicies` 末尾
- Redis 配置（已有，用于 Session）：`conf/app.conf:redisEndpoint`

### 二、策略版本管理 + 增量同步 — SDK 集成优化

**当前状态（2026-10-11）：版本号、变更日志、长轮询 Watch API、`biz-policy-changed` Webhook、SDK 模板均已实现；但变更日志对"删除/更新"一律记 `full_rebuild`，只有"新增"是精确增量。**

### 已完成

- [x] **版本号** — `BizAppConfig.PolicyVersion`（`policy_version`），每次已提交的策略变更自增
- [x] **变更日志表** — `biz_policy_changelog`（`object/biz_policy_changelog.go`）；**入口：同步引擎在 `SyncAppPolicies` 内记录**（并非设计稿里的"各 CRUD 函数逐个 appendChangelog"）。授权对象/成员/权限的**新增**记录精确的 `add` 规则，其余情况记一条 `full_rebuild` 标记
- [x] **Watch API** — `GET /api/biz-watch-policies`（长轮询，最长 60s；返回 `incremental` / `full` / HTTP 304；等待者每 3 秒读库以覆盖未启用 Redis Watcher 的多实例场景）与轻量版本查询 `GET /api/biz-get-policy-version`
- [x] **日志保留** — 每小时清理，每个应用保留最近 1000 个版本；SDK 版本过旧自动降级为全量
- [x] **Webhook** — 策略同步完成后触发 `biz-policy-changed` 事件（`object/biz_policy_webhook.go`，经常规 Webhook 子系统异步投递；Webhook 编辑页可订阅）
- [x] **SDK 模板** — 集成 Tab 的完整 Go / TS SDK 模板（含本地 Enforcer 缓存）：轮询 `biz-get-policy-version`，版本变化时全量拉取 `biz-get-policies`；`biz-watch-policies` 在片段中说明为可选

### 未完成 / 已知限制

- [ ] **删除 / 更新 / 角色继承 / 分组变化 / 手动 Sync 始终是 `full_rebuild`** — 同一条规则可能由多个权限/角色产生，精确 `remove` 不安全，因此 `remove` 动作常量存在但**从不精确写入**；SDK 遇到这类变化必须全量拉取
- [ ] SDK 模板默认走版本轮询，未把 `StartWatch` 长轮询做成现成的客户端实现
- [ ] 变更日志没有做 Redis 版本缓存或跨应用批量清理优化；`biz_policy_changelog` 表量级未压测
- [ ] Webhook 为尽力投递（失败只记日志），没有重试 / 死信

#### 目标

业务系统 SDK 本地缓存策略版本号，通过 Watch 长轮询感知变更，仅同步增量变更而非全量拉取。

#### 设计方案

**1. 版本号机制**

`biz_app_config` 新增 `policy_version int64` 字段，每次策略变更自增：

```go
type BizAppConfig struct {
    // ...现有字段
    PolicyVersion int64 `xorm:"default 0" json:"policyVersion"`
}
```

**2. 变更日志表 `biz_policy_changelog`**

```sql
CREATE TABLE biz_policy_changelog (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    owner       VARCHAR(100) NOT NULL,
    app_name    VARCHAR(100) NOT NULL,
    version     BIGINT NOT NULL,
    action      VARCHAR(10) NOT NULL,    -- add / remove / full_rebuild
    ptype       VARCHAR(10) NOT NULL,    -- p / g
    rule        TEXT NOT NULL,           -- JSON: ["alice", "/orders/*", "GET"]
    created_at  TIMESTAMP DEFAULT NOW(),
    INDEX idx_app_version (owner, app_name, version)
);
```

**3. 入口处直接记录变更（不做全量 diff）**

在 CRUD 函数中直接记录变更内容，O(1) 复杂度，不受策略总量影响：

```go
func AddBizPermission(perm *BizPermission) (bool, error) {
    // ... 插入 DB ...

    // 直接记录本次变更产生的策略（不需要 diff）
    rules := generateRulesFromPermission(perm)
    appendChangelog(perm.Owner, perm.AppName, "add", "p", rules)

    syncBizPolicies(perm.Owner, perm.AppName)
    return affected != 0, nil
}

func DeleteBizPermission(perm *BizPermission) (bool, error) {
    // 删除前读出策略
    rules := generateRulesFromPermission(perm)

    // ... 删除 DB ...

    appendChangelog(perm.Owner, perm.AppName, "remove", "p", rules)

    syncBizPolicies(perm.Owner, perm.AppName)
    return affected != 0, nil
}

// 手动 SyncPolicies → 标记全量重建，SDK 收到后拉全量
func SyncAppPolicies(owner, appName string) (*SyncStats, error) {
    // ... 现有逻辑 ...
    appendChangelog(owner, appName, "full_rebuild", "", nil)
    return stats, nil
}
```

**4. Watch API（HTTP Long Polling）**

```
GET /api/biz-watch-policies?appId=org/erp&version=5

场景 A — 版本已变化，有增量：
← {
    "type": "incremental",
    "fromVersion": 5,
    "toVersion": 8,
    "changes": [
      { "action": "add",    "ptype": "p", "rule": ["bob", "/reports/*", "GET"] },
      { "action": "remove", "ptype": "p", "rule": ["alice", "/orders/*", "DELETE"] }
    ]
  }

场景 B — 首次连接 / 版本过旧 / 遇到 full_rebuild 标记：
← {
    "type": "full",
    "version": 8,
    "policies": [...全部策略...],
    "groupingPolicies": [...]
  }

场景 C — 无变化，超时 60s：
← HTTP 304 Not Modified
```

**5. SDK 处理逻辑**

```go
func (c *Client) applyResponse(resp WatchResponse) {
    if resp.Type == "full" {
        c.enforcer = rebuildFromPolicies(resp.Policies)
    } else {
        for _, ch := range resp.Changes {
            switch ch.Action + "/" + ch.Ptype {
            case "add/p":    c.enforcer.AddPolicy(ch.Rule...)
            case "remove/p": c.enforcer.RemovePolicy(ch.Rule...)
            case "add/g":    c.enforcer.AddGroupingPolicy(ch.Rule...)
            case "remove/g": c.enforcer.RemoveGroupingPolicy(ch.Rule...)
            }
        }
    }
    c.version = resp.ToVersion
}
```

**6. Changelog 清理**

定时清理保留最近 1000 个版本。SDK 版本过旧（已被清理）时自动降级为全量同步。

#### 性能对比

| 场景 | 全量同步 | 增量同步 |
|------|---------|---------|
| 2000 条策略，改 1 条 | 传输 2000 条 + 重建 Enforcer | 传输 1 条 + AddPolicy 一次 |
| SDK 重连（离线 5 分钟） | 传输 2000 条 | 传输 ~10 条 diff |
| 首次启动 | 传输 2000 条 | 传输 2000 条（相同） |
| 变更记录成本 | 无 | O(1)（入口处直接写，不做 diff） |

#### 为什么不用全量 diff

全量 diff 方案需要在 SyncAppPolicies 中对比新旧策略集合（O(n)），策略量大时会慢。入口记录方案在 CRUD 函数中直接写 changelog，O(1) 复杂度，不受策略总量影响。唯一的特殊情况（手动 Sync）标记为 `full_rebuild`，SDK 收到后全量拉取。

#### 实施步骤

1. `biz_app_config` 加 `policy_version` 字段 + `biz_policy_changelog` 建表
2. CRUD 函数中加 `appendChangelog` 调用
3. 新增 `GET /api/biz-watch-policies` 长轮询端点
4. 新增 `GET /api/biz-get-policy-version` 轻量版本查询
5. SDK 实现 `StartWatch` + `applyResponse`

#### 相关代码位置

- CRUD 入口（需加 changelog）：`object/biz_role.go`、`object/biz_permission.go` 的 Add/Update/Delete 函数
- 策略同步：`object/biz_permission_engine.go` — `SyncAppPolicies`
- 现有策略导出 API：`controllers/biz_permission_api.go` — `BizGetPolicies`
- 版本字段所在结构体：`object/biz_app_config.go` — `BizAppConfig`

### 三、前端 / 后端待办清单

#### 前端

- [x] **概况 Tab 模型文本可编辑** — CodeMirror 编辑器 + 服务端 Casbin 模型校验（`b621c15e`）
- [x] **快速创建向导自动创建默认角色/权限** — 勾选项（仅 Casbin 模式，可取消），服务端 `InitBizAppDefaults` 经 `/biz-add-app-config?initDefaults=true` 完成
- [x] **用户权限画像** — 用户编辑页新增按应用的业务权限 Tab（`67ef1fb5`）
- [x] **SDK 模板完善** — 完整 Go / TS 模板含本地缓存、版本/Watch、数据范围用法
- [x] **角色数据范围编辑器** — `BizRoleDataScopeEditor`（per-resource 覆盖仍无 UI，见"角色自定义属性"）
- [x] **平台权限导入对话框** — dry-run 预览（数量、冲突、不可映射字段）→ 确认，冲突策略 skip / overwrite（en + zh i18n）
- [x] **角色 / 权限列表服务端分页** — 角色、权限 Tab 使用服务端分页

#### 后端

- [x] **迁移工具** — `POST /api/biz-migrate-from-permission`（`object/biz_migrate_from_permission.go`、`biz_migrate_plan.go`）：把平台 Permission / Role 复制进 `biz_role` / `biz_role_member` / `biz_role_inheritance` / `biz_permission` / `biz_permission_grantee`；参数 `appId`、`sourceOrganization`（非全局管理员只能迁自己组织）、`dryRun`、`onConflict=skip|overwrite`；单事务，成功后触发一次策略同步
- [x] **列表分页** — `biz-get-roles` / `biz-get-permissions` 支持 `p`、`pageSize`、`field`、`value`、`sortField`、`sortOrder`（权限另有 `scopeKind` / `effect` / `state` / `isEnabled` 过滤），总数在 `data2`；不带 `p`+`pageSize` 行为不变（`object/biz_list_page.go`）
- [x] **策略变更 Webhook** — `biz-policy-changed`

#### 未完成

- [ ] **迁移工具没有选择性导入** — 只能整组织导入（全部角色和权限），不能挑选子集；只支持 Casbin 模式的应用；域（domains）、模型、Adapter、resourceType 等无对应字段，作为 `unmappable` 问题报告后丢弃；平台角色没有 properties 因而无数据范围可迁
- [ ] 迁移不是增量/可重放对账：`overwrite` 按名称覆盖，不做删除同步
- [ ] 分页仅覆盖 roles / permissions 两个列表；其它列表（成员、授权对象、资源目录）按各自既有接口
- [x] `biz-migrate-from-permission` 与 Watch / Version / DataScope 接口的 swagger 已重新生成（`4a21140b`）

---

## ReBAC (Zanzibar) 关系型授权集成

**状态（2026-10-11）：CP-1 ~ CP-8 已全部落地并在 `main` 上；下方 P1~P6 的复选框已与 [`docs/rebac-implementation-status.md`](docs/rebac-implementation-status.md) 对齐。** | **方案文档：[docs/rebac-integration-plan.md](docs/rebac-integration-plan.md)**

在现有"应用授权"模块中引入 Zanzibar 风格 ReBAC，使用户创建应用时可选择 RBAC（Casbin）或 ReBAC 模型。采用轻量自建图引擎方案（复用现有 DB/缓存，零运维增量）。

### P1: 数据模型（2-3 天）

- [x] `BizAppConfig` 增加 `ModelType`（"casbin" | "rebac"）和 `CurrentAuthorizationModelId`（Schema 改存 append-only 的 `BizAuthorizationModel` 表，不再用 `SchemaText` 字段）
- [x] 新建 `BizTuple` 结构体（字段对齐 OpenFGA TupleKey：Object/Relation/User + 派生列 ObjectType/UserType/UserRelation）
- [x] `ormer.go` 注册 `BizTuple` 表，配置复合索引（idx_forward + idx_reverse）
- [x] 实现 Schema JSON 解析器（`biz_rebac_schema.go`）：JSON → 内存类型/关系定义结构
- [x] BizTuple CRUD 函数（AddTuples / DeleteTuples / ReadTuples）

### P2: 图遍历引擎（3-4 天）

- [x] 实现 `ReBACCheck(owner, appName, object, relation, subject)` — 核心 Check 算法 (CP-3, feature/rebac-cp3)
  - [x] 直接关系查找 (Task 4 — `this`)
  - [x] userset 展开（`team:eng#member`）(Task 4 — integrated)
  - [x] also 展开（同对象隐含关系，如 `owner → editor`）(Task 5 — computed_userset)
  - [x] from 展开（关联对象继承，如 `parent.editor`）(Task 6 — tuple_to_userset)
  - [x] union / intersection / difference (Tasks 7–9)
  - [x] 请求级 memo map 去重 (Task 3 + verification Task 10)
  - [x] maxDepth=25 深度限制 (Task 11)
- [x] 实现 `ReBACListObjects(owner, appName, objectType, relation, subject)` — 列出可访问对象 (CP-5)
- [x] 实现 `ReBACListUsers(owner, appName, object, relation)` — 列出有权限的用户 (CP-5)
- [x] 单元测试覆盖：直接关系、userset、继承链、循环检测、深度限制 (CP-3 + openfga consolidated suite，当前口径见 `docs/rebac-implementation-status.md`)

### P3: API 层（2 天）

- [x] `BizEnforce` / `BizBatchEnforce` 按 `config.ModelType` 路由到 Casbin 或 ReBAC 引擎（CP-8 C1，`object/biz_rebac_dispatch.go`）
- [x] 新增路由：`biz-write-tuples` / `biz-read-tuples` (CP-5 — delete 合并在 write 批次里,无独立 delete-tuples)
- [x] 新增路由：`biz-check` / `biz-batch-check` (CP-4)
- [x] 新增路由：`biz-list-objects` / `biz-list-users` (CP-5)
- [x] 新增路由：`biz-expand`（展开关系树，调试用）(CP-5)
- [x] ReBAC 模式下 `biz-get-user-roles` / `biz-get-user-permissions` / `biz-get-permissions-for-subject` **有意不适配**：返回 HTTP 400 + `BIZ_API_NOT_SUPPORTED_IN_REBAC` 并指向 `biz-list-objects` 等替代接口（CP-8 C2，`controllers/biz_rebac_guidance.go`；原因见 `dc5e7af0`）

### P4: 前端 Schema + Tuple（3-4 天）

- [x] 创建向导步骤 2 增加模型类型选择（RBAC / ReBAC 卡片）(CP-7 Task 10)
- [x] `AppAuthorizationPage` 按 `modelType` 显示不同 Tab（概览/Schema/元组/测试/集成）(CP-7 Task 3)
- [x] 新建 `BizSchemaEditor.tsx` — DSL + 可视化(query-builder)双 Tab,共享 AST(CP-7 Task 4-6)
- [x] 新建 `BizTupleManager.tsx` — 元组管理表格(增删查 + 批量导入 CSV/JSON + 批量删除)(CP-7 Task 7)
- [x] `BizBackend.ts` 增加 10 个 ReBAC API 调用函数 + 类型(CP-7 Task 1)
- [x] i18n 中英文翻译 — 86 个 `rebac.*` 键,parity 3286/3286 (CP-7 Task 2 + 增量)

### P5: 前端测试 + 集成(1-2 天)

- [x] 新建 `BizReBACTester.tsx` — Check 测试器(输入主体/对象/关系,显示结果 + Expand 树 + 20 条本地历史)(CP-7 Task 8)
- [x] 集成 Tab 补充 ReBAC 模式的 SDK 代码示例(Go / TypeScript / Python,带 copy-to-clipboard)(CP-7 Task 9)
- [x] 概览 Tab 适配 ReBAC 统计信息(类型数、关系数、元组数、Model id、最后更新时间)(CP-7 Task 11)

### P5.5: 配置管理员体验优化 (CP-7.5)

- [x] 场景模板空状态 — Overview 新建应用空状态提供 3 个一键模板(文档协作 / 团队 SaaS / 资源分享)
- [x] A11y polish — Tester/Editor/TupleManager 补 focus-visible ring;Overview skeleton;StatCard tabular-nums;Tester 结果 aria-live;Tuple 空状态引导
- [x] DSL 编辑器 — Snippets 下拉(9 个常用片段)+ Lint 侧栏(orphan-type / missing-subject-type)
- [x] Tester 测试用例集 — 历史 ⭐ 为用例,cases 视图 + Run All 批量重跑 + pass/fail 标记
- [x] Schema 变更 Plan — 保存冲突时弹 ChangePlan 模态(结构 diff + DSL 行 diff + 冲突按 relation 聚合 + 级联清理)
- [x] 身份浏览器(§B ROI 最高)— By User / By Object 双模式,调 bizListObjects / bizListUsers,Why? → Tester 预填自动 Check
- [x] Type 关系图谱 — Schema Tab 第三个子 Tab,自绘 SVG 俯视类型依赖(direct 实线 / inherit 虚线)
- [x] 批量授权向导 — 4 步 wizard(subject pattern / object pattern / relation / preview),一键批量写 tuple

### P6: 缓存优化（2 天）

- [x] sync.Map 元组查询结果缓存 + 写入时失效 (CP-6, biz_rebac_cache.go)
- [x] 可选 Redis L3 缓存层 + pub/sub 跨实例失效（CP-8 C6）— 实际由独立开关 `bizReBACCacheL3Enabled` 控制（地址回退 `redisEndpoint`），**没有**复用 `bizPolicyCacheEnabled`；默认关闭
- [x] ListObjects context 超时控制 (CP-5 — 10s 硬超时)
- [x] ListObjects 并发遍历 + 反向索引 preselect（B1#1 / B1#3）+ 直接授予短路与 per-call 模型提升（B1#2 / B1#4，`437d275f`）：同一 2500 文档夹具上 801ms → 177ms → 19ms（见 `docs/rebac-sla-baseline.md`）

### 本批新增（2026-10-11）

- [x] **Schema 保存/激活 compare-and-swap（Plan R6）** — `biz-write-authorization-model`（body）与 `biz-activate-authorization-model`（query）接受可选 `expectedModelId`；与应用当前 `CurrentAuthorizationModelId` 不一致时返回 `BIZ_REBAC_SCHEMA_STALE`，指针前推本身是原子条件 UPDATE；省略则保持旧的"后写覆盖"语义（`5dd853c1`）。前端 Schema 编辑器已携带该参数并提示冲突（`a3baccfc`，en + zh）
- [x] **请求 context 贯穿缓存调用** — 新增 `ReBACCheckCtx`，ListObjects / ListUsers 的超时 context 经 `checkContext` 传到 L2/L3 缓存，Redis 调用随请求取消；`ReBACCheck` 签名不变（`f9acb573`）
- [x] **断言 / 审计表启动建表** — `BizReBACAssertion` 与 `BizReBACTupleAudit` 此前从未传给 `Sync2`，全新数据库上断言 Tab、审计 Tab、最近写入卡片报 "no such table"，现已修复（`667aa906`）

### 未完成 / 已知限制

- [x] consolidated 套件口径已对齐：`true_butnot_cycle_return_false` 在 CP-8 C7 后已能通过，移出 skip 列表，`expectedSkipCount` 改为 4（`92ee95cd`）
- [ ] 4 条 OpenFGA 一致性 skip 为有意分歧（冲突扫描拒绝会孤立 tuple 的 schema 变更）或仅 ListObjects 断言形式差异
- [ ] `biz-count-tuples` 不支持按条件计数；tuple 删除必须精确匹配 `(object, relation, user)`（无前缀批量删）
- [ ] `docs/rebac-sla-baseline.md` 数值为 SQLite + 单次均值（非百分位）；MySQL/Postgres 与生产硬件尚未实测
- [ ] Redis L3 默认关闭，多实例 pub/sub 失效没有多节点集成测试
- [ ] 断言（Assertions）与审计（Audit）已落地后端路由与前端组件，但"环境切换（prod/staging）"等 iter-2 产品项未做
- [x] swagger 已重新生成（`4a21140b`）；CAS 在 MySQL 上激活当前模型误报 stale 的问题已修复

### 清理

- [x] **CP-4 接入 cel-go 真正导入后，删除 `object/biz_rebac_anchor.go`**
  占位文件，仅为阻止 `go mod tidy` 在第一次真实使用前把 cel-go 从 vendor/ 剔除。
  已随 CP-4 Task 1 移除（`object/biz_rebac_condition.go` 现在真实导入 cel-go）。

### 相关代码位置

- 方案文档：`docs/rebac-integration-plan.md`
- BizAppConfig：`object/biz_app_config.go`
- Enforce 入口：`object/biz_enforcer_cache.go` — `BizEnforce`
- 现有 API：`controllers/biz_permission_api.go`
- 路由注册：`routers/router.go`（`/api/biz-*` ReBAC 段）
- 前端授权页：`web/src/pages/AuthorizationPage.tsx`
- 前端应用授权页：`web/src/pages/AppAuthorizationPage.tsx`

---

## Site 网关后端安全与性能审计

**审计日期：2026-04-16** | **状态（2026-10-11）：P0 / P1 / P2 / P3 全部修复，审计清单已清零。**

Site 模块是 JetAuth 内置的反向代理网关 + WAF，拦截所有 HTTP(S) 流量。以下是对其后端代码的安全性和性能审计结果。

### P0: 立即修复（防止生产崩溃/安全漏洞）

- [x] **SiteMap/ruleMap 并发访问无锁保护** — `object/site_cache.go:25,128` + `object/rule_cache.go:23,50`
  - SiteMap 是普通 `map[string]*Site{}`，`refreshSiteMap()` 每 5 秒写入，`GetSiteByDomain()` 每请求读取
  - 高并发下触发 `concurrent map iteration and map write` → 进程崩溃
  - 修复：改用 `sync.Map` 或 `sync.RWMutex` 保护读写

- [x] **HTTP 写失败触发 panic** — `service/proxy.go:38,166,222`
  - `fmt.Fprint()` 出错时 `panic(err)`，客户端断连即触发
  - 修复：改为 `logs.Error()` + `return`

- [x] **GetChallengeMap 索引越界 panic** — `object/site.go:224-231`
  - `strings.Split(challenge, ":")` 结果可能只有 1 个元素，`tokens[1]` 越界
  - 修复：加 `len(tokens) >= 2` 检查

- [x] **Rate Limiter blackList nil map 访问** — `rule/rule_ip_rate.go:88`
  - `blackList[ruleName]` 未初始化时直接访问 → panic
  - 修复：访问前检查 `if _, ok := blackList[ruleName]; ok`

- [x] **静态文件路径穿越** — `service/proxy.go:289`
  - `filepath.Join(host, r.RequestURI)` 未过滤 `../`，可读取任意文件
  - 修复：`filepath.Clean()` + 验证最终路径在目标目录内

- [x] **OAuth 回调开放重定向** — `service/oauth.go:89`
  - `state` 参数直接用于 `http.Redirect()`，可注入外部 URL 实施钓鱼
  - 修复：校验 redirect URL 必须是相对路径，拒绝 `http://` / `https://` / `//` 开头

### P1: 性能优先修复（最大收益）

- [x] **反向代理每请求新建** — `service/proxy.go:42`
  - `httputil.NewSingleHostReverseProxy(target)` 每请求创建，无连接复用
  - 延迟 +10-50ms/请求，内存分配 5-10MB/s
  - 修复：按 targetUrl 缓存 proxy 对象（`sync.Map` 或 `map` + `RWMutex`）

- [x] **WAF 引擎每请求编译** — `rule/rule_waf.go:35`
  - `coraza.NewWAF()` 每次解析 SecLang 规则，延迟 +100-500ms
  - 修复：按规则文本缓存 WAF 实例

- [x] **UA 正则每请求编译** — `rule/rule_ua.go:52`
  - `regexp.MatchString()` 每次编译正则，延迟 +100-500μs
  - 修复：规则初始化时预编译正则，缓存 `*regexp.Regexp`

- [x] **Rate Limiter 内存无限增长** — `rule/rule_ip_rate.go:32-38`
  - `ipRateLimiters` 和 `blackList` 永不清理，攻击者旋转百万 IP 可致 OOM
  - 修复：加 LRU 上限（如 10 万条）+ 定期清理过期条目

### P2: 稳定性修复（中期）

- [x] **证书监控持全局锁阻塞请求** — `object/site_timer.go`（2026-10-11 已改为 per-site 证书锁，`65430a56`）
  - `lock.Lock()` 期间执行 DB 查询 + ACME HTTP 请求，阻塞所有请求 100ms-1s
  - 修复：改为 per-site 锁；`monitorSiteCerts` 复用刷新快照，不再重复查库

- [x] **DNS 解析协程无上限泄漏** — `object/site_cache.go:102-108`
  - 每 5 秒为每个空 PublicIp 的 site 启动 goroutine，无 WaitGroup/信号量
  - 1000 站点 + DNS 慢 → 每小时数十万协程 → 内存耗尽
  - 修复：加 `semaphore.NewWeighted(10)` 限制并发数

- [x] **全量刷新每 5 秒无变更检测** — `object/site_timer.go`（2026-10-11 已修复）
  - 每 5 秒 `GetGlobalSites()` + `GetGlobalRules()` 全量查库
  - `monitorSiteCerts()` 再次调 `GetGlobalSites()`（重复查询）
  - 修复：`count + max(updated_time)` 指纹变更检测，仅变化时重建 SiteMap/ruleMap，最多每 60 秒强制全量刷新；刷新间隔可配 `siteRefreshIntervalSeconds`（默认 5）

- [x] **HTTP Server 无超时保护** — `service/proxy.go:323,331`
  - 无 `ReadTimeout` / `WriteTimeout` / `IdleTimeout`
  - Slow Loris 攻击可耗尽连接
  - 修复：设置 `ReadTimeout: 15s, WriteTimeout: 15s, IdleTimeout: 60s`

- [x] **无请求体大小限制** — `service/proxy.go`
  - 无 `MaxHeaderBytes`，1GB 请求体可耗尽内存
  - 修复：设置 `MaxHeaderBytes: 1<<20`，请求体用 `http.MaxBytesReader` 限制

- [x] **X-Real-IP 头可伪造** — `service/proxy.go:46-54`
  - 信任客户端发送的 `X-Forwarded-For` 并传递给后端
  - 修复：仅用 `RemoteAddr` 设置 `X-Real-Ip`，清除客户端发送的原始值

### P3: 代码质量

- [x] **Cookie 错误用字符串比较** — `service/proxy.go:220-223`
  - 用 `err.Error() != "http: named cookie not present"` 判断
  - 修复：改用 `errors.Is(err, http.ErrNoCookie)`

- [x] **组合规则递归查找无记忆化** — `rule/rule_compound.go`（2026-10-11 已修复，`24e4012b`）
  - 嵌套规则每层重新查找 ruleMap
  - 修复：嵌套组合规则查找记忆化，并检测/拒绝循环引用（`rule/rule_compound_test.go`）

- [x] **WAF Transaction 未关闭** — `rule/rule_waf.go:44`
  - `waf.NewTransaction()` 无 `defer tx.Close()`
  - 修复：加 `defer tx.Close()`

- [x] **错误信息泄露内部结构** — `service/proxy.go:246,257`
  - `site = %v` 暴露完整 Site 对象
  - 修复：生产环境默认不输出内部细节

### 未完成 / 已知限制

- [ ] 变更检测指纹是 `count + max(updated_time)`：直接改库且不更新 `updated_time` 的修改最多 60 秒（强制全量刷新间隔）后才生效；调大 `siteRefreshIntervalSeconds` 同样拉长生效延迟
- [ ] 证书监控的 ACME 续期流程未做端到端回归（仅锁粒度与快照复用被改动）

### 相关代码位置

- 网关入口：`service/proxy.go` — `Start()` + `handleRequest()`
- 反向代理：`service/proxy.go:34` — `forwardHandler()`
- OAuth 代理：`service/oauth.go`
- Site 缓存：`object/site_cache.go` — `SiteMap` + `refreshSiteMap()`
- Rule 缓存：`object/rule_cache.go` — `ruleMap` + `refreshRuleMap()`
- 后台监控：`object/site_timer.go` — `StartMonitorSitesLoop()`
- 证书管理：`object/site_cert.go` — `checkCerts()` + ACME 自动续期
- IP 限速：`rule/rule_ip_rate.go` — `IpRateLimiter` + `blackList`
- WAF 引擎：`rule/rule_waf.go` — Coraza ModSecurity
- UA 匹配：`rule/rule_ua.go`
- 组合规则：`rule/rule_compound.go`

---

## 网关集成 Casbin 应用授权（API 级权限控制）

**状态：✅ 已完成（2026-04-20）** | **相关 PR：feat/auth-ui-revamp 分支**

> 多实例部署：2026-10-11 起可通过 `bizPolicyWatcherEnabled=true`（Redis pub/sub）让各节点及时丢弃本地 Enforcer，详见 **[业务权限模块改进计划 → 一、Redis 缓存 — 多实例部署支持](#一redis-缓存--多实例部署支持)**；该开关默认关闭，未开启时仍以单实例部署为前提。

### 背景

当前网关请求链路：域名匹配 → SSL/重定向 → OAuth 认证 → WAF/IP 规则 → 代理转发。OAuth 步骤验证了用户身份（JWT token），但**验证通过后直接放行**，未检查用户是否有权访问特定 API 路径。

应用授权模块（`biz_*` 系列）已实现完整的 Casbin RBAC/ABAC 策略引擎，带内存缓存（0.01ms enforce）。两个模块可以通过 `Site.CasdoorApplication` 字段天然关联。

### 目标

在网关的 OAuth 认证和 WAF 规则检查之间插入 Casbin 鉴权，实现：
- 用户 A（admin 角色）可以 `DELETE /api/orders/123`
- 用户 B（viewer 角色）只能 `GET /api/orders/*`，`DELETE` 返回 403

### 实现方案

在 `service/proxy.go` 的 OAuth 检查后（约 line 241）插入约 20 行代码：

```go
// ③.5 Casbin authorization check
if site.CasdoorApplication != "" && claims != nil {
    userId := fmt.Sprintf("%s/%s", claims.Owner, claims.Name)
    allowed, err := object.BizEnforce(
        site.Owner, site.CasdoorApplication,
        []interface{}{userId, r.URL.Path, r.Method},
    )
    if err != nil {
        // BizAppConfig 不存在 → 该应用未配置授权，跳过（向后兼容）
    } else if !allowed {
        w.WriteHeader(http.StatusForbidden)
        responseErrorWithoutCode(w, "Access denied: insufficient permissions")
        return
    }
}
```

### 任务清单

- [x] `service/proxy.go` — 捕获 `ParseJwtToken` 返回的 claims,通过 `context.WithValue` 传递
- [x] `service/authz.go`（新） — `handleBizAuthz` 封装:bypass 列表 + `BizEnforce` 调用 + 失败模式分支 + 审计日志
- [x] `object/biz_enforcer_cache.go` — 新增 `BizEnforceWithKind` + `BizAuthzKind` 枚举区分 allowed/denied/not_found/disabled/engine_error
- [x] Site 新增 3 字段:`EnableBizAuthz` / `BizAuthzBypass[]` / `BizAuthzFailMode`,Add/Update 双重校验
- [x] 前端站点编辑页:访问控制区块内的子面板(toggle + 失败模式 + 白名单路径)
- [x] 测试:`service/authz_test.go`(bypass/deny/unavailable)+ `object/biz_enforcer_kind_test.go`(not_found/disabled 分类)

### 设计要点

| 要点 | 决策 |
|------|------|
| 向后兼容 | 未配置 BizAppConfig 的应用不受影响，鉴权步骤自动跳过 |
| 性能 | BizEnforce 内存缓存 ~0.01ms，相比代理延迟 1-10ms 可忽略 |
| 关联字段 | 复用 `Site.CasdoorApplication`，既用于 OAuth 登录也用于 Casbin 策略索引 |
| 策略管理 | 复用现有应用授权 UI（角色/权限/测试/集成 Tab） |
| Site 结构 | 无需新增字段 |

### 相关代码位置

- 网关 OAuth 检查：`service/proxy.go:217-242` — claims 解析后的插入点
- BizEnforce 入口：`object/biz_enforcer_cache.go:167` — 内存缓存 enforce
- BizAppConfig 查询：`object/biz_app_config.go:53` — 判断应用是否配置了授权
- 前端站点编辑：`web/src/pages/SiteEditPage.tsx` — CasdoorApplication 字段
