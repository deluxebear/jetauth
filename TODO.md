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
- 前端审批区域：`web/src/pages/PermissionEditPage.tsx` Approval section

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
- 新前端权限编辑页：`web/src/pages/PermissionEditPage.tsx`

---

## Casbin Enforcer 性能优化 (Permission Enforcer Caching)

**当前状态：无缓存，每次请求重建 Enforcer，大规模场景下数据库将成为瓶颈**

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

- Enforcer 创建（无缓存）：`object/permission_enforcer.go:30-71`
- 策略按 permissionId 过滤加载：`object/permission_enforcer.go:49-60`
- 角色继承动态构建（不持久化）：`object/permission_enforcer.go:265-298`
- API 权限检查（遍历所有 Permission）：`object/check.go:476-579`
- 应用登录权限检查：`object/check.go:581-680`
- Redis 仅用于 Session：`main.go:39-44`、`conf/app.conf:10`

---

## 角色自定义属性 (Role Custom Properties)

**当前状态：Role 结构体无扩展属性字段，无法存储业务元数据**

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

**当前状态：Permission 系统硬性限制模型最多 6 字段，第 6 个必须是 permissionId**

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

**当前状态：`sync.Map` 内存缓存，单实例有效，多实例部署时节点间缓存不一致**

> **⚠️ 2026-04-20 起此问题升级为热路径依赖。** WAF 网关的"URL 级授权"功能上线后,`GetBizEnforcer` 从"后台/SDK 偶发调用"变成"每个 HTTP 请求必经路径"。多实例部署时节点间策略陈旧不再是"管理员改完权限稍等片刻再生效",而是"Node B 会按旧策略拦/放流量"—— 直接影响线上安全正确性。
>
> 修复前建议继续单实例部署,或关闭 `Site.EnableBizAuthz`。
>
> 现有的 `/api/biz-get-policies` 已返回 `version`(基于 `BizAppConfig.UpdatedTime`),业务 SDK 自己轮询时安全;但进程内直调 `object.BizEnforce` 的网关路径**未接入**此 version 对账。阶段 1 的 Redis Watcher 方案正是补上这一步。

#### 问题描述

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

**当前状态：SDK 每次拉取全量策略，无版本号，无法判断是否需要更新**

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

### 三、前端待完善

| 项目 | 说明 |
|------|------|
| 概况 Tab 模型文本可编辑 | 当前只读，需加 CodeMirror 编辑器 + 保存到 `biz_app_config.modelText` |
| 快速创建向导自动创建默认角色/权限 | 当前只创建 BizAppConfig，应同时创建 admin 角色 + 默认权限 |
| 用户权限画像 | 后端 `biz-get-user-permissions` 已就绪，需在用户编辑页增加权限概览 Tab |
| SDK 模板完善 | 集成 Tab 只展示 HTTP 调用片段，需补充完整 Go/TS SDK 模板（含本地缓存） |

### 三、后端待实现

| 项目 | 说明 |
|------|------|
| 迁移工具 | `POST /api/biz-migrate-from-permission` — 将现有 Permission 数据迁移到 biz 表 |
| 列表分页 | biz-get-roles / biz-get-permissions 尚未支持分页，角色/权限量大时需加 |
| 策略变更 Webhook | 策略同步后通过 Webhook 通知业务系统刷新本地缓存 |

---

## ReBAC (Zanzibar) 关系型授权集成

**状态：待开发** | **方案文档：[docs/rebac-integration-plan.md](docs/rebac-integration-plan.md)**

在现有"应用授权"模块中引入 Zanzibar 风格 ReBAC，使用户创建应用时可选择 RBAC（Casbin）或 ReBAC 模型。采用轻量自建图引擎方案（复用现有 DB/缓存，零运维增量）。

### P1: 数据模型（2-3 天）

- [ ] `BizAppConfig` 增加 `ModelType`（"casbin" | "rebac"）和 `SchemaText` 字段
- [ ] 新建 `BizTuple` 结构体（Owner/AppName/ObjectType/ObjectId/Relation/SubjectType/SubjectId/SubjectRel）
- [ ] `ormer.go` 注册 `BizTuple` 表，配置复合索引（idx_forward + idx_reverse）
- [ ] 实现 Schema JSON 解析器（`biz_rebac_schema.go`）：JSON → 内存类型/关系定义结构
- [ ] BizTuple CRUD 函数（AddTuples / DeleteTuples / ReadTuples）

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
- [x] 单元测试覆盖：直接关系、userset、继承链、循环检测、深度限制 (CP-3 + openfga consolidated suite 112/134)

### P3: API 层（2 天）

