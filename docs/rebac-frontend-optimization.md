# ReBAC 前端优化方案(面向业务配置管理员)

**定位**:在 CP-7 已交付基线之上,把 ReBAC 管理后台从"引擎能力全量铺开"升级到"业务配置员能顺手做事"。**不推翻视觉风格**(保留现有 Tailwind tokens 与组件体系),只优化信息架构、工作流闭环、可视化层。

**参考产品**:OpenFGA Playground、Auth0 FGA、SpiceDB Playground、Warrant Dashboard、Permify Console。
**产品定位**:JetAuth 为业务系统提供权限管理 ——**用户不是消费者,是业务开发 + 配置管理员**。
**日期**:2026-04-24
**基线**:`feature/rebac-cp3`(CP-1 ~ CP-7 已完成)

---

## 1. 用户画像与工作流

### 1.1 配置管理员的一天

典型场景:一家 SaaS 用 JetAuth 给自家产品做权限管理。配置管理员(可能是产品 + 后端同学)的日常:

1. **早晨 09:00** — 研发 @ 他"我们要让 `editor` 能看到 `parent folder` 里的所有文档",他要把需求翻译成 schema。
2. **上午 11:00** — 测试 @ 他"客户 A 反馈 alice 看不到文档 d1,查查为什么"。
3. **中午 14:00** — 业务要上一个新功能,给 team 批量授权 100 篇文档。
4. **下午 17:00** — 准备改 schema,把 `viewer` 拆成 `viewer` + `reviewer`。担心会不会把线上权限搞崩。
5. **晚上 20:00** — 业务发版前,他要跑一批关键 Check 用例确认没回归。

### 1.2 现状 vs 真实需求

| 业务场景 | 现状前端能做的 | 缺的能力 |
|---|---|---|
| 理解 schema 结构 | DSL + Rewrite Tree 可视化(单关系内部) | ⚠️ **Type 间的继承/依赖图**(俯视图) |
| 排障"alice 看不到 d1" | Tester 输入三元组跑 Check | ⚠️ **身份视角浏览**(输入 alice 看他能访问什么) |
| 给 team 批量授权 | 单条添加 / CSV 导入 | ⚠️ **结构化批量授权向导**(按树、按用户组) |
| Schema 破坏性变更 | 保存前弹冲突 tuple 列表 | ⚠️ **变更 plan(类似 terraform plan)** |
| 回归测试 | Tester 本地 20 条历史 | ⚠️ **测试用例集 + 批量回放** |
| 查看权限活跃度 | 类型/关系/Tuple 总数 | ⚠️ **最近 24h Check 次数/deny 率/慢查询**(依赖 CP-8 埋点) |
| SDK 接入 | 通用 Go/TS/Python 模板 | ⚠️ **基于当前 schema 的定制化片段** |

---

## 2. 优化方案(按 ROI 排序)

> **目标阅读方式**:每项 = **痛点 → 方案 → 落点(现有文件)→ 工作量预估**。
> 工作量单位是"净编码人日",不含评审。

### Tier 1 — 不做就不好用(业务必须项)

#### A. Type 关系图谱视图(Schema Tab 新增)

- **痛点**:业务同学理解 schema 从"对象层级 / 成员关系"开始(document→folder→team→user)。当前只能看 DSL 或单个 relation 的 rewrite 树,**看不到 Type 之间怎么连**。翻译新需求时要先手画一张图。
- **方案**:Schema Tab 再加一个子 Tab "**关系图谱**"(和现有"DSL / 可视化"并列,共三个)。
  - 节点 = Type(`user` / `document` / `folder` / `team`)。
  - 边 = 关系引用:`tuple_to_userset` 画实线("document.viewer 继承自 folder.viewer"),`this [team#member]` 画虚线("document.viewer 允许 team:member 直接是主体")。
  - 点击节点展开该 type 的所有 relation 列表,点击 relation 高亮所有引用它的边。
  - **关键**:不是 rewrite 细节,是**继承链的俯视图**,30 秒看懂一个新 App 的权限结构。
- **落点**:新文件 `web/src/components/BizSchemaTypeGraph.tsx` + 扩展 `BizSchemaEditor.tsx` 三 Tab 布局。用 `react-flow`(~27KB gz,Apache 2.0)或者纯 SVG 自己画(数据规模一般 <20 节点,SVG 够了)。
- **工作量**:**1.5 天**(自绘 SVG);**1 天**(react-flow 但多一个依赖)。
- **备选**:mermaid 直出静态图(0.3 天,但不支持点击联动,不推荐)。

#### B. 身份视角浏览器(新 Tab:谁能看什么)

