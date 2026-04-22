# Plan: ReBAC 集成实施计划

**状态**:Phase 2 Plan · 待评审
**Spec**:[`rebac-spec.md`](rebac-spec.md)(Phase 1 已冻结)
**分支**:`feature/rebac-integration`
**日期**:2026-04-21

> 本文件是 spec 的**架构级实施计划**:组件依赖图、实施顺序、风险、并行性、验收 checkpoint 映射。详细到**任务级**的 TDD 步骤清单按 CP 组拆分在 `docs/superpowers/plans/2026-04-21-rebac-cp{N}-{M}-*.md` 中,Phase 3 产出。

---

## 1. Plan Overview

整个集成按 spec §15 的 8 个 Checkpoint 推进,总工作量估 **~19 个开发日**(纯编码,不含 review 停顿)。分 4 个 **PR 组**,每组覆盖 2 个 CP,每组可独立 merge 到 `feature/rebac-integration` 长分支。

| PR 组 | CPs | 产出能力 | 估工 |
|---|---|---|---|
| **PR1** | CP-1 + CP-2 | 管理员可定义并保存 schema(无 Check 能力) | 3.5d |
| PR2 | CP-3 + CP-4 | `/api/biz-check` 可用,含 conditions + contextual tuples | 5d |
| PR3 | CP-5 + CP-6 | ListObjects/Users/Expand + L2/L3 缓存 | 3.5d |
| PR4 | CP-7 + CP-8 | 前端 Schema/Tuple/Tester + 产品级 ListObjects 验收 | 7d |

每个 PR 组产出**可工作、可测试的软件**,这是 plan 拆分的硬约束 —— 即便后续 PR 组夭折,已合并的 PR 仍是可用子集(数据表、schema API、Check 引擎等逐步积累)。

---

## 2. Component Dependency Graph

```
                    cel-go ─────────┐
                                    │
openfga/language ──→ DSL parser ────┤
                        │           │
                        ▼           │
  (CP-1)                (CP-2)      │
BizAppConfig         BizAuthzModel  │      BizTuple
  .ModelType          ↑ schema JSON │        ↑
  .CurrentModelId ────┘             │        │
         │                          │        │
         └──────────┬────────┬──────┴────────┘
                    ▼        ▼
                (CP-3)    (CP-4)
              Check core   Conditions +
              (5 rewrites) Contextual tuples
                    │        │
                    └───┬────┘
                        ▼
                    (CP-5)
                ListObjects / Users / Expand
                        │
                        ▼
                    (CP-6)
                L2 sync.Map + L3 Redis 缓存 + 失效
                        │
                        ▼
                    (CP-7) Frontend
             Schema editor (DSL + 可视化全功能)
             Tuple manager
             Tester
                        │
                        ▼
                    (CP-8)
             产品级 SLA / 限流 / 可观测 / 文档
```

**硬依赖链**:
- CP-2 依赖 CP-1(schema 表必须先存在)
- CP-3 依赖 CP-2(Check 读 SchemaJSON)
- CP-4 依赖 CP-3(Conditions 是 rewrite 外挂)
- CP-5 依赖 CP-4(ListObjects 内部调 Check)
- CP-6 依赖 CP-5(缓存两者的结果)
- CP-7 依赖 CP-2 / CP-5(前端调后端 API)
- CP-8 是收尾,依赖所有前者

**可并行窗口**:
- CP-5 编码期间,CP-6 的缓存接口可先定 type + mock(但不能落地)
- CP-7 的**前端脚手架**(路由、Tab 框架)可在 CP-2 完成后启动,但 **Schema 编辑器**要等 CP-2 的服务端校验 API 稳定,**Tuple 管理**要等 CP-5 read-tuples
- CP-8 的**产品级文档**可从 CP-5 开始写初稿

---

## 3. Implementation Order

按 PR 组线性推进,每组内 CP 严格顺序。

### PR1 — Foundation(CP-1 + CP-2)

**目标**:数据落地 + DSL 保存。

- CP-1 内部顺序:
  1. 扩展 BizAppConfig(`ModelType`, `CurrentAuthorizationModelId` 字段)
  2. 新建 `BizAuthorizationModel` struct + CRUD(**无 Delete**,仅 Insert/Query)
  3. 新建 `BizTuple` struct + CRUD + 派生列计算函数
  4. `ormer.go` 注册两个新表
  5. Smoke:`make run` 不崩 + 手动 SQL 插几行
- CP-2 内部顺序:
  1. `go get github.com/openfga/language/pkg/go@v0.2.1 + cel-go` → `make vendor`
  2. `biz_rebac_schema.go`:DSL ↔ Proto ↔ JSON 包装 + SchemaHash
  3. `biz_rebac_validate.go`:schema 变更前的 tuple 冲突扫描
  4. `controllers/biz_rebac_api.go`:3 个 handler(WriteAuthorizationModel / ReadAuthorizationModel / ListAuthorizationModels)
  5. `routers/router.go` 注册路由
  6. 集成测试:贴 spec §5.1 示例 DSL 保存 + 读回 + JSON roundtrip