- [ ] `BizEnforce` / `BizBatchEnforce` 按 `config.ModelType` 路由到 Casbin 或 ReBAC 引擎
- [x] 新增路由：`biz-write-tuples` / `biz-read-tuples` (CP-5 — delete 合并在 write 批次里,无独立 delete-tuples)
- [x] 新增路由：`biz-check` / `biz-batch-check` (CP-4)
- [x] 新增路由：`biz-list-objects` / `biz-list-users` (CP-5)
- [x] 新增路由：`biz-expand`（展开关系树，调试用）(CP-5)
- [ ] ReBAC 模式下适配 `biz-get-user-roles` / `biz-get-user-permissions`

### P4: 前端 Schema + Tuple（3-4 天）

- [ ] 创建向导步骤 2 增加模型类型选择（RBAC / ReBAC 卡片）
- [ ] `AppAuthorizationPage` 按 `modelType` 显示不同 Tab（概览/类型定义/关系数据/测试/集成）
- [ ] 新建 `BizSchemaEditor.tsx` — 可视化编辑对象类型和关系定义
- [ ] 新建 `BizTupleManager.tsx` — 元组管理表格（增删查 + 批量导入）
- [ ] `BizBackend.ts` 增加 tuple API 调用函数
- [ ] i18n 中英文翻译

### P5: 前端测试 + 集成（1-2 天）

- [ ] 新建 `BizReBACTester.tsx` — Check 测试器（输入主体/对象/关系，显示结果 + 路径）
- [ ] 集成 Tab 补充 ReBAC 模式的 SDK 代码示例（Go / TypeScript）
- [ ] 概览 Tab 适配 ReBAC 统计信息（类型数、关系数、元组数）

### P6: 缓存优化（2 天）

- [ ] sync.Map 元组查询结果缓存 + 写入时失效
- [ ] 可选 Redis 缓存层（复用 `bizPolicyCacheEnabled` 配置）
- [ ] ListObjects 并发遍历 + context 超时控制

### 清理

- [x] **CP-4 接入 cel-go 真正导入后，删除 `object/biz_rebac_anchor.go`**
  占位文件，仅为阻止 `go mod tidy` 在第一次真实使用前把 cel-go 从 vendor/ 剔除。
  已随 CP-4 Task 1 移除（`object/biz_rebac_condition.go` 现在真实导入 cel-go）。

### 相关代码位置

- 方案文档：`docs/rebac-integration-plan.md`
- BizAppConfig：`object/biz_app_config.go`
- Enforce 入口：`object/biz_enforcer_cache.go` — `BizEnforce`
- 现有 API：`controllers/biz_permission_api.go`
- 路由注册：`routers/router.go:231-254`
- 前端授权页：`web/src/pages/AuthorizationPage.tsx`
- 前端应用授权页：`web/src/pages/AppAuthorizationPage.tsx`

---

## Site 网关后端安全与性能审计

**审计日期：2026-04-16** | **状态：P0/P1 已修复，P2 部分修复**

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

- [ ] **证书监控持全局锁阻塞请求** — `object/site_timer.go:41-44` ⚠️ 剩余
  - `lock.Lock()` 期间执行 DB 查询 + ACME HTTP 请求，阻塞所有请求 100ms-1s
  - 修复：改为 per-site 锁或异步证书更新
  - 注意：涉及 ACME 证书续期流程，改动风险较高，建议单独分支做

- [x] **DNS 解析协程无上限泄漏** — `object/site_cache.go:102-108`
  - 每 5 秒为每个空 PublicIp 的 site 启动 goroutine，无 WaitGroup/信号量
  - 1000 站点 + DNS 慢 → 每小时数十万协程 → 内存耗尽
  - 修复：加 `semaphore.NewWeighted(10)` 限制并发数

- [ ] **全量刷新每 5 秒无变更检测** — `object/site_timer.go:65-84` ⚠️ 剩余
  - 每 5 秒 `GetGlobalSites()` + `GetGlobalRules()` 全量查库
  - `monitorSiteCerts()` 再次调 `GetGlobalSites()`（重复查询）
  - 修复：增量刷新 + UpdatedTime 变更检测，刷新间隔可调大到 30 秒
  - 注意：功能性改动，不影响稳定性，优先级低于安全修复

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

- [ ] **组合规则递归查找无记忆化** — `rule/rule_compound.go:32` ⚠️ 剩余
  - 嵌套规则每层重新查找 ruleMap
  - 修复：传递已加载规则的 map，避免重复查找
  - 注意：仅深度嵌套组合规则时有性能影响，实际场景罕见

- [x] **WAF Transaction 未关闭** — `rule/rule_waf.go:44`
  - `waf.NewTransaction()` 无 `defer tx.Close()`
  - 修复：加 `defer tx.Close()`

- [x] **错误信息泄露内部结构** — `service/proxy.go:246,257`
  - `site = %v` 暴露完整 Site 对象
  - 修复：生产环境默认不输出内部细节

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

> 多实例部署下仍有策略陈旧风险 —— 详见 **[业务权限模块改进计划 → 一、Redis 缓存 — 多实例部署支持](#一redis-缓存--多实例部署支持)**。本次交付默认单实例部署。

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
