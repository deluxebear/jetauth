# Spec: ReBAC (Zanzibar) 集成 — OpenFGA 兼容实现

**状态**:Phase 1 Specify · ✅ 已冻结(2026-04-21)
**分支**:`feature/rebac-integration`
**取代文档**:`docs/rebac-integration-plan.md`(设计早期稿,以本文档为准)
**日期**:2026-04-21

---

## 1. Objective

### 要解决什么问题

JetAuth 现有的 "应用授权" (biz_*) 模块基于 Casbin RBAC,适合**角色-资源-动作**这类矩阵式权限,但面对以下场景力不从心:

- 文档/项目/仓库等**层级对象**的继承权限(folder.editor → 所有 document.editor)
- 团队/组**间接成员**关系(team:eng#member 作为主体)
- SaaS 产品常见的 "分享给某个用户/某个团队" 的资源级 ACL
- 与 AI Agent 生态对齐(OpenFGA 已是 OpenAI / LangChain / Vercel 的事实标准)

### 做什么

在 biz_* 模块内并行实现一套 **OpenFGA 协议兼容**的 ReBAC 引擎。用户创建 App 授权配置时在 Casbin / ReBAC 间二选一,此后该 App 的所有权限操作走对应引擎。

### 用户与成功指标

| 用户 | 场景 | 成功指标 |
|---|---|---|
| 后台管理员 | 创建 SaaS 应用,定义 `document/folder/team` 类型和 `viewer/editor/owner` 关系 | DSL 编辑器 / 可视化编辑器二选一,5 分钟内完成 schema 定义 |
| 业务开发 | 在代码里写 `client.Check("user:alice", "viewer", "document:doc-1")` | 贴近 OpenFGA SDK 的调用形态,文档示例可直接 copy |
| 业务开发 | 从 OpenFGA 迁移现有 schema 过来 | 原始 DSL 直接贴到编辑器可通过校验 |
| 应用运行时 | 在线 Check 调用 | p99 < 20ms(命中缓存)/ < 100ms(冷路径,100 tuples per object) |
| 管理员排错 | 某用户应该有权限但被拒 | Expand API + 前端 Tester 显示完整推导路径 |

### 不做什么(显式排除)

- **不做 Casbin → ReBAC 自动迁移工具**。ModelType 在 App 创建时固定,不提供切换。
- **不做独立部署的 OpenFGA Server 适配**。若将来需要,本实现的数据模型已兼容,可另起项目做迁移。
- **不做跨 App 共享的全局 schema**。每个 App 自己的 schema 和 tuples 完全隔离。
- **不做 OpenFGA OpenAPI URL 兼容**。SDK 用户用 JetAuth 自己的端点,或写轻薄 adapter。

---

## 2. Tech Stack

### 新增依赖

| 依赖 | 版本 | 用途 | 为何选择 |
|---|---|---|---|
| `github.com/openfga/language/pkg/go` | latest | OpenFGA DSL 词法/语法分析 + AST | 唯一成熟的 DSL 解析器,独立可用,Apache 2.0 |
| `github.com/google/cel-go` | v0.20+ | CEL 表达式求值(conditions) | OpenFGA conditions 用的就是 CEL,语义对齐 |
| `golang.org/x/sync/errgroup` | 已引入 | Check 算法的并发子分支求值 | 已在 `biz_enforcer_cache.go` 使用 |

**不引入**:`github.com/openfga/openfga/*`(server 内部包不稳定)、`github.com/openfga/go-sdk`(我们不做 OpenFGA client)、`github.com/openfga/api/*`(不跑 gRPC)。

### 现有依赖复用

- **ORM**:xorm,通过 `ormer.Engine` 注册新表
- **缓存**:复用 `bizPolicyCacheEnabled` 配置开关和现有 Redis 路径(`object/biz_redis_cache.go`)
- **并发**:singleflight 去重(已在 `bizEnforcerGroup` 用过)
- **后端框架**:Beego,路由在 `controllers.ApiController`

### 目标 OpenFGA 版本

**v1.8.x**(当前 2026-04 最新稳定版的 DSL 和 protobuf 语义)。未来升级策略:major 版本变更时在本 spec 里开单独 diff 章节,不强制同步。

---

## 3. 架构

### 3.1 组件图

```
BizAppConfig (owner, appName, modelType: "casbin"|"rebac")
       │
       ├─ modelType="casbin"  ──→  现有 Casbin 路径(完全不动)
       │                            biz_role / biz_permission / biz_{app}_policy
       │
       └─ modelType="rebac"   ──→  ReBAC 路径(本 spec 新建)
                                   BizAuthorizationModel (schema 版本化)
                                   BizTuple (关系元组)
                                   ReBAC Engine (Check / ListObjects / ListUsers / Expand)
                                   BizTupleCache (sync.Map + Redis)
```

### 3.2 请求入口(BizEnforce 分派)

`BizEnforce(owner, appName, request)` 按 `ModelType` 路由:
- `casbin` → 保留现有代码路径,零变化
- `rebac` → 新 `ReBACCheck(owner, appName, tupleKey, contextualTuples?, authModelId?)`

### 3.3 多租户隔离

`store_id = "{owner}/{appName}"`。每个 tuple 和每个 authorization model 必带 `store_id`;所有查询都带 `WHERE store_id = ?`。跨 store 查询在路由层就被堵死。

---

## 4. 数据模型

### 4.1 BizAppConfig 扩展

```go
type BizAppConfig struct {
    // ... 现有字段不变(Owner, AppName, ModelText, PolicyTable, IsEnabled, ...)

    ModelType                   string `xorm:"varchar(20) default 'casbin'" json:"modelType"`
    // 当前生效的 authorization model id (ULID).
    // 写 tuple / Check 默认用这个 model;允许 API 传参指定历史 model。
    CurrentAuthorizationModelId string `xorm:"varchar(40)" json:"currentAuthorizationModelId"`
}
```

**向后兼容**:所有现存行 `ModelType` 按默认值 `casbin` 处理,零迁移。

### 4.2 BizAuthorizationModel(新表)

```go
type BizAuthorizationModel struct {
    Id          string `xorm:"varchar(40) pk" json:"id"` // ULID
    Owner       string `xorm:"varchar(100) notnull index(idx_store)" json:"owner"`
    AppName     string `xorm:"varchar(100) notnull index(idx_store)" json:"appName"`
    SchemaDSL   string `xorm:"mediumtext" json:"schemaDsl"`  // 原始 DSL
    SchemaJSON  string `xorm:"mediumtext" json:"schemaJson"` // 解析后的 typesystem(OpenFGA protobuf JSON 形态)
    SchemaHash  string `xorm:"varchar(64) index" json:"schemaHash"` // sha256(SchemaDSL) 用于去重
    CreatedTime string `xorm:"varchar(100)" json:"createdTime"`
    CreatedBy   string `xorm:"varchar(200)" json:"createdBy"`
}
```

**写入规则**:
- 管理员 "保存 schema" 时,先计算 SchemaHash;若与 App 当前 model 的 hash 相同,不插新行、不改 `CurrentAuthorizationModelId`。
- 若 hash 不同,插入新行,更新 `BizAppConfig.CurrentAuthorizationModelId`。
- **永远不 UPDATE 或 DELETE 已插入的 authorization model 行**(OQ-1 = 不允许)。历史模型保留是兼容性契约 —— 即使 tuples 绑定到旧 model,也必须能精确回放历史 Check 结果。
- **唯一例外**:`DeleteBizAppConfig` 级联清理该 App 的全部 Authorization Models。**没有** `DeleteBizAuthorizationModel` 这个 API,也不在前端提供 "删除历史模型" 的操作入口。

**schema 变更前的 tuple 校验(Q3=a)**:保存新 schema 前,扫描当前 store 下所有 tuples,若任何 tuple 的 `object_type#relation` 在新 schema 里找不到,**拒绝保存并返回冲突列表**。前端提示 "有 N 条 tuple 引用了已删除的关系,请先清理"。

### 4.3 BizTuple(新表)

严格对齐 OpenFGA TupleKey 形态(Q2 = 强兼容):

```go
type BizTuple struct {
    Id           int64  `xorm:"pk autoincr" json:"-"`
    StoreId      string `xorm:"varchar(200) notnull index(idx_forward) index(idx_reverse)" json:"storeId"`
    Owner        string `xorm:"varchar(100) notnull" json:"owner"`   // 派生自 StoreId,便于 ORM 级过滤
    AppName      string `xorm:"varchar(100) notnull" json:"appName"` // 派生自 StoreId

    // OpenFGA TupleKey 原始三元组(全部存完整字符串,不拆分):
    Object       string `xorm:"varchar(256) notnull index(idx_forward)" json:"object"`    // "document:doc-1"
    Relation     string `xorm:"varchar(100) notnull index(idx_forward)" json:"relation"`  // "viewer"
    User         string `xorm:"varchar(256) notnull index(idx_reverse)" json:"user"`      // "user:alice" | "team:eng#member" | "user:*"

    // 派生列(写入时从 Object/User 里拆,用于反向查询):
    ObjectType   string `xorm:"varchar(100) notnull index(idx_reverse)" json:"-"` // "document"
    UserType     string `xorm:"varchar(100) notnull index(idx_reverse)" json:"-"` // "user" | "team"
    UserRelation string `xorm:"varchar(100)" json:"-"`                             // "" | "member"

    // Conditions(Q1 = a;OQ-4 = 严格对齐 openfga-spec):
    ConditionName    string `xorm:"varchar(100)" json:"conditionName,omitempty"`
    // ConditionContext 存 google.protobuf.Struct 的 JSON 形态
    // (openfga RelationshipCondition.context 字段的 wire format)。
    // list → JSON array,map → JSON object,number → JSON number,
    // 不做 string 化;unmarshal 到 CEL 变量时保留类型。
    ConditionContext string `xorm:"text" json:"conditionContext,omitempty"`

    // 绑定到哪个 authorization model(Q2 = a 模型版本化):
    AuthorizationModelId string `xorm:"varchar(40) notnull index" json:"authorizationModelId"`

    CreatedTime string `xorm:"varchar(100)" json:"createdTime"`
}
```

**索引设计**:
- `idx_forward`: `(store_id, object, relation)` — Check 和 Expand 路径的主干查询
- `idx_reverse`: `(store_id, user, user_type, object_type)` — ListObjects 的反向查询
- `idx_store`: 在 BizAuthorizationModel 上的 `(owner, app_name)`

**通配(Q4=a)**:`User="user:*"` 作为普通行存储;Check 时除了精确匹配,额外查一次 `User="{user_type}:*"`。

**Contextual Tuples**:请求级临时 tuples,**不入库**,仅在单次 Check 的 memo 上下文里注入。

### 4.4 与 OpenFGA 形态的差异

| 项 | OpenFGA | JetAuth 实现 | 影响 |
|---|---|---|---|
| Store 概念 | 独立资源,有 id/name | 映射为 `{owner}/{appName}` | 无,但 API 层会暴露 `storeId` 字段便于 SDK 对齐 |
| Tuple 主键 | (store, object, relation, user) 复合 | 自增 id + 唯一索引 | xorm 兼容性 |
| Schema 存储 | 只存 JSON (typesystem) | 同时存 DSL + JSON | 保留用户原始输入,便于可视化编辑器反向解析 |
| Conditions 参数类型 | 强类型(int/string/list/map) | 存 JSON,CEL 求值时动态解析 | 初版够用;未来如需类型检查再加 |

---

## 5. DSL / Schema

### 5.1 DSL 示例(OpenFGA v1.x 语法,直接复用)

```
model
  schema 1.1

type user

type team
  relations
    define member: [user, team#member]

type folder
  relations
    define owner: [user]
    define editor: [user, team#member] or owner
    define viewer: [user, team#member] or editor

type document
  relations
    define parent: [folder]
    define owner: [user]
    define editor: [user] or owner or editor from parent
    define viewer: [user] or editor or viewer from parent

condition non_expired_grant(current_time: timestamp, expires_at: timestamp) {
  current_time < expires_at
}

type grant
  relations
    define grantee: [user with non_expired_grant]
```

### 5.2 重写规则覆盖

Check 算法必须支持 OpenFGA v1.1 schema 的所有 rewrite(Q1/Q3 = 完全实现):

| 规则 | DSL 语法 | 实现点 |
|---|---|---|
| `this` | `define viewer: [user]` | 直接查 tuple |
| `computed_userset` | `define viewer: editor` | 递归到同对象其他关系 |
| `tuple_to_userset` | `define viewer: viewer from parent` | 先查 parent 关系对应的对象,再递归 |
| `union` | `A or B` | 任一子分支为 true 即 true,errgroup 并发短路 |
| `intersection` | `A and B` | 所有子分支为 true 才 true |
| `difference` | `A but not B` | A 为 true 且 B 为 false |
| `type_restriction` | `[user, team#member]` | 写 tuple 时校验 |
| `wildcard` | `[user:*]` | 允许写 `user:*` tuple,Check 时额外匹配 |
| `conditional_type_restriction` | `[user with non_expired_grant]` | tuple 带 conditionName,Check 时 CEL 求值 |

### 5.3 解析 pipeline

```
DSL text
  → openfga/language/pkg/go/transformer.TransformDSLToProto()
  → openfgav1.AuthorizationModel (protobuf struct)
  → 序列化为 JSON 存入 SchemaJSON
  → 内存缓存(按 authorization_model_id 索引)
```

编辑器保存时:DSL → Proto → 内部校验(类型引用完整性、无环检测除受 OpenFGA 允许的自引用外)→ 落库。

---

## 6. 引擎(核心算法)

### 6.1 Check

```go
func ReBACCheck(req CheckRequest) (*CheckResult, error)

type CheckRequest struct {
    StoreId              string
    AuthorizationModelId string        // 可选,默认 App.CurrentAuthorizationModelId
    TupleKey             TupleKey      // {Object, Relation, User}
    ContextualTuples     []TupleKey    // 可选,Q1=a
    Context              map[string]any // CEL 求值上下文
}

type CheckResult struct {
    Allowed    bool
    Resolution string  // 推导路径(Expand 形式,供 Tester 展示)
}
```

算法参考 `openfga/openfga/pkg/server/commands/check.go` 的分层求值器:
1. **深度限制**:`maxResolutionDepth = 25`(和 OpenFGA 默认一致),超限返回 error 而非 false,防止 schema 死循环被掩盖为 "无权"。
2. **请求级 memo**:key 为 `object#relation@user|conditionHash`,同请求内重复子查询直接返回缓存。
3. **errgroup 并发**:union 的子分支并发跑,任一 true 立即 cancel 其余;intersection 并发跑,任一 false 立即 cancel。
4. **tuple_to_userset 懒展开**:只在真正需要时查 parent tuples,不提前拉全量。
5. **Conditions 求值**:命中 tuple 带 conditionName 时,合并 schema 定义的 condition 参数 + tuple 的 ConditionContext + 请求的 Context,用 cel-go 编译并求值,false 视为 tuple 不存在。

### 6.2 Expand

`ReBACExpand(object, relation)` 返回关系树 JSON(OpenFGA expand API 格式),供 Tester 可视化。

### 6.3 ListObjects(Q5=b 分页)

```go
func ReBACListObjects(req ListObjectsRequest) (*ListObjectsResult, error)

type ListObjectsRequest struct {
    StoreId              string
    AuthorizationModelId string
    ObjectType           string  // "document"
    Relation             string  // "viewer"
    User                 string  // "user:alice"
    ContextualTuples     []TupleKey
    Context              map[string]any
    PageSize             int     // 默认 100,上限 1000
    ContinuationToken    string  // base64 编码的游标
}

type ListObjectsResult struct {
    Objects           []string
    ContinuationToken string // 空表示已到末尾
}
```

实现策略:
- **反向查询起点**:从 user 端出发,走 idx_reverse 拉 tuples,按 object_type 过滤。
- **按 object_id 排序 + cursor**:游标存 `last_object_id` 和 "是否已穷尽 intersection 分支" 等状态。
- **内部硬超时**:context 10s timeout(上限 1000 × Check 成本)。超时返回已收集的 objects + 游标。

### 6.3.1 产品级 ListObjects 要求(OQ-5 = 产品级)

ListObjects 是**业务应用前端 "我能看到哪些资源" 的主干 API**,不是管理员工具。因此必须满足:

| 项 | 要求 |
|---|---|
| **延迟 SLA** | p50 < 50ms、p99 < 300ms(单 store 10k tuples + 默认 page_size=100) |
| **限流** | 按 `store_id` + `user` 做 token bucket:20 req/s,突发 40。超限返回 429 而不是拖垮引擎 |
| **缓存** | L2 sync.Map 命中结果(key = `store/model/objectType/relation/user`),TTL 10s,write tuple 时精确失效 |
| **可观测** | 每次调用埋点:duration、candidate count、cache hit、cursor depth。暴露到 Prometheus `biz_rebac_list_objects_duration_seconds` |
| **SDK 示例** | `web/src/components/BizAuthzIntegrationTab.tsx` 里 ReBAC 模式的 TS 示例必须演示:分页循环、错误处理、429 退避、contextual tuples 透传 |
| **并发安全** | 单次 ListObjects 内部用 errgroup,上限 8 并发(避免耗光 DB 连接池) |

**验收**:在 CP-5 和 CP-8 分别验证 —— CP-5 只看功能性(cursor、超时),CP-8 看 SLA + 限流 + 可观测。

### 6.4 ListUsers

反向类似:给定 `(object, relation)`,反推所有满足的 user。相同的 cursor 分页机制。

### 6.5 Write / Read / Delete Tuples

- Write:批量接收 [add_tuples, delete_tuples],单事务。写入前按**当前 authorization model** 校验 schema 合法性(object_type 存在、relation 存在、user 的 type restriction 满足)。
- Read:按 `(object?, relation?, user?)` 过滤,支持 cursor。
- Delete:按完整 tuple key 删。**不支持按前缀批删**(这会让并发写入陷入不一致,上层如需可循环调用)。

### 6.6 缓存

| 层 | 策略 | 失效 |
|---|---|---|
| L1 请求级 memo | sync.Map,生命周期 = 单次 Check | 自动(请求结束) |
| L2 热点 tuple | `sync.Map[storeId → sync.Map[object#relation → []Tuple]]`,LRU 1000 条 per store | Write/Delete tuple 时精确失效;schema 切换时整 store flush |
| L3 Redis(可选) | 复用 `bizPolicyCacheEnabled` 配置,key 前缀 `biz:tuple:` | 同 L2,带 TTL 30min 兜底 |

Check 结果**不缓存**(输入维度太高,命中率低,易产生权限滞后)。

---

## 7. API 层

### 7.1 路由清单(新增,全部在 `ApiController` 上)

| 方法 | URL | 用途 |
|---|---|---|
| POST | `/api/biz-write-authorization-model` | 保存 schema,返回新 model id |
| GET  | `/api/biz-read-authorization-model` | 按 id 读 schema(不传 id 取 current) |
| GET  | `/api/biz-list-authorization-models` | 按 store 列历史 schema(分页) |
| POST | `/api/biz-write-tuples` | 批量 add/delete tuples |
| GET  | `/api/biz-read-tuples` | 按过滤条件读 tuples(分页) |
| POST | `/api/biz-check` | 单次 Check(含 contextual tuples + context) |
| POST | `/api/biz-batch-check` | 批量 Check |
| POST | `/api/biz-list-objects` | ListObjects |
| POST | `/api/biz-list-users` | ListUsers |
| POST | `/api/biz-expand` | 展开关系树(调试) |

所有路由查询参数都以 `?appId={owner}/{appName}` 定位 store。

### 7.2 现有路由行为变化

| API | 当前行为 | ReBAC 模式下 |
|---|---|---|
| `biz-enforce` | Casbin enforce | 内部走 `ReBACCheck`,请求体形态:`{subject, object, relation}` |
| `biz-batch-enforce` | Casbin batch | 同上,批量 |
| `biz-get-user-roles` | Casbin GetRolesForUser | **400 + 指引错误体**(见下),不做 ad-hoc 映射。内部调用面已 grep 确认:0 处消费者,安全阻断 |
| `biz-get-user-permissions` | 遍历 BizPermission | **400 + 指引错误体**,建议 SDK 迁移到 `biz-list-objects` |

**指引错误体格式**(OQ-2 决议):
```json
{
  "status": "error",
  "code": "BIZ_API_NOT_SUPPORTED_IN_REBAC",
  "msg": "biz-get-user-roles does not apply in ReBAC mode. ReBAC has no global \"role\" concept; use biz-list-objects with the appropriate object type.",
  "suggestion": "/api/biz-list-objects",
  "example": {
    "appId": "{owner}/{appName}",
    "type": "role",
    "relation": "assignee",
    "user": "user:<id>"
  }
}
```
| `biz-get-policies` | 导出策略 | 导出 schema DSL + 全量 tuples(分页) |

### 7.3 错误码语义

沿用现有 `BizAuthzKind`,增加:
- `BizAuthzKindSchemaInvalid` — DSL 解析失败或类型检查失败
- `BizAuthzKindModelNotFound` — 指定 authorization_model_id 不存在
- `BizAuthzKindConditionFailed` — CEL 求值出错(不同于 false,是表达式本身崩)
- `BizAuthzKindDepthExceeded` — Check 深度超限
- `BizAuthzKindNotSupportedInReBAC` — 对应 HTTP 400 `BIZ_API_NOT_SUPPORTED_IN_REBAC`(见 §7.2)
- `BizAuthzKindRateLimited` — ListObjects 限流,对应 HTTP 429(见 §6.3.1)

---

## 8. 前端 UI

### 8.1 App 创建向导

步骤 2 "选择授权模型":两张卡片 RBAC / ReBAC,每张带一段 <80 字的定位文案 + 一个 "何时选我" 的 Tooltip。选 RBAC 走现有流程,选 ReBAC 走新流程。

### 8.2 AppAuthorizationPage Tabs

```
ReBAC 模式:
  [概览]  [Schema]  [Tuples]  [Tester]  [集成]
```

**概览**:卡片展示类型数、关系数、tuple 总量、最近一次 schema 更新时间、当前 model id (短 ULID)。

**Schema**(Q6=c 双形态;OQ-3 = 可视化必须全功能):
- **Tab A — DSL 编辑器**:CodeMirror 6 + 自定义 lezer grammar 做语法高亮,失焦即调 `/api/biz-preview-authorization-model?dryRun=true` 做服务端校验,错误 inline 显示。
- **Tab B — 可视化编辑器**(query-builder 风格,覆盖 OpenFGA v1.1 全部 rewrite):
  - 左侧:类型列表 + "添加类型" 按钮
  - 右侧针对选中类型:关系列表 + "添加关系" 按钮
  - 点击某关系进入 rewrite tree 编辑器:
    - 根节点是 **union / intersection / difference** 三选一(默认 union)
    - 子节点可以是:
      - **直接关系** (`this`) — 多选 user types,支持 `[user]` / `[user:*]`(通配)/ `[team#member]`(userset)/ `[user with condition_name]`(带条件)
      - **同对象关系引用** (`computed_userset`) — 下拉选当前类型的其他关系
      - **关联对象关系** (`tuple_to_userset`) — 两个下拉:through(当前类型的某关系)+ target(对端类型的某关系),对应 DSL `X from Y`
      - **嵌套 union/intersection/difference** — 递归子树
    - 每个节点有 "上移 / 下移 / 删除" 操作;difference 特殊:严格 2 个子节点(被减数 + 减数),UI 上左右布局不是上下
  - 顶部 "预览 DSL" 侧边栏,实时反显当前可视化构造的 DSL(只读)
  - 双向同步:Tab A ↔ Tab B 共享同一内存 AST;任一 Tab 改动立即更新另一侧。无法解析的 DSL 片段(例如语法错误)在 Tab B 显示错误徽标 + 锁定该关系的编辑,引导用户先回 Tab A 修好
- 保存按钮共用,保存前确认:若破坏性修改(删除类型/关系)→ 弹模态框列出受影响的 tuples,要求 "先清理 tuples" 或 "取消"。

**可视化 rewrite 树示例**(对应 DSL `define viewer: [user] or editor but not banned_user`):
```
difference
├─ union
│   ├─ this: [user]
│   └─ computed_userset: editor
└─ computed_userset: banned_user
```

**Tuples** (`BizTupleManager.tsx`):
- 复用 `DataTable`(见 `web/docs/list-page-pattern.md`):分页 + 按 object / relation / user 筛选 + bulk delete。
- 新建 tuple 表单:三个 select(object_type / relation / user_type),对齐当前 schema 校验;可视化地阻止写出违反 type restriction 的 tuple。
- 批量导入:贴 CSV / JSON,预览 → 校验 → 应用。

**Tester** (`BizReBACTester.tsx`):
- 输入:user / object / relation(+ 可选 contextual tuples 的 JSON 区 + context 变量 JSON 区)。
- 输出:✅/❌ + Expand 树状图(d3 或 react-flow,轻量实现即可),每个节点标注 "why allowed/denied"。
- 历史记录:最近 20 次 Check,存 localStorage。

**集成**(OQ-5 = 产品级):SDK 代码片段(Go / TypeScript / Python),示例覆盖:
- 基础 Check + Write
- Contextual tuples + conditions context
- **业务前端资源列表模式**(ListObjects 在业务 App 中的标准用法):
  - React hook 封装:`useAccessibleResources(objectType, relation)` 带分页循环和错误处理
  - 429 退避:指数 backoff + jitter
  - Prefetch 缓存:与业务数据 fetch 并行,Check 用 batch
  - 客户端权限收窄(Check 是服务端权威,前端隐藏 UI 仅做体验优化)

### 8.3 组件清单

| 文件 | 操作 |
|---|---|
| `web/src/pages/AppAuthorizationPage.tsx` | 修改(按 modelType 分派 Tab 集合) |
| `web/src/pages/BizAppConfigCreatePage.tsx` | 修改(向导步骤 2 加模型选择) |
| `web/src/components/BizSchemaDslEditor.tsx` | 新增 |
| `web/src/components/BizSchemaVisualEditor.tsx` | 新增 |
| `web/src/components/BizSchemaEditor.tsx` | 新增(内含 Tab 切换 + 双向同步) |
| `web/src/components/BizTupleManager.tsx` | 新增 |
| `web/src/components/BizReBACTester.tsx` | 新增 |
| `web/src/backend/BizBackend.ts` | 扩展 tuple + schema + check 相关 API |
| `web/src/locales/{zh,en}.ts` | 新 i18n 键 |

---

## 9. Project Structure

### 新增后端文件

```
object/
  biz_rebac_tuple.go         # BizTuple CRUD + 派生列计算
  biz_rebac_model.go         # BizAuthorizationModel CRUD + schema hash
  biz_rebac_schema.go        # DSL ↔ JSON 转换(封装 openfga/language)
  biz_rebac_engine.go        # ReBACCheck / Expand 主入口 + rewrite 求值
  biz_rebac_list.go          # ListObjects / ListUsers + cursor 实现
  biz_rebac_condition.go     # CEL 编译器缓存 + 求值
  biz_rebac_cache.go         # L2 sync.Map 缓存 + 失效广播
  biz_rebac_validate.go      # schema 变更前的 tuple 冲突扫描
  biz_rebac_engine_test.go
  biz_rebac_openfga_suite_test.go  # 移植 openfga consolidated test
controllers/
  biz_rebac_api.go           # 10 个新路由的 HTTP handler
routers/
  router.go                  # 注册新路由
```

### 修改后端文件

```
object/biz_app_config.go        # +ModelType, +CurrentAuthorizationModelId
object/biz_enforcer_cache.go    # BizEnforce 按 ModelType 分派
object/adapter.go (或 ormer.go) # 注册 BizTuple + BizAuthorizationModel
```

### 前端结构见 §8.3。

---

## 10. Code Style

### 10.1 Go 风格示例(对齐现有 biz_* 代码)

```go
// ReBACCheck evaluates whether the given user has the relation on the object.
// Follows the OpenFGA v1.1 semantics: this / computed_userset / tuple_to_userset
// with union / intersection / difference rewrites. Request-scoped memo prevents
// repeat work across recursive branches. Honors the max resolution depth from
// OpenFGA's reference implementation to keep misauthored schemas from looking
// like "no permission" instead of "you wrote a cycle".
func ReBACCheck(req *CheckRequest) (*CheckResult, error) {
    if req == nil {
        return nil, fmt.Errorf("rebac check: nil request")
    }
    store, err := resolveStore(req.StoreId)
    if err != nil {
        return nil, err
    }
    model, err := resolveAuthorizationModel(store, req.AuthorizationModelId)
    if err != nil {
        return nil, err
    }
    ctx := newCheckContext(store, model, req)
    allowed, resolution, err := checkRewrite(ctx, req.TupleKey, 0)
    if err != nil {
        return nil, err
    }
    return &CheckResult{Allowed: allowed, Resolution: resolution}, nil
}
```

**约定**:
- 导出函数**必须有一行注释**说明*为什么*,不只是*是什么*(和现有 biz_* 同风格)。
- 错误消息以 **包前缀 + 具体错误**开头:`"rebac check: model %s not found"`。
- 内部函数小写,不写文档注释(除非有 tricky 不变量)。
- 所有外部 I/O(ORM 查询)必须带 context,即使当前 Beego 没传过来 —— 在函数内用 `context.Background()` 封装,为后续引入 request-scoped context 留出口子。

### 10.2 避免

- **不写** "这是 OpenFGA 的 xxx 对应实现" 之类指向上游实现的注释 —— 用 git blame + `docs/rebac-spec.md` 定位。
- **不写** TODO/FIXME 留给 "未来的自己";要么当前 PR 解决,要么开 TODO.md 条目。
- **不 mock** 整个引擎做单元测试 —— 引擎本身要求真实 DB fixtures(见 §11)。

---

## 11. Testing Strategy

### 11.1 Go 单元测试

| 模块 | 测试范围 |
|---|---|
| `biz_rebac_schema_test.go` | DSL 解析 roundtrip(DSL → Proto → JSON → DSL 字节一致)+ 错误 schema 的定位错误 |
| `biz_rebac_tuple_test.go` | 派生列计算、通配、conditional tuple 存取 |
| `biz_rebac_model_test.go` | Schema hash 去重、变更前冲突扫描、无 Delete API(尝试删返回 405) |
| `biz_rebac_engine_test.go` | 五种 rewrite 逐条单独测;memo 命中;maxDepth;并发短路 |
| `biz_rebac_condition_test.go` | CEL 编译缓存、参数类型错误、求值异常路径;**JSON serialization roundtrip vs openfga-spec fixtures**(list/map/number 类型保真)(OQ-4) |
| `biz_rebac_list_test.go` | 分页游标稳定性、超时、**限流返回 429**、cache hit 命中率断言 |
| `biz_rebac_compat_test.go` | ReBAC 模式下 `biz-get-user-roles` / `biz-get-user-permissions` 返回指引错误体(OQ-2) |

### 11.2 OpenFGA 一致性测试

从 `github.com/openfga/openfga` 仓库抓取 `tests/consolidated_1_1_tests.yaml`,编写 loader 转换为 Go 子测试。每次 go test 跑一次。

**验收标准**:通过率 100%(如有上游测试因我们不实现的特性而失败,在本 spec 开新章节显式记录豁免项)。

### 11.3 前端测试

- Vitest + React Testing Library:SchemaEditor 双向同步、TupleManager 的 CRUD、Tester 的输入输出契约。
- Playwright e2e:一个端到端场景 —— 新建 ReBAC App → 写 schema → 加 tuples → Tester check → 预期结果。

### 11.4 集成测试

`object/biz_rebac_integration_test.go`(CI tag `integration`):起 SQLite,建 store,写 1k tuples,跑 100 次 Check 验证 p99 < 50ms。

### 11.5 不做的测试

- 不做模糊测试(OpenFGA 上游已做过,我们的 DSL 解析直接借它的)
- 不做压测(超出本轮范围;如需后续用 k6 单起)

---

## 12. Commands

```bash
# 开发循环
make run                                                 # 起后端
cd web && npm run dev                                    # 起前端 :7001

# 本模块单元测试
go test -v ./object/ -run ReBAC                          # 只跑 ReBAC 相关
go test -v ./object/ -run TestReBACCheckOpenFGASuite     # 一致性套件

# 单测试点
go test -v ./object/ -run TestReBACCheck_UnionShortCircuit

# 集成测试
go test -v -tags integration ./object/ -run ReBACIntegration

# Lint
make lint
cd web && npm run lint

# 生成 swagger(加新路由后)
# (待确认 swag v2 的准确命令,见 reference_openapi_generation 记忆)

# 前端测试
cd web && npx vitest run src/components/BizSchemaEditor.test.tsx
cd web && npm run e2e -- --grep rebac
```

---

## 13. Boundaries

### Always(必须做)

- **所有 DSL 解析走 `openfga/language`,不手写 parser**。
- **所有 tuple 写入必须先过当前 model 的 type 校验**,违反即 400。
- **每个 Check rewrite 必须有独立单元测试**,覆盖 true/false/递归/短路。
- **schema 变更必须保留旧 authorization model**,不 UPDATE 或 DELETE。
- **Casbin 代码路径零修改**。只在 `BizEnforce` 入口加 `if ModelType == "rebac"` 分派。
- **请求级 memo 必须在 CheckRequest 构造时初始化**,不能漏导致指数爆炸。

### Ask first(动手前跟用户确认)

- 新增数据库表或给 BizAppConfig 加列以外的 schema 变更
- 引入除 §2 列出的以外的新依赖
- 修改 `BizEnforce` 或 `BizBatchEnforce` 的函数签名
- 改 OpenFGA 兼容性相关的行为(例如决定不支持某个 rewrite)
- 改 caching 策略(L2/L3 的键或失效)
- 本 spec 描述的 10 个新路由的 URL 或请求/响应形态

### Never(绝不)

- 把 Casbin 和 ReBAC 的数据混存一张表
- 在 Check 热路径做 DB 查询不走索引
- 因为 OpenFGA 上游实现复杂就简化语义(例如 "conditions 先不求值,默认 true")
- 静默丢弃 tuples(schema 变更时要么拒绝要么级联,不能 "看不见就当不存在")
- 跳过 OpenFGA 一致性测试中失败的用例不分析就 skip
- 在未 review 的情况下 merge 违反 §13 Always 的代码
- **提供 `DeleteBizAuthorizationModel` API 或前端删除入口**(OQ-1)
- **对 `biz-get-user-roles` / `biz-get-user-permissions` 在 ReBAC 模式下做 "尽力而为" 的 ad-hoc 映射**(OQ-2)—— 语义不可靠比 400 指引更危险
- **因为 "可视化编辑器做 intersection/difference 太难" 就降级为 MVP 子集**(OQ-3)
- **把 condition context 的 list/map 参数 string 化绕过类型**(OQ-4)
- **把 ListObjects 当成 "管理员工具" 裁掉限流 / SLA / 可观测**(OQ-5)

---

## 14. Success Criteria

**上线判据**(全部必须通过):

- [ ] **OpenFGA 一致性**:`tests/consolidated_1_1_tests.yaml` 全部通过,无豁免项(或豁免项在本 spec 有书面理由)。
- [ ] **端到端主流程**:UI 创建 ReBAC App → DSL 编辑器写 7 类型 schema → 写 10 条 tuples → Tester Check 10 种场景(含 tuple_to_userset、conditions、contextual tuples、wildcard),结果 100% 正确。
- [ ] **性能基线**:单 store 1000 tuples,Check p99 < 50ms(冷);10000 tuples 下 ListObjects(page_size=100) < 500ms。
- [ ] **模型版本化**:连续保存 3 个版本 schema → 历史全保留 → 按 id 可读 → 删除一个 type 且有 tuple 引用 → 保存被拒绝并精确列出冲突 tuple。
- [ ] **双形态编辑器**:任一形态的修改能同步到另一形态,AST 一致,保存后 DSL 字节与输入一致(或等价形态)。
- [ ] **Casbin 零回归**:现有 Casbin 应用的所有 `make ut` + `npm run build` + 手动主路径测试 100% 通过。
- [ ] **前端 i18n 完整**:`npm run check:i18n` 无警告。
- [ ] **文档**:`CHANGES-FROM-CASDOOR.md` 和 `CLAUDE.md` 更新;`docs/rebac-integration-plan.md` 标记为 "superseded by rebac-spec.md"。
- [ ] **Swagger**:新 API 有 swag v2 注解,`swagger.json` 重新生成且 schema 校验通过。
- [ ] **§16 决议全部在代码中兑现**(无悄悄退化到 MVP 子集的情况)。

---

## 15. Review Checkpoints(Q7 = c)

整个实施分 **8 个 checkpoint**,每个 checkpoint 完成后暂停,向用户演示 + 收集反馈再推进下一步:

| # | 交付物 | 验证方式 |
|---|---|---|
| CP-1 | 数据模型 + 迁移(BizAppConfig 改字段、BizAuthorizationModel + BizTuple 建表) | 手写 SQL 插几行,`go test -run TestBizRebacCRUD` 通过;`make run` 不崩 |
| CP-2 | DSL 解析 + schema 保存 API(不带任何 Check 能力) | 贴 §5.1 示例 DSL,保存成功,SchemaJSON 可读回;破坏性变更阻断验证;尝试删除 model 返回 405 |
| CP-3 | Check 核心(五种 rewrite,不含 conditions) | `openfga/consolidated_1_1_tests.yaml` 的 non-conditional 子集通过 |
| CP-4 | Conditions + Contextual tuples | 全量 consolidated test 通过;CEL 参数 JSON roundtrip 通过(OQ-4) |
| CP-5 | ListObjects + ListUsers + Expand(含分页,功能性) | 1k tuples 验证 cursor 稳定性 + 基础性能;两个兼容 API 返回指引错误体(OQ-2) |
| CP-6 | 缓存 L2/L3 + 失效传播 | Write/Delete 后 Check 立即反映;多实例场景下 Redis 失效 |
| CP-7 | 前端 Schema 编辑器 **(DSL + 全功能可视化,含 intersection/difference/条件/嵌套)** + TupleManager | 手动双向切换测试覆盖 §8.2 的 rewrite 树所有节点类型;无法解析 DSL 时可视化侧正确锁定(OQ-3) |
| CP-8 | Tester + SDK 示例 + i18n + 文档收尾 + **产品级 ListObjects 验收** | §14 全部勾选;ListObjects SLA(p50/p99)、限流(429)、Prometheus 指标、业务前端 SDK 示例全部实测通过(OQ-5) |

**每个 CP 结束时 commit**,commit message 格式:`feat(rebac): CP-N {summary}`,便于按 checkpoint 回滚或 review。CP-4 和 CP-8 是 "门槛 checkpoint" —— 未通过前不启动下一个。

每个 CP 结束时 commit,commit message 格式:`feat(rebac): CP-N {summary}`,便于按 checkpoint 回滚或 review。

---

## 16. Resolved Decisions Log

Phase 1 评审过程中确认的关键选择,入代码前全部冻结:

| # | 问题 | 决定 | 落点 |
|---|---|---|---|
| OQ-1 | 历史 Authorization Model 是否可删 | **否**(App 级联删除除外) | §4.2 写入规则;§13 Never;无 `DeleteBizAuthorizationModel` API |
| OQ-2 | ReBAC 模式下 `biz-get-user-{roles,permissions}` 行为 | 400 + 指引错误体(已 grep 确认 0 内部调用者) | §7.2 错误体;§7.3 `BizAuthzKindNotSupportedInReBAC` |
| OQ-3 | 可视化编辑器功能范围 | **全功能**(含 intersection/difference/嵌套/条件) | §8.2 query-builder UI;CP-7 |
| OQ-4 | Condition context JSON 序列化策略 | **严格**对齐 openfga-spec(list/map/number 保真) | §4.3 注释;§11 roundtrip 测试;CP-4 |
| OQ-5 | ListObjects 定位 | **产品级**(业务前端主干 API) | §6.3.1 SLA/限流/可观测;§8 SDK 示例;CP-8 |

Phase 1 前 5+7 决策(§1 开头的设计原则、§5 DSL 选择、§4 强兼容等)已在对应章节固化,不在此重复。

---

## 17. 取代与归档

本 spec 生效后:

- `docs/rebac-integration-plan.md` 在头部加 `> **Superseded by [`rebac-spec.md`](rebac-spec.md)** — early design draft, kept for reference.` 并保留。
- `TODO.md` 的 "ReBAC (Zanzibar) 关系型授权集成" 章节改为指向 §15 Checkpoint 清单,checkbox 复用。
- `CLAUDE.md` 的架构章节在 ReBAC 提及处加链接。

---

**Phase 1 状态**:✅ 已完成 — 所有 OQ 已决议(见 §16),规格冻结。下一步进入 Phase 2 Plan(出任务级实施计划)。
