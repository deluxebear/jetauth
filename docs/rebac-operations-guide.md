# JetAuth ReBAC 功能操作手册（实现对齐版）

**文档目标**：基于当前仓库实现，对 ReBAC（Relationship-Based Access Control）做可落地的开通、使用、排障与回归指导。  
**适用对象**：研发、测试、运维、接入方。  
**对应代码范围**：`controllers/biz_rebac_api.go`、`object/biz_rebac_*.go`、`routers/authz_filter.go`、`routers/router.go`。

---

## 1. 先理解系统边界

### 1.1 JetAuth 里有两条授权链

- **平台授权链（Casbin）**：控制“谁能调用管理 API”，入口在 `routers/authz_filter.go`，核心判定是 `authz.IsAllowed(...)`。
- **业务授权链（ReBAC/Casbin 二选一）**：应用级授权，配置在 `BizAppConfig.modelType`。ReBAC 相关实现位于 `object/biz_rebac_*.go`。

关键结论：

- 调用 `/api/biz-*` 接口时，**先过平台 Casbin 过滤器**，再进入 ReBAC 业务逻辑。
- ReBAC 引擎不替代平台过滤器，两者叠加生效。

### 1.2 ReBAC 的核心实体

- **Store**：`owner/appName`，由 `BuildStoreId(owner, appName)` 生成（`object/biz_rebac_tuple.go`）。
- **Authorization Model**：`BizAuthorizationModel`（表 `biz_authorization_model`），保存 schema DSL/JSON/hash，**append-only**。
- **Current Model Pointer**：`BizAppConfig.currentAuthorizationModelId`，指向当前生效模型。
- **Tuple**：`BizTuple`（表 `biz_tuple`），三元组 `object/relation/user`，附带可选条件 `conditionName/conditionContext`。

---

## 2. API 与代码映射（操作总览）

ReBAC 路由在 `routers/router.go`：

- `/api/biz-write-authorization-model`（POST）
- `/api/biz-read-authorization-model`（GET）
- `/api/biz-list-authorization-models`（GET）
- `/api/biz-write-tuples`（POST）
- `/api/biz-read-tuples`（GET）
- `/api/biz-count-tuples`（GET）
- `/api/biz-check`（POST）
- `/api/biz-batch-check`（POST）
- `/api/biz-list-objects`（POST）
- `/api/biz-list-users`（POST）
- `/api/biz-expand`（GET）

控制器统一在 `controllers/biz_rebac_api.go`，引擎与存储在 `object/biz_rebac_*.go`。

---

## 3. 开通 ReBAC 的标准流程

### 步骤 1：创建应用授权配置（BizAppConfig）

要求：

- 已存在 `owner/appName` 目标应用。
- 在应用授权配置中设置 `modelType = "rebac"`。

说明：

- `BizAppConfig` 是 ReBAC 能力入口，未配置时会报 `app config not found`。
- ReBAC 与 Casbin 是并行模式，避免混用同一业务语义。

### 步骤 2：写入第一个 Authorization Model

请求：

```bash
curl -b jar.txt -X POST "http://localhost:8000/api/biz-write-authorization-model?appId=jetems/jetauth" \
  -H "Content-Type: application/json" \
  -d '{"schemaDsl":"model\n  schema 1.1\n\ntype user\n\ntype document\n  relations\n    define viewer: [user]\n"}'
```

返回 `data.outcome` 三态（`object/biz_rebac_model.go`）：

- `advanced`：写入新模型并前推指针。
- `unchanged`：与现有模型 hash 相同，不重复写入。
- `conflict`：破坏性变更触发冲突（现有 tuple 仍引用被删除 type/relation）。

推荐先 dry-run：

```bash
curl -b jar.txt -X POST "http://localhost:8000/api/biz-write-authorization-model?appId=jetems/jetauth&dryRun=true" \
  -H "Content-Type: application/json" \
  -d '{"schemaDsl":"..."}'
```

### 步骤 3：写入关系元组（tuple）

```bash
curl -b jar.txt -X POST "http://localhost:8000/api/biz-write-tuples" \
  -H "Content-Type: application/json" \
  -d '{
    "appId":"jetems/jetauth",
    "writes":[
      {"object":"document:d1","relation":"viewer","user":"user:alice"}
    ]
  }'
```

实现要点（`object/biz_rebac_tuple.go`）：

- `WriteBizTuples` 在一个事务内处理 writes/deletes，失败整批回滚。
- tuple 必须满足 `type:id` / `type:id#relation` 等格式约束。
- 写入后按 `(storeId, object, relation)` 精准失效 L2 缓存。

### 步骤 4：权限验证（Check）

```bash
curl -b jar.txt -X POST "http://localhost:8000/api/biz-check" \
  -H "Content-Type: application/json" \
  -d '{
    "appId":"jetems/jetauth",
    "tupleKey":{"object":"document:d1","relation":"viewer","user":"user:alice"}
  }'
```

ReBAC 引擎特征（`object/biz_rebac_engine.go`）：

- 支持 `this/computed_userset/tuple_to_userset/union/intersection/difference`。
- 最大递归深度 `maxResolutionDepth = 25`。
- 支持 contextual tuples 与 CEL 条件。

---

## 4. 模型（Schema）生命周期手册

### 4.1 设计原则

- 模型是**版本化快照**，不是原地更新。
- 每次保存都可能产生新 `authorizationModelId`。
- 必须把 `biz_app_config.current_authorization_model_id` 当作“当前版本指针”。

### 4.2 冲突（conflict）处理 SOP

触发场景：你删除了 type 或 relation，但库里还有 tuple 引用旧定义。