- **痛点**:当前 Tester 要同时给 user/object/relation 三个输入才能跑,但真实排障场景是**只知道一头**:
  - "alice 到底能看到哪些 document?"(已有后端 ListObjects,前端没用)
  - "document:d1 到底谁能看到?"(已有后端 ListUsers,前端没用)
- **方案**:在 AppAuthorizationPage 加一个 Tab **"浏览"**(或者把现 Tester 升级成 "**验证 & 浏览**" 两个子模式)。
  - 模式 1:**按 User 浏览** — 输入 `user:alice`,选一个 `objectType` + `relation`(如 `document/viewer`),调用 `/api/biz-list-objects`,表格展示 alice 能通过 viewer 看到的所有 document。
  - 模式 2:**按 Object 浏览** — 输入 `document:d1`,选一个 `relation`(如 `viewer`),调用 `/api/biz-list-users`,展示有权限的 user 列表。
  - 表格每行右侧按钮 "为什么?" → 跳到 Tester 预填该三元组 + 自动跑 Expand,无缝排障。
- **落点**:新文件 `web/src/components/BizReBACBrowser.tsx` + `AppAuthorizationPage.tsx` 加 Tab。
- **工作量**:**1.5 天**(两个模式 + 分页 + 跳 Tester 联动)。
- **副作用**:直接消费已经存在的 `/api/biz-list-objects` / `/api/biz-list-users`,是**后端已有能力的重大价值释放**。

#### C. Schema 保存 Plan(破坏性变更 Diff)

- **痛点**:现在点"保存"弹出的冲突弹窗只列"3 条 tuple 冲突",看不到:
  - 到底删了什么 type/relation?
  - 新增了什么?
  - 冲突 tuple 按被删除的 relation 聚合是怎样的?
  - 如果我"先清理 tuple 再保存",清理后会连带影响什么?
- **方案**:点保存后(而非 DryRun)进入"**变更 Plan**"模态,分三栏:
  - 左:Schema Diff(类似 GitHub 的红/绿行 diff,基于现有 `savedDsl` vs 当前 `dsl`)。
  - 中:结构变化摘要("新增 2 个 relation / 删除 1 个 type / 修改 3 个 rewrite")。
  - 右:受影响 tuple 清单,**按被删除的 relation/type 聚合**(如"`document#editor` 删除影响 12 条 tuple"+ 逐条展开)。
  - 底部 CTA:`取消` / `仅查看(只读模式)` / `一键清理受影响 tuple 并保存`(需二次确认)。
- **落点**:现 `BizSchemaEditor.tsx:391` 冲突展示块升级成独立组件 `BizSchemaChangePlan.tsx`。diff 渲染用 `diff` + `react-diff-viewer-continued`(或自绘行级 diff,~70 行)。
- **工作量**:**1 天**(diff 渲染 + 聚合 + 级联清理二次确认)。
- **同时解决**:Plan §4 风险 R6(并发保存竞态)可在此加入一个"服务端已被他人更新,请刷新"提示。

---

### Tier 2 — 显著提升日常效率

#### D. Tuple 批量授权向导(Bulk Grant Wizard)

- **痛点**:现在写 100 条"给 team:eng 的所有成员授予 folder:legal 下全部文档的 viewer"要:手写 100 条 CSV,或循环 100 次 API。业务上常见场景是**"按组织树"或"按用户组"一次批量授权**。
- **方案**:`BizTupleManager.tsx` "批量添加"按钮旁增加"**批量授权向导**":
  - Step 1 — 选 Subject Pattern:单用户 / userset(`team:eng#member`) / 通配(`user:*`)。
  - Step 2 — 选 Object Pattern:单对象 / 多对象(输入 id 列表) / **从已有 tuple 按前缀拉取**(如"所有 `document:folder_legal_*`")。
  - Step 3 — 选 Relation(下拉,从当前 schema 取)。
  - Step 4 — 预览生成的 tuple 列表 + Conditions 可选。
  - Step 5 — 一键写入(批量调用 `/api/biz-write-tuples`)。
- **落点**:扩展 `BizTupleManager.tsx`,新增 `BizTupleBulkGrantWizard.tsx`。
- **工作量**:**1.5 天**。

#### E. DSL 编辑器 Snippets & Lint