### PR2 — Core Engine(CP-3 + CP-4)

**目标**:Check API 可用,含完整 OpenFGA v1.1 语义。

- CP-3 内部顺序:
  1. `biz_rebac_engine.go`:`CheckContext`、memo、深度限制骨架
  2. 分别实现 5 种 rewrite:`this` → `computed_userset` → `tuple_to_userset` → `union` → `intersection` → `difference`
  3. errgroup 并发 + 短路
  4. 移植 `openfga/consolidated_1_1_tests.yaml` 的 non-conditional 子集跑通
- CP-4 内部顺序:
  1. `biz_rebac_condition.go`:cel-go 编译缓存 + 求值
  2. tuple 写入时绑定 condition_name / condition_context
  3. Check 命中 tuple 时注入 context → CEL 求值
  4. `/api/biz-check` 支持 `contextual_tuples` 字段
  5. 全量 consolidated test 通过

### PR3 — API Surface + Cache(CP-5 + CP-6)

- CP-5:ListObjects / ListUsers / Expand 三个命令 + cursor 分页
- CP-6:L2 sync.Map + L3 Redis 缓存(复用 `biz_redis_cache.go` 模式)+ tuple 写入时精确失效 + schema 切换时整 store flush

### PR4 — Frontend + Production(CP-7 + CP-8)

- CP-7 内部顺序:
  1. `BizBackend.ts` 加所有 ReBAC API wrappers
  2. `AppAuthorizationPage.tsx` 按 ModelType 渲染 Tab 集合
  3. `BizSchemaDslEditor.tsx`(CodeMirror + 服务端校验)
  4. `BizSchemaVisualEditor.tsx`(query-builder 全功能)
  5. `BizSchemaEditor.tsx`(两个 Tab 容器 + 双向同步)
  6. `BizTupleManager.tsx`
  7. `BizReBACTester.tsx`
  8. i18n 补全
- CP-8 内部顺序:
  1. 限流中间件接入 ListObjects
  2. Prometheus 指标埋点
  3. 端到端业务 SDK 示例(React hook `useAccessibleResources`)
  4. 性能实测 + SLA 验证
  5. 更新 `CLAUDE.md` / `CHANGES-FROM-CASDOOR.md` / `TODO.md`

---

## 4. Risks & Mitigations

| # | 风险 | 触发条件 | 影响 | 缓解 |
|---|---|---|---|---|
| R1 | `openfga/language` 公共 API 不稳定 | 版本升级 | DSL 解析崩 | 固定 `pkg/go/v0.2.1`,所有调用封装在 `biz_rebac_schema.go`,版本变更走单独 PR |
| R2 | Casbin 路径性能回归 | `BizEnforce` 分派改动引入慢路径 | 现有应用 p99 变差 | §13 Always "Casbin 代码路径零修改";仅在入口加 `if ModelType == "rebac"`;CI 加 benchmark 对比 |
| R3 | xorm Sync2 对 MySQL / PostgreSQL / SQLite 表现不一致 | 生产用 MySQL,开发用 SQLite | 生产部署表结构错 | CI matrix:MySQL 8 + SQLite 都跑 Sync2 + 插入验证;字段用保守的 `varchar` + `mediumtext` |
| R4 | CEL 表达式计算 DoS | 恶意 condition 嵌套深度爆炸 | 请求线程阻塞 | `cel.Program.ContextEval` + 100ms per-expression timeout + 计算深度上限 |
| R5 | ListObjects 热键压垮 DB | 单 store 被高频扫全量 object | DB 连接池打满 | §6.3.1 token bucket(20/s per store+user) + L2 缓存 10s TTL;超限 429 |
| R6 | Schema 保存竞态 | 两个管理员同时保存不同 schema | 后写覆盖前写 | 写入时 compare-and-swap `CurrentAuthorizationModelId`;冲突返回 409 |
| R7 | openfga 一致性测试套件版本漂移 | 我们 pin 的版本过旧 | 漏掉上游修复的 bug | 本仓库拷贝测试 fixture 文件到 `testdata/openfga-1.8/`,`TODO.md` 开"升级跟进"条目,半年一次同步 |
| R8 | 前端双向同步(DSL ↔ 可视化)边缘情况 | DSL 有注释 / 空白 / 非规范格式 | 可视化侧丢数据 | AST 是唯一 source of truth,保存时用 pretty-print 后的 DSL 覆写原文;用户的手工格式化不保留(需在 UI 上明示) |
| R9 | tuple 删除级联遗漏 | 删 App 时 tuples 残留 | 幽灵数据 | `DeleteBizAppConfig` 增加 tuple + authz model 级联(与 BizRole 级联同一 commit) |
| R10 | condition context JSON 精度丢失 | number 经 JSON roundtrip 变浮点 | CEL 求值结果不可预测 | OQ-4 决定严格对齐 openfga-spec;用 `json.Number` 而非 `float64` 解析数值 |

