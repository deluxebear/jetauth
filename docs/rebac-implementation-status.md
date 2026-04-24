# ReBAC 模块实施状态与能力边界

**基线分支**:`feature/rebac-cp3`(含 CP-1 ~ CP-7 全部落地)
**对应 Spec**:[`rebac-spec.md`](rebac-spec.md)
**对应 Plan**:[`rebac-plan.md`](rebac-plan.md)
**对应操作手册**:[`rebac-operations-guide.md`](rebac-operations-guide.md)
**最后更新**:2026-04-24

> 本文目标:把仓库里"已经能做什么、到哪里为止、哪些事还没做"梳理清楚,作为功能验收、对接评估与排期排障的单一事实源。所有结论都对应到仓库里的真实代码/测试,未落地的项目都标注"未实现/待做"。

---

## 1. 总体结论

- **可用的能力**:OpenFGA v1.1 兼容的 Schema 管理、11 个 ReBAC HTTP 接口、Check/BatchCheck/ListObjects/ListUsers/Expand/WriteTuples/ReadTuples/CountTuples、CEL Conditions、Contextual Tuples、L2 进程内缓存、完整前端(DSL+可视化双向编辑、Tuple 管理、Tester、SDK 集成、概览)。
- **暂未打通的路径**:`BizEnforce` 分派(走老 `biz-enforce` 仍只走 Casbin)、`biz-get-user-roles/permissions` 在 ReBAC 模式下的指引错误体、L3 Redis 缓存、ListObjects 的限流/Prometheus/SLA 基线(CP-8 全部未开工)。
- **一致性基线**:OpenFGA `consolidated_1_1_tests.yaml` 当前 **129/134 通过 + 5 条显式 skip(有理由)**。
- **是否可供生产使用**:**管理员 / 业务后端开发者侧的能力闭环已就绪**;面向业务运行时的 SLA、限流、多实例失效广播仍是 CP-8 的工作。

---

## 2. Checkpoint 进度总览