- **痛点**:业务员经常忘了"or editor from parent"、"[user with expires_at]" 这种常用组合的语法。DSL 编辑器只是纯文本,没有提示。
- **方案**:
  - 加一个 "**插入模式**" 下拉按钮,预置 8~10 个模板片段:
    - `define X: [user]`(直接关系)
    - `define X: Y or Z`(union)
    - `define X: Y from parent`(继承)
    - `define X: [user with <cond>]`(条件)
    - `condition <name>(<param>: <type>) { <expr> }`
    - 等等
  - Lint 提示(非阻塞,inline 警告):
    - 定义了 `viewer` 但没有任何 subject type → "可能写漏 subject type"
    - Type 没被其他 relation 引用 → "孤立 type,确认是否刻意"
    - Relation 只有 `this` 没有任何并集 → "常见做法会补 `or owner`"
- **落点**:扩展 `BizSchemaDslEditor.tsx`(CodeMirror 已有 extension 接口)。Lint 逻辑放 `bizSchemaAst.ts` 新增 `lintSchema(ast)` 纯函数。
- **工作量**:**1 天**(snippets)+ **0.5 天**(lint)。

#### F. Tester 历史 → 测试用例集

- **痛点**:业务员跑过 20 条 Check,想把其中 5 条"关键用例"固化下来,schema 改完一键全跑确认没回归。现状 localStorage 塞 20 条,只能一条条重放。
- **方案**:
  - 每条历史项加"收藏为用例"(⭐)按钮,收藏后挪到 "**测试用例**" 子面板。
  - 用例项上支持写期望值(allow/deny),变红绿标记。
  - 顶部 "▶ 全部重跑" 按钮,并发调用 batch-check,每条用例展示 Pass/Fail。
  - 导出 / 导入用例集 JSON,方便团队共享。
- **落点**:扩展 `BizReBACTester.tsx`,localStorage key 拆一个 `rebac-tester-cases:{appId}`。
- **工作量**:**1 天**。

#### G. 首次体验 / 场景模板(Empty State)

- **痛点**:新建 ReBAC App 后,Overview / Schema 都是空白 + "请去定义 schema",没有"**从哪开始**"的牵引。
- **方案**:Overview 的空状态加 3 张"场景模板"卡片:
  - 📄 文档协作(document + folder + user/editor/viewer)
  - 🏢 团队 SaaS(team + member + admin)
  - 🔐 资源分享(resource + owner + shared_with)
  - 每张卡片"一键应用",自动填 schema DSL + 3 条示例 tuples + 1 条示例 Check。
  - 每张卡片底部 "GitHub 查看完整示例"(跳到 README)。
- **落点**:扩展 `BizReBACOverview.tsx` 的空状态分支(line 97-109)。模板数据放 `web/src/components/bizRebacTemplates.ts`。
- **工作量**:**0.5 天**(3 个模板)。
- **延伸**:配合 §4 Integration Tab 的升级,形成"30 秒上手"链路。

---

### Tier 3 — 运维 & 进阶

#### H. Overview 活跃度仪表(依赖 CP-8 埋点)

- **依赖**:CP-8 的 Prometheus 指标先落地(`biz_rebac_check_total` / `biz_rebac_check_denied_total` / `biz_rebac_list_objects_duration_seconds`)。
- **方案**:Overview 底部加"最近 24 小时"折线图:
  - Check 总量 / Deny 率 / p99 延迟 三条线。
  - 配合一个"最近 5 条慢查询"列表(schema/tuple key + 耗时)。
- **落点**:扩展 `BizReBACOverview.tsx`。图可以用 `recharts`(现有依赖,如果有的话需确认)或现成 `DataTable` 展示表格版。
- **工作量**:**0.5 天**(CP-8 完成后)。

#### I. Authorization Model 历史对比

- **痛点**:Schema 是 append-only,历史模型留着但前端没暴露。想对比"上周的 model vs 这周的 model"差异无处下手。
- **方案**:Schema Tab 加"版本" badge,点击打开模态列出历史 model(调 `/api/biz-list-authorization-models`),选两个做 DSL diff。
- **落点**:新 `BizSchemaHistoryDiff.tsx`,复用 §C 的 diff 渲染组件。
- **工作量**:**0.5 天**。

#### J. Integration Tab 定制化片段

- **痛点**:现在的 SDK 片段是通用的 `client.Check("user:alice", "viewer", "document:d1")`,没用到当前 App 的 schema。
- **方案**:基于当前 schema 生成定制片段:
  - 对每个 `type#relation` 生成一条 Check 调用示例
  - 对每个"业务资源 type(非 user/team 这种 subject type)"生成一段 `useAccessibleResources` hook 用法
  - 自动替换 `appId` 为当前 App
- **落点**:扩展 `BizIntegrationTab.tsx`,生成逻辑抽到 `web/src/components/bizRebacSdkSnippets.ts`。
- **工作量**:**1 天**。

---