处理流程：

1. `dryRun=true` 获取冲突明细。
2. 用 `/api/biz-read-tuples` 定位并确认受影响 tuple。
3. 调用 `/api/biz-write-tuples` 的 `deletes` 清理。
4. 重新保存模型，直到 outcome 为 `advanced/unchanged`。

---

## 5. Tuple 运维手册

### 5.1 写入与删除

- 写入：`writes[]`。
- 删除：`deletes[]`（按 `object/relation/user` 精确删除）。
- 混合操作：同一请求可同时写删，事务保证原子性。

### 5.2 查询与计数

```bash
# 按过滤读取
curl -b jar.txt "http://localhost:8000/api/biz-read-tuples?appId=jetems/jetauth&object=document:d1&relation=viewer"

# 统计总量
curl -b jar.txt "http://localhost:8000/api/biz-count-tuples?appId=jetems/jetauth"
```

### 5.3 条件授权（condition）

tuple 可携带：

- `conditionName`
- `conditionContext`（JSON 字符串）

引擎会把 **tuple context + request context** 合并后做 CEL 求值。  
注意同名变量时，请求上下文会覆盖 tuple 上下文。

---

## 6. 调试与查询能力手册

### 6.1 BatchCheck

- 适合批量判定同一应用内多个 object/relation/user 组合。
- 单条失败不会让整批 HTTP 失败，错误写在对应 result 项里。

### 6.2 ListObjects

- 输入：`objectType + relation + user`。
- 内部超时：10 秒（`listTimeout`）。
- 支持游标分页：`continuationToken`。

### 6.3 ListUsers

- 输入：`object + relation + userFilter`。
- `userFilter` 支持 `type` 或 `type#relation`。
- 同样使用 10 秒超时与游标分页。

### 6.4 Expand

- 诊断关系展开树（rewrite 结构），便于定位“为什么允许/拒绝”。

---

## 7. 缓存与性能行为（必须掌握）

L2 缓存在 `object/biz_rebac_cache.go`：

- key：`{storeId}|{object}#{relation}`
- TTL：10 秒
- 缓存内容：tupleset（不是最终 check 结果）
- 失效策略：
  - tuple 写删后精准失效
  - schema 切换后整 store flush

多实例提示：

- 当前是进程内缓存，没有跨实例广播失效。
- 多实例场景存在短暂不一致窗口（主要由 TTL 兜底）。

---

## 8. 与 authz 过滤器的联动排障

请求 `/api/biz-*` 报 Unauthorized 时，按顺序排查：

1. **是否先被 `ApiFilter` 拒绝**（`routers/authz_filter.go`）。
2. `appId` 是否正确（`owner/appName` 格式）。
3. 当前登录用户是否具备该 biz 资源的平台管理权限。
4. 若过滤器通过，再看 ReBAC 引擎返回（schema/tuple/condition 问题）。

经验法则：

- 过滤器拒绝：通常是“接口级权限不足”。
- 引擎拒绝：通常是“关系图未覆盖到该用户”。

---

## 9. 初始化、迁移、清理手册

### 9.1 自动建表

启动时 `Sync2` 会包含 ReBAC 相关表（`BizAuthorizationModel/BizTuple/BizAppConfig`）。

### 9.2 应用删除的级联行为

删除 `BizAppConfig` 时，会级联清理该 app 的：

- 所有 tuple
- 所有 authorization model

对应实现：`object/biz_app_config.go`。

### 9.3 本地开发环境清理（谨慎）

```sql
DELETE FROM biz_tuple WHERE owner='jetems' AND app_name='jetauth';
DELETE FROM biz_authorization_model WHERE owner='jetems' AND app_name='jetauth';
UPDATE biz_app_config
SET current_authorization_model_id=''
WHERE owner='jetems' AND app_name='jetauth';
```

---

## 10. 回归测试手册（建议纳入 CI）

关键测试文件（`object/`）：

- `biz_rebac_engine_db_test.go`：rewrite 与核心判定语义
- `biz_rebac_consolidated_db_test.go`：conformance 场景
- `biz_rebac_list_db_test.go`：ListObjects/ListUsers
- `biz_rebac_expand_test.go`：Expand 结果
- `biz_rebac_save_test.go`：模型保存三态
- `biz_rebac_cache_test.go`：缓存命中与失效
- `biz_rebac_tuple_db_test.go`：tuple 唯一性与 DB 约束

建议执行：

```bash
go test -v ./object -run TestReBAC
go test -v ./object -run BizReBAC
```

---

## 11. 最容易踩坑的 8 个点

1. 误以为 ReBAC 会绕过平台 authz 过滤器（不会）。
2. 把模型当作可 UPDATE 实体（实际 append-only）。
3. 写 tuple 前未先落 schema，导致 `no authorization model`。
4. `appId` 不是 `owner/appName` 形式。
5. `user` 写成 `alice` 而不是 `user:alice`。
6. userset 写错成 `team:eng/member`，正确是 `team:eng#member`。
7. 多实例下把 10s L2 当作强一致缓存。
8. 只做引擎层测试，缺少 controller/filter 集成回归。

---

## 12. 生产变更建议流程（推荐）

1. 在预发用 `dryRun` 校验 schema。
2. 执行 `biz-check/biz-list-objects/biz-list-users` 三类验证脚本。
3. 再执行 tuple 增删变更。
4. 观察业务日志与授权失败率。
5. 最后在生产按同样顺序变更。

这套顺序可以把风险集中在“可回滚的模型与数据变更阶段”，避免直接影响在线鉴权结果。