| CP | 主要产出 | 状态 | 关键代码 / 测试 |
|---|---|---|---|
| CP-1 数据模型 | `BizAppConfig` 扩展 + `BizAuthorizationModel` + `BizTuple` | ✅ 完成(PR#1 已合,`4718caad`) | `object/biz_app_config.go`、`object/biz_rebac_model.go`、`object/biz_rebac_tuple.go`、`object/ormer.go` |
| CP-2 DSL + Schema 保存 | DSL ↔ Proto ↔ JSON 三态转换、冲突扫描、3 路由 | ✅ 完成(PR#1) | `object/biz_rebac_schema.go`、`object/biz_rebac_validate.go`、`controllers/biz_rebac_api.go`(WriteAuth/ReadAuth/ListAuth) |
| CP-3 Check 五 rewrite | `this` / `computed_userset` / `tuple_to_userset` / `union` / `intersection` / `difference` + 深度限制 + memo | ✅ 完成 | `object/biz_rebac_engine.go`、`object/biz_rebac_consolidated_db_test.go` |
| CP-4 Conditions + Contextual tuples | CEL 编译缓存、类型保真、per-branch cycle、请求 & tuple 上下文合并 | ✅ 完成 | `object/biz_rebac_condition.go`、`controllers/biz_rebac_api.go`(BizCheck / BizBatchCheck) |
| CP-5 List/Expand + Tuple CRUD | ListObjects / ListUsers(反向索引 + cursor + 10s 硬超时)、Expand rewrite 树、write/read/count tuples | ✅ 完成 | `object/biz_rebac_list.go`、`object/biz_rebac_expand.go`、`controllers/biz_rebac_api.go`(BizListObjects/Users/Expand/WriteTuples/ReadTuples/CountTuples) |
| CP-6 L2 缓存 | `sync.Map` tupleset 缓存(10s TTL) + 精准失效 + schema 推进整 store flush | ✅ 完成(**L2**;**L3 Redis 未做**) | `object/biz_rebac_cache.go` |
| CP-7 前端 | 向导选型、AppAuthorizationPage Tab 分派、DSL + 可视化编辑器、Tuple 管理、Tester、SDK 集成、概览 | ✅ 完成(`feature/rebac-cp3`) | `web/src/components/BizSchemaEditor.tsx` 等 11 个组件 |
| CP-8 产品级验收 | ListObjects SLA / 限流 / Prometheus / `BizEnforce` 分派 / OQ-2 错误体 / SDK 端到端 | ⬜ **未开工** | — |

> **门槛**:CP-4、CP-8 是 Plan §6 定义的硬门槛。CP-4 已过(consolidated 测试通过率达标);CP-8 是 **mergeback 到 main 的准入条件**,目前未满足。

---

## 3. 已完成能力详细说明

### 3.1 数据模型(CP-1)

- **`BizAppConfig`**(`object/biz_app_config.go`)新增两个字段:
  - `ModelType varchar(20) default 'casbin'` — 决定该 App 走 Casbin 还是 ReBAC;
  - `CurrentAuthorizationModelId varchar(40)` — 指向当前生效的授权模型。
- **`BizAuthorizationModel`**(`object/biz_rebac_model.go`):**append-only**。
  - 字段:`Id(pk)/Owner/AppName/SchemaDSL/SchemaJSON/SchemaHash/CreatedTime/CreatedBy`;
  - 索引:`idx_store(owner, app_name)`、`SchemaHash` 上的 index(去重时按 hash 查);
  - **没有** `DeleteBizAuthorizationModel(id)` 的导出函数,前端也不提供删除入口。唯一的删除路径是 `DeleteBizAuthorizationModelsForApp(owner, appName)`,仅在 `DeleteBizAppConfig` 级联时触发。
- **`BizTuple`**(`object/biz_rebac_tuple.go`)严格对齐 OpenFGA TupleKey:
  - 字段:`Id(pk autoincr) / StoreId / Owner / AppName / Object / Relation / User / ObjectType / UserType / UserRelation / ConditionName / ConditionContext / AuthorizationModelId / CreatedTime`;
  - 索引:`idx_forward(store_id, object, relation)`、`idx_reverse(store_id, user, user_type, object_type)`、`idx_store`、**`unique(uq_tuple) = (store_id, object, relation, user)`**(OpenFGA set 语义);
  - 派生列由 `PopulateDerived()` 在写入时从 Object/User 串解析出来(处理 wildcard 与 userset);
  - `ConditionContext` 按 **google.protobuf.Struct JSON 形态** 存,保真 list/map/number(OQ-4)。
- **迁移**:`object/ormer.go` 注册两张新表,xorm `Sync2` 自动建表。`BizAppConfig` 字段扩展对存量数据透明,`ModelType` 默认 `casbin`。

**存储层边界**:

- Store 标识用 `{owner}/{appName}`,跨租户由 `BuildStoreId` 统一构造;所有查询都带 `store_id` 过滤,跨 store 读写在路由层和 ORM 层都会被拒。
- `AddBizTuples` 使用单事务批量写,失败整批回滚;Object/User 串的 type:id 语法在 `parseObjectString` / `parseUserString` 里强校验。

### 3.2 Schema(CP-2)

- **DSL 解析**:`object/biz_rebac_schema.go` 通过 `github.com/openfga/language/pkg/go/transformer` v0.2.1 完成 DSL → Proto → JSON 三态转换。
  - 导出 5 个函数:`ParseSchemaDSL` / `RenderSchemaFromProto` / `ParseSchemaJSON` / `ExtractRelationKeys` / `ExtractTypeNames`;
  - `ParseSchemaJSON` 兼容 OpenFGA 的 snake_case JSON 输入(关键修复,`5d0f9f7e`);
  - `RenderSchemaFromProto` 走 `protojson` 规范化以避开 ANTLR 字段存在性的怪异表现。
- **冲突扫描**:`object/biz_rebac_validate.go` 的 `FindSchemaConflicts` / `ScanSchemaConflictsForApp`:新 schema 保存前会逐一扫描现有 tuple,类型删除优先于关系删除(避免级联误报)。
- **保存三态**:`SaveAuthorizationModel(owner, appName, dsl, createdBy)` 返回:
  - `advanced` — 写入新模型并前推 `CurrentAuthorizationModelId`;
  - `unchanged` — SchemaHash 与当前一致,不写、不前推;
  - `conflict` — 扫描出 tuple 引用被删除的 type/relation,拒绝保存,返回冲突明细。
- **Dry-run 支持**:`POST /api/biz-write-authorization-model?dryRun=true` 只跑解析 + 冲突扫描,**不落库**,供前端编辑器失焦校验。
- **对应 HTTP 路由**:
  - `POST /api/biz-write-authorization-model`
  - `GET  /api/biz-read-authorization-model`(不带 id 默认取 current)
  - `GET  /api/biz-list-authorization-models`

### 3.3 Check 引擎核心(CP-3)

- **入口**:`object/biz_rebac_engine.go` 的 `ReBACCheck(*CheckRequest) (*CheckResult, error)`。
- **支持的 rewrite**:`this` / `computed_userset` / `tuple_to_userset` / `union` / `intersection` / `difference` — 覆盖 OpenFGA v1.1 全量 rewrite。
- **关键实现要点**:
  - `maxResolutionDepth = 25`(与 OpenFGA 参考实现一致,超限返回 error 而非 false);
  - 请求级 memo:key 为 `{object}#{relation}@{user}`,单次请求内去重;
  - `errgroup` 并发 + 短路:union 任一 true 立刻 cancel,intersection 任一 false 立刻 cancel,difference 左 true 且右 false;
  - **Type restriction 在 Check 时执行**:对 `this` 命中的 tuple,要过 `findDirectlyRelatedUserTypes` + `subjectMatchesTypeRestriction` 两道校验,不满足类型约束的 tuple 视为不存在;
  - **Wildcard**:支持 `user:*` — Check 时除精确 user 外额外查一次 `{userType}:*`;
  - **Cycle 检测**:visited 路径记录,遇到回环返回(false, nil)。
- **一致性基线**:`object/biz_rebac_consolidated_db_test.go` 跑 OpenFGA `consolidated_1_1_tests.yaml`,**129/134 通过,5 条 skip**(详见 §5)。

### 3.4 Conditions + Contextual Tuples(CP-4)

- **CEL 集成**:`object/biz_rebac_condition.go`
  - 使用 `github.com/google/cel-go` v0.23.0;
  - 按 `authorizationModelId + conditionName` 维度缓存 `cel.Program`,避免重复编译;
  - 参数类型转换 `celTypeFor` 覆盖 openfga-spec 的 `ConditionParamTypeRef` 全部原生类型(int/uint/double/bool/string/duration/timestamp/ipaddress/list/map);
  - `parseConditionContext` 用 `json.Number` 解析数值保真。
- **求值路径**:
  - Check 命中带 `conditionName` 的 tuple 时,合并 **tuple 的 ConditionContext + 请求 Context**(请求级覆盖 tuple 级)→ 用缓存好的 Program 求值 → false 视为 tuple 不存在;
  - Condition 执行报错时返回 `BizAuthzKindConditionFailed`(不是默默 deny)。
- **Contextual Tuples**:
  - `POST /api/biz-check` 和 `POST /api/biz-batch-check` 接口体支持 `contextualTuples` 字段,请求级临时 tuple,**不入库**,仅在当次 Check 的 memo 上下文生效;
  - 请求级校验 `validateCheckRequestTuple` 会把每条 contextual tuple 过 schema 再进 Check。
- **per-branch cycle**:在 difference 分支内实现了独立的 visited 栈,避免 union/intersection 的一个分支的 cycle 影响到另一分支的判定(仍有 1 条 OpenFGA 一致性测试 `true_butnot_cycle_return_false` 需要 ternary 状态传播,**已 skip 并文档化**)。

### 3.5 ListObjects / ListUsers / Expand(CP-5)

- **`ReBACListObjects`**(`object/biz_rebac_list.go:108`):
  - 入参:`StoreId/AuthorizationModelId/ObjectType/Relation/User/ContextualTuples/Context/PageSize/ContinuationToken`;
  - `PageSize` 默认 100、上限 1000(`defaultListPageSize` / `maxListPageSize`);
  - **内部硬超时 10s**(`listTimeout`);
  - cursor 存 `last_object_id` 状态,base64 编码,可序列化续跑;
  - **实现思路**:从 user 端出发走 `idx_reverse` 拉 tuples,按 `object_type` 过滤;先用 contextual tuples 扩充候选,再对候选逐条 Check。
- **`ReBACListUsers`**(`object/biz_rebac_list.go:247`):反向版本,给 `object + relation + userFilter (type 或 type#relation)`,返回有权限的 user 列表,相同 cursor 机制。
- **`ReBACExpand`**(`object/biz_rebac_expand.go:87`):返回 rewrite 展开树 JSON,用于前端 Tester 可视化"为什么允许 / 为什么拒绝"。
- **对应 HTTP 路由**:
  - `POST /api/biz-check` / `POST /api/biz-batch-check`
  - `POST /api/biz-list-objects` / `POST /api/biz-list-users`
  - `GET  /api/biz-expand`
  - `POST /api/biz-write-tuples`(同事务混合 writes + deletes)
  - `GET  /api/biz-read-tuples`
  - `GET  /api/biz-count-tuples`

### 3.6 L2 缓存(CP-6)

- **位置**:`object/biz_rebac_cache.go`;package-level `sync.Map`。
- **键**:`{storeId}|{object}#{relation}` → `[]tupleRef`。
- **TTL**:10 秒(`bizTuplesetCacheTTL`)。
- **失效策略**:
  - `invalidateBizTuplesetCacheKey(storeId, object, relation)`:tuple write/delete 后精确失效;
  - `flushBizTuplesetCacheForStore(storeId)`:schema 推进时整 store flush(新 schema 会改变哪些 subject 合法,不 flush 会命中过期判定);
  - **contextual tuples 永不缓存**。
- **未做**:L3 Redis 缓存层、跨实例失效广播(TODO,CP-8 准备用 Redis pub/sub 解决)。

### 3.7 前端(CP-7)

| 组件 / 页面 | 功能 |
|---|---|
| `web/src/pages/AppAuthorizationPage.tsx` | 按 `modelType` 分派 Tab 集合;ReBAC 模式显示 **概览 / Schema / Tuples / Tester / 集成** 五个 Tab |
| `web/src/pages/BizAppConfigCreatePage.tsx` | 创建向导步骤 2 加入 RBAC / ReBAC 模型选择卡片 |
| `BizSchemaEditor.tsx` | DSL / 可视化双 Tab 容器 + AST 双向同步 |
| `BizSchemaDslEditor.tsx` | CodeMirror 6 DSL 编辑器 + dryRun 实时校验 + 错误 inline 显示 |
| `BizSchemaVisualEditor.tsx` + `BizRewriteEditor.tsx` + `bizSchemaAst.ts` | 全功能可视化编辑器:类型/关系树、rewrite 根节点 union/intersection/difference 三选一、子节点递归嵌套、直接关系/computed_userset/tuple_to_userset/条件/userset/通配全部支持(OQ-3 达标)|
| `BizTupleManager.tsx` | 列表 + 过滤 + 批量导入(CSV/JSON)+ 批量删除 |
| `BizReBACTester.tsx` | 输入 user/object/relation + 可选 contextual tuples + context,显示允许/拒绝 + Expand 树,最近 20 条本地历史 |
| `BizIntegrationTab.tsx` | ReBAC 模式提供 Go / TS / Python SDK 片段,含 copy-to-clipboard |
| `BizReBACOverview.tsx` | 类型数 / 关系数 / tuple 总量(调 `/api/biz-count-tuples`)/ 当前 Model id / 最近更新时间 |
| `BizBackend.ts` | 包装 10 个 ReBAC API;i18n 键 86 个,parity 3286/3286 |

### 3.8 HTTP API 现状(11 条路由)

全部在 `routers/router.go`,控制器在 `controllers/biz_rebac_api.go`:

```
POST  /api/biz-write-authorization-model    BizWriteAuthorizationModel
GET   /api/biz-read-authorization-model     BizReadAuthorizationModel
GET   /api/biz-list-authorization-models    BizListAuthorizationModels
POST  /api/biz-check                        BizCheck
POST  /api/biz-batch-check                  BizBatchCheck
POST  /api/biz-write-tuples                 BizWriteTuples
GET   /api/biz-read-tuples                  BizReadTuples
GET   /api/biz-count-tuples                 BizCountTuples
POST  /api/biz-list-objects                 BizListObjects
POST  /api/biz-list-users                   BizListUsers
GET   /api/biz-expand                       BizExpand
```

> 与 spec §7.1 对齐(spec 列了 10 条,实际多了一条 `biz-count-tuples` —— 前端概览需要)。

---

## 4. 当前能力边界(尚未实现 / 已知不足)

本节是**功能评估的重点**。这些能力在 spec 里存在但尚未落地,不应该承诺给业务方。

### 4.1 `BizEnforce` 分派未接入

- **现象**:`/api/biz-enforce` 和 `/api/biz-batch-enforce` 仍然只走 Casbin,和 `ModelType` 无关。
- **证据**:`object/biz_enforcer_cache.go:159 BizEnforceWithKind` 里没有 `if config.ModelType == "rebac"` 的分派。
- **影响**:如果业务方 App 选了 ReBAC,但调用了旧的 `biz-enforce` 接口,会得到 `Casbin enforcer 空 → deny`,而不是走 ReBAC 引擎。
- **对应任务**:TODO.md §P3 "`BizEnforce` / `BizBatchEnforce` 按 `config.ModelType` 路由"仍然未勾选。
- **规避**:目前 ReBAC 调用统一用 `/api/biz-check`;**请勿在 ReBAC 模式下使用 `/api/biz-enforce`**。

### 4.2 OQ-2 指引错误体未接入

- **现象**:`/api/biz-get-user-roles` 和 `/api/biz-get-user-permissions` 在 ReBAC 模式下仍然走 Casbin 路径(很可能返回空或 500),没有 spec §7.2 要求的 `BIZ_API_NOT_SUPPORTED_IN_REBAC` 指引错误体。
- **证据**:全仓搜索 `BizAuthzKindNotSupportedInReBAC` / `BIZ_API_NOT_SUPPORTED_IN_REBAC` 无命中。
- **对应任务**:TODO.md §P3 "ReBAC 模式下适配 `biz-get-user-roles` / `biz-get-user-permissions`" 未勾选。
- **规避**:ReBAC 模式下请用 `/api/biz-list-objects` 代替。

### 4.3 L3 Redis 缓存 & 跨实例失效未实现

- **现象**:`biz_rebac_cache.go` 只是进程内 `sync.Map`;多实例部署下,A 实例写 tuple 后,B 实例的 L2 缓存要等 10s TTL 自然过期才能收敛。
- **对应任务**:TODO.md §P6 "可选 Redis L3 缓存层"未勾选;Plan R 项风险 R5 未缓解。
- **规避**:单实例部署目前完全没问题;多实例部署时建议在写 tuple 后主动轮询 Check 校验,或把 `bizTuplesetCacheTTL` 调短。

### 4.4 CP-8 产品级未开工(整体)

全部是 spec §6.3.1 / §14 的产品级门槛,未来合到 main 的必要条件:

| 项 | 状态 | 对应 spec 要求 |
|---|---|---|
| ListObjects 限流 (token bucket 20/s per store+user, 突发 40) | ⬜ 未做 | §6.3.1,超限返 429;当前无限流 |
| Prometheus 指标 `biz_rebac_list_objects_duration_seconds` | ⬜ 未做 | §6.3.1,无任何 `biz_rebac_*` 指标埋点 |
| ListObjects SLA 实测 (1 store 10k tuples, p50 < 50ms, p99 < 300ms) | ⬜ 未做 | §6.3.1;目前只有功能性测试,没有压测基线 |
| 业务前端 React hook `useAccessibleResources`(分页循环 + 429 退避) | ⬜ 未做 | §8 / §14 |
| 端到端业务 SDK 实测(新建 App → schema → tuples → Tester) | ⬜ 未做 | §14 |
| 跨实例失效广播(Redis pub/sub)| ⬜ 未做 | Plan R5 |
| 文档 `CHANGES-FROM-CASDOOR.md` / `CLAUDE.md` 同步 | ⬜ 未做 | §14 |

### 4.5 OpenFGA 一致性 5 条 skip

`object/biz_rebac_consolidated_db_test.go:115` 的 `skippedTests` 有 5 条**显式跳过**,分别说明:

| # | 测试名 | 跳过原因 | 分类 |
|---|---|---|---|
| 1 | `list_objects_expands_wildcard_tuple` | 仅 listObjects assertions;不属于 Check 能力问题 | CP-5 范围外的 assertion 形式 |
| 2 | `list_objects_with_subcheck_encounters_cycle` | checkAssertions 恰好走的是 listObjects 断言 | 同上 |
| 3 | `check_with_invalid_tuple_in_store` | JetAuth CP-2 的冲突扫描**设计上**拒绝会孤立 tuple 的破坏性 schema 变更(spec OQ-3);OpenFGA 允许保存、Check 时过滤 | **产品级有意分歧** |
| 4 | `ttu_some_parent_type_removed` | 同上 | **产品级有意分歧** |
| 5 | `true_butnot_cycle_return_false` | `difference` 的 subtract 分支里出现 cycle,OpenFGA 保守 deny;JetAuth 当前把 cycle 当 false,导致 `true - false = true`。需要三态 (true/false/cycle) 状态传播才能修。 | CP-4 follow-up,未列入当期 |

**结论**:spec §11.2 要求"100% 通过或豁免书面化",当前 5 条均有书面理由,2 条是产品级有意分歧,2 条是 CP-5 assertion 形式差异,1 条是真正的 follow-up。

### 4.6 其他已知限制

- `/api/biz-count-tuples` 计数**不按筛选**,返回的是整个 store 的 tuple 总量(前端概览用);按条件计数需要自行用 `/biz-read-tuples` 逐页扫。
- Tuple delete 没有批量前缀接口,所有 delete 必须按完整 `(object, relation, user)` 精确匹配(spec §6.5 约束,不是 bug)。
- Schema 保存**没有** compare-and-swap 保护(Plan R6 未缓解):两个管理员并发保存不同 schema 时,后写会覆盖前写并把 `CurrentAuthorizationModelId` 前推到后者,前者**仍然入库保留**(append-only 保证),但可能"消失"于当前指针。业务影响低(历史模型可枚举),但要注意。

---

## 5. 代码结构速查

### 后端

```
object/
  biz_app_config.go              # ModelType / CurrentAuthorizationModelId 扩展字段
  biz_rebac_model.go             # BizAuthorizationModel 定义 + CRUD + SaveAuthorizationModel 三态
  biz_rebac_tuple.go             # BizTuple 定义 + CRUD + 派生列 + WriteBizTuples 事务
  biz_rebac_schema.go            # DSL ↔ Proto ↔ JSON 封装(openfga/language 唯一入口)
  biz_rebac_validate.go          # 冲突扫描
  biz_rebac_engine.go            # ReBACCheck + 5 rewrite + memo + maxDepth
  biz_rebac_condition.go         # CEL 集成
  biz_rebac_list.go              # ReBACListObjects / ReBACListUsers + cursor
  biz_rebac_expand.go            # ReBACExpand 树
  biz_rebac_cache.go             # L2 tupleset 缓存
  biz_rebac_*_test.go            # 单元 + 集成测试(见 §6)

controllers/
  biz_rebac_api.go               # 11 条路由的 HTTP handler

routers/
  router.go                      # 路由注册(第 294-304 行)
```

### 前端

```
web/src/components/
  BizSchemaEditor.tsx            # DSL + 可视化双 Tab 容器
  BizSchemaDslEditor.tsx         # DSL 编辑器(含 dryRun)
  BizSchemaVisualEditor.tsx      # 可视化编辑器
  bizSchemaAst.ts                # AST 双向同步
  BizRewriteEditor.tsx           # Rewrite 节点递归编辑
  BizTupleManager.tsx            # Tuple 管理
  BizReBACTester.tsx             # Check 测试器
  BizReBACOverview.tsx           # 概览卡片
  BizIntegrationTab.tsx          # SDK 集成片段

web/src/backend/
  BizBackend.ts                  # 10 个 ReBAC API 包装

web/src/pages/
  AppAuthorizationPage.tsx       # 按 modelType 分派 Tab
  BizAppConfigCreatePage.tsx     # 向导 step 2 选型
```

---

## 6. 测试清单

以下测试文件已就绪,建议纳入 CI(`make ut` 已覆盖):

| 文件 | 覆盖范围 |
|---|---|
| `biz_rebac_schema_test.go` | DSL ↔ Proto ↔ JSON 三态 roundtrip + 错误定位 |
| `biz_rebac_tuple_test.go` / `biz_rebac_tuple_db_test.go` | 派生列、通配、userset、唯一索引约束(`TestAddBizTuples_DuplicateRejected`) |
| `biz_rebac_model_test.go` / `biz_rebac_model_db_test.go` | hash 去重、Append-only |
| `biz_rebac_save_test.go` | `SaveAuthorizationModel` 三态(advanced / unchanged / conflict) |
| `biz_rebac_validate_test.go` | 冲突扫描:类型删除优先于关系删除 |
| `biz_rebac_engine_test.go` / `biz_rebac_engine_db_test.go` | 5 种 rewrite、深度限制、memo、短路、wildcard |
| `biz_rebac_condition_test.go` | CEL 编译缓存、JSON roundtrip 保真、求值异常路径 |
| `biz_rebac_list_test.go` / `biz_rebac_list_db_test.go` | cursor 稳定性、超时、PageSize 边界 |
| `biz_rebac_expand_test.go` | Expand 树、maxDepth 防溢 |
| `biz_rebac_cache_test.go` | 命中、TTL 过期、精确失效、store flush |
| `biz_rebac_consolidated_db_test.go` | OpenFGA `consolidated_1_1_tests.yaml` **129/134 pass + 5 skip(有理由)** |

建议执行:

```bash
go test -v ./object -run ReBAC
go test -v ./object -run TestConsolidatedSuite
go test -v $(go list ./...) -tags skipCi   # CI 等价(跳过 DB 集成测试)
```

---

## 7. 遗留事项与建议

### 7.1 CP-8 开工前的最小准备清单

按优先级排:

1. **`BizEnforce` 分派**(§4.1)—— 1 行 if,最小改动,但最影响"ReBAC App 的老 SDK 调用"。
2. **OQ-2 指引错误体**(§4.2)—— 统一用 `BizAuthzKindNotSupportedInReBAC` 返 400,阻止 SDK 用错 API。
3. **ListObjects 限流 + Prometheus**(§4.4)—— spec 硬门槛,不能跳过。
4. **性能基线实测**(§4.4)—— 起本地 SQLite/MySQL 插 10k tuples,跑 100 次 Check + ListObjects,记录 p50/p99。
5. **cycle-in-diff ternary**(§4.5 第 5 条)—— 能不能修完直接影响 consolidated 通过率,值得在 CP-8 开一条独立线。

### 7.2 不在 ReBAC 范围、但相关的风险

- **Schema 保存并发覆盖**(Plan R6):考虑在 `SaveAuthorizationModel` 里加 compare-and-swap 的条件更新(WHERE `current_authorization_model_id = <old>`)。代价低,影响面小。
- **多实例 Redis 失效广播**(Plan R5):若未来部署多实例,必须接入;单实例时不是 blocker。

### 7.3 运维层面

`docs/rebac-operations-guide.md` 已经给出了:Store 概念、API 映射、开通流程、Schema 生命周期、Tuple 运维、缓存行为、authz 过滤器联动排障、回归测试、常见踩坑。本文与之互补 —— 运维手册告诉"怎么用",本文告诉"能用到哪儿"。

---

## 8. 一句话总结

**CP-1 ~ CP-7 已形成闭环,可覆盖 ReBAC 的定义 / 写入 / 查询 / 前端管理 / 可视化编辑 / 一致性验证完整链路**;
**`/api/biz-check` 系统是 ReBAC 模式下的权威入口**;
**生产上线之前还差 CP-8 的 `BizEnforce` 分派、OQ-2 指引、限流、可观测与 SLA 基线** —— 这是后续合到 `main` 的准入条件,也是本分支当前的核心剩余工作。