### Tier 4 — 细节打磨(上线前扫一遍)

对应 UX Quick Reference §1-§3。CP-7 的组件已经整体做得不错,以下是**针对性**检查:

| 编号 | 检查项 | 当前问题 | 修法 |
|---|---|---|---|
| L1 | `focus-states` | 所有 button 确认有 2-3px `focus-visible:ring` | 统一加 Tailwind `focus-visible:ring-2 ring-accent-primary/40` |
| L2 | `aria-labels` | `BizReBACTester.tsx:286-294` 清空历史、`BizReBACOverview.tsx` 只有 icon 的按钮 | 加 `aria-label` |
| L3 | `error-clarity` | `BizSchemaEditor` 的 `rebac.schema.parseError` 文案过于技术化 | 错误里先给一句"你可能想做的是 X",再给原始消息 |
| L4 | `loading-states` | 当前多处"Loading..." 纯文本 | 改成 skeleton(复用 `DataTable` 已有 skeleton 模式) |
| L5 | `empty-states` | Tuples 空状态只是空表格 | 加引导"写你的第一条 tuple",链接到 Tuple 批量向导 |
| L6 | `tabular-figures` | Overview 的数字卡片 | 加 `font-variant-numeric: tabular-nums` 防跳 |
| L7 | `aria-live` | Tester 结果出现/更新时屏幕阅读器没声音 | 给结果区加 `aria-live="polite"` |
| L8 | `responsive` | Tuple 表格在 <768px 可能横向滚动 | 窄屏降级:把每行变成紧凑卡片 |
| L9 | `keyboard-nav` | Schema Visual 编辑器的 rewrite 节点(可能)不能 Tab 遍历 | 补 `tabIndex` + 键盘增删节点快捷键 |
| L10 | `contrast-data` | `text-text-muted` 在浅灰背景对比度可能 <4.5:1 | 用浏览器 DevTools 扫一遍,边界的改到 `text-text-secondary` 级 |

**工作量**:L1-L10 合计约 **1 天**(逐个小改)。

---

## 3. 推荐的分批交付

### 半日快锤(可以今天开一条分支扫掉)

- §G 场景模板(0.5d) — 首次体验立刻变好。
- §L1/L2/L6/L7 细节 — 30 分钟内能做完。

### 小迭代(3-5 人日,一周内)

- §A 关系图谱(1.5d) — 最大的视觉理解升级。
- §B 身份视角浏览器(1.5d) — **后端已有能力的重大价值释放**,ROI 最高。
- §C Schema 变更 Plan(1d) — 业务敢改 schema 的关键。

### 大迭代(合并成一个 "CP-7.5" PR,~7 人日)

- 上面所有 Tier 1 + Tier 2(§A-§G)。
- 产出一个"配置管理员日常闭环完整"的版本,**可以作为 1.0 对外发布的管理后台**。

### 等 CP-8 埋点后

- §H 活跃度仪表(0.5d)。
- §J SDK 定制化(1d,可提前做)。
- §I 版本对比(0.5d,可提前做)。

---

## 4. 不建议做的事(踩坑提醒)

- **不要引入新的 UI 库 / 设计语言**。现有 Tailwind tokens + `lucide-react` + 自绘组件已经是产品统一语言,再加 shadcn/ui / Ant Design 只会增加维护负担。
- **不要把 Rewrite Tree 可视化做得太花哨**。业务配置员看着花,其实只想看到"这个 relation 允许谁"。现 `BizRewriteEditor.tsx` 470 行已经足够,不要升级成 react-flow 的节点画布 —— 那是**引擎作者**的工具,不是**配置员**的工具。Type Graph(§A)是另一个东西。
- **不要做 Wizard 式的 Schema 定义**(GPT 问答式"你想要什么权限"→ 自动生成 DSL)。业务模型差异太大,自动化不如给好模板 + 好示例。
- **不要把 Tester 做成"每次变更自动全量跑"**(性能 / 账单双输)。做成"手动触发 + 关键用例集"(§F)就够。
- **不要把 CP-8 还没做完的 Prometheus 指标先在前端假装有**。宁愿空着,也不要做假的趋势图 —— 配置员会对数字产生信任,然后被伤害。

---

## 5. 一句话总结

> **当前前端把"引擎能不能做"的所有面都铺开了,下一步是把"业务配置员做事的闭环"补齐**。
> Tier 1 三件事(Type Graph / 身份视角 / 变更 Plan)做完,JetAuth ReBAC 管理后台可以和 OpenFGA Playground / Auth0 FGA 这些行业标杆站同一个台阶;Tier 2 四件事让日常效率再上一档。
