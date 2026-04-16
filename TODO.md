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