---

## 5. Parallelism Opportunities

本分支单人推进,并行意义有限;**但以下工作可**在等 review 时**铺底**:

- **PR1 review 期间**:起草 PR2 的 `biz_rebac_engine.go` 函数签名(不实现)
- **PR2 review 期间**:起草 PR3 的 cache 接口 + PR4 的前端脚手架(空组件)
- **PR3 review 期间**:写 PR4 的 i18n 文案 + SDK 代码片段

**前后端可并行的窗口**:PR2 合并后,前端可用假 mock 开始 Schema 编辑器工作(PR4),与后端 PR3 的 cache 工作并行。

---

## 6. Verification Checkpoints

映射 spec §15 的 8 个 CP。每个 CP 结束时**必须**执行下列动作再进下一个 CP:

1. **Commit**:格式 `feat(rebac): CP-N {summary}`
2. **跑测试**:`make ut` 全绿,`cd web && npm test` 全绿(CP-7 起)
3. **跑 lint**:`make lint`,`cd web && npm run lint`
4. **更新本 plan** 的 CP 勾选表(§7)
5. **写演示**:在当次 PR 描述里用 3 行命令说明 "如何现场复现本 CP 能力"(例:CP-2 = curl 保存 schema + curl 读回)

CP-4 和 CP-8 是**门槛 checkpoint**(spec §15 定义):
- **CP-4 未通过(openfga consolidated test 不全过)→ 停 PR2,不启动 PR3**
- **CP-8 未通过(ListObjects SLA 不达标)→ 不 merge 到 master**

---

## 7. CP 进度追踪

| CP | 状态 | 备注 |
|---|---|---|
| CP-1 数据模型 | ✅ 完成 (merged via PR #1 @ `4718caad`) | 数据表 + CRUD + 唯一索引 |
| CP-2 DSL + schema save | ✅ 完成 (merged via PR #1 @ `4718caad`) | DSL 保存 + 冲突阻断 + 无 Delete API |
| CP-3 Check 核心(五 rewrite) | ✅ 完成 (feature/rebac-cp3) | 五 rewrite + memo + maxDepth + openfga consolidated 112/134 pass, 22 skip (out-of-CP-3 scope) |
| CP-4 Conditions + Contextual tuples | ⬜ 未开始 | **门槛** |
| CP-5 ListObjects/Users/Expand | ⬜ 未开始 | |
| CP-6 缓存 L2/L3 | ⬜ 未开始 | |
| CP-7 Frontend(含全功能可视化) | ⬜ 未开始 | |
| CP-8 产品级验收 | ⬜ 未开始 | **门槛** |

---

## 8. 工作量估算

单人全职 + 不含 review 停顿:

| CP | 估工 | 主要不确定性 |
|---|---|---|
| CP-1 | 1.5d | Sync2 的 MySQL/SQLite 差异 |
| CP-2 | 2d   | openfga/language API 摸索 |
| CP-3 | 3d   | errgroup 短路的正确性测试 |
| CP-4 | 2d   | cel-go 类型保真 + consolidated 测试 fixture 移植 |
| CP-5 | 2d   | cursor 状态机设计 |
| CP-6 | 1.5d | Redis 失效广播跨实例验证 |
| CP-7 | 5d   | **可视化编辑器全功能是大头**(query-builder UI + 双向同步) |
| CP-8 | 2d   | SLA 性能调优 |
| **合计** | **19d** | |

含 review 停顿、迭代修改、不可预见问题 → **约 4 个日历周**。

---

## 9. Phase 3 出口

本 plan 经你 Approve 后,立即产出 **PR1 的任务级 TDD 清单**:

- 文件:`docs/superpowers/plans/2026-04-21-rebac-cp1-cp2-data-and-schema.md`
- 粒度:每个 step 2-5 分钟,完整代码 / 完整命令 / 完整预期输出,符合 `superpowers:writing-plans` 规范
- 交付:可给 subagent 或 `/execute-plan` 自动执行

PR2 / PR3 / PR4 的任务级清单**不提前写**,等各自 PR 组开工前再产出 —— 因为前一个 PR 的实际落地会影响后续任务的具体形态(例如函数命名、错误类型),预写很容易废。

---

## 10. Approve / Request Changes

**需要你回复**:

- [ ] **Plan 整体 approve** → 我立即写 PR1 的 TDD 任务清单
- [ ] **修改方向**(请指出):
  - PR 拆分粒度调整(4 个太多 / 太少?)
  - 工作量估算有异议?
  - 某风险需加强缓解?
  - CP 门槛判定条件(CP-4 / CP-8)?
  - 并行策略?

回复 "approve" 或具体修改意见即可。
