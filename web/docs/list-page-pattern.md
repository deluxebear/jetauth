# 列表页设计规范（Best Practice）

**适用范围**：所有管理后台的资源列表页（用户、角色、权限、组织、应用、…）。
**基础组件**：`src/components/DataTable.tsx`。所有新能力都是可选 prop，现有 40+ 页面零改动。
**参考实现**：`src/pages/AppAuthorizationPage.tsx` 的 `RolesTab`。

---

## 一、业务设计八条（必须满足）

列表页不是"数据目录"，而是**决策面板**。管理员看一眼应该能回答三个问题：
**这条记录被多少人用？它能做什么？它从哪来？**

| # | 原则 | 具体做法 |
|---|---|---|
| 1 | **显示名为主，ID 为辅** | 主列第一行加粗显示 `displayName`；下一行 `mono` 小灰字显示 `name` / raw id。用户认名字不认 slug。 |
| 2 | **关键度量数字化 + 可点** | 成员数、关联权限数、引用次数等关键度量单独成列；非零时用高饱和色徽章，零时灰。**点击数字跳到对应视图**（不是详情页首屏），例如 `#members`、`#permissions` 锚点。 |
| 3 | **关系可视化** | 继承自 / 归属于 / 依赖于 这类外链用 chip 展示，点击跳目标详情。不要只显示"有"/"无"的布尔值。 |
| 4 | **主列 displayName 是 Link + 操作按钮常显** | 只有主列的 displayName/name 文字是 `<Link>`（hover 时 text-accent），**不做整行点击**——空白区域应该允许用户自由选文字、复制。行末操作按钮（编辑、删除）**始终可见**，低饱和色；鼠标 hover 时变亮。**不要做 hover-reveal**——触控板/触屏不可靠。 |
| 5 | **批量操作** | 首列 checkbox，表头支持 select-all + indeterminate。有选中时顶部浮现操作条（启用/停用/删除/取消）。破坏性批量操作必须二次确认。 |
| 6 | **多维筛选组合** | 多选维度（作用域、标签、类型…）用 chip 多选；单选维度（启用状态、审批状态）用 radio chip。筛选 chip 放在表**外**，列级精确搜索用 `FilterPopover`（列标题旁的漏斗）。 |
| 7 | **最后修改时间** | 相对时间（"3 min ago" / "2 d ago"），`tabular-nums` 避免抖动。后端必须提供 `updatedTime`。 |
| 8 | **持久化用户偏好** | 排序列/方向、列显隐存 `localStorage`，key 带资源上下文（`biz-role-table:{owner}/{app}`）。筛选状态**不持久化**（view-state）。 |

---

## 二、数据契约（后端必须提供）

列表 API 返回的每一行都应该包含：

```go
type Resource struct {
    // 身份
    Id          int64
    Name        string  // slug / machine name
    DisplayName string  // human-readable
    Description string

    // 时间
    CreatedTime string
    UpdatedTime string  // 🟡 Add/Update 都要写入

    // 状态
    IsEnabled bool
    State     string  // Approved / Pending / ...

    // 衍生度量（xorm:"-" 不入库，list 接口聚合填充）
    MemberCount     int64    `xorm:"-"`
    PermissionCount int64    `xorm:"-"`
    ParentNames     []string `xorm:"-"`
}
```

**聚合查询模式**：一次列表调用 = 1 条主查询 + N 条聚合查询（不是每行一条）。参考 `enrichBizRoles()` in `object/biz_role.go`：

```go
func enrichBizRoles(roles []*BizRole) error {
    if len(roles) == 0 { return nil }
    ids := collectIds(roles)
    byId := indexById(roles)

    // GROUP BY role_id 一次拿到所有行的成员数
    var counts []struct { RoleId int64; C int64 }
    ormer.Engine.Table(&BizRoleMember{}).
        Select("role_id, COUNT(*) AS c").
        In("role_id", ids).
        GroupBy("role_id").
        Find(&counts)
    for _, row := range counts {
        byId[row.RoleId].MemberCount = row.C
    }
    // ...同理 permission_count / parent_names
}
```

**绝对避免**：for-each 行调 `GetCount(id)`（N+1 查询）。

---

## 三、前端实现模板

### 1. 基本骨架

```tsx
import DataTable, { type Column, useTablePrefs, ColumnsMenu } from "../components/DataTable";

function MyListTab({ rows, owner, app }: Props) {
  // 跨列筛选状态 — 不持久化
  const [scopeSel, setScopeSel] = useState<Set<string>>(new Set());
  const [statusSel, setStatusSel] = useState<"all" | "enabled" | "disabled">("all");
  const [nameFilter, setNameFilter] = useState("");  // 列级文本搜索（从 onFilter 回调赋值）

  // 排序 + 列显隐受控，持久化到 localStorage
  const tablePrefs = useTablePrefs({
    persistKey: `my-list:${owner}/${app}`,
    defaultSort: { field: "updatedTime", order: "descend" },
  });

  const filtered = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    return rows.filter(r => {
      if (scopeSel.size > 0 && !scopeSel.has(r.scope)) return false;
      if (statusSel === "enabled" && !r.isEnabled) return false;
      if (statusSel === "disabled" && r.isEnabled) return false;
      if (q && !`${r.displayName || ""} ${r.name || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, scopeSel, statusSel, nameFilter]);

  const editUrl = (name: string) => `/.../:${encodeURIComponent(name)}`;

  const columns: Column<Row>[] = [
    // #1 主从字段对调 + 列级文本搜索 + displayName 是 Link
    {
      key: "identity",
      title: t("col.name"),
      sortable: true,
      filterable: true,          // 列头漏斗图标 → 文本搜索
      hideable: false,           // primary identity 不能隐藏
      width: "240px",
      sortFn: (a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name),
      render: (_, r) => (
        <Link to={editUrl(r.name)} className="flex flex-col group/link" onClick={(e) => e.stopPropagation()}>
          <span className="font-semibold text-text-primary group-hover/link:text-accent transition-colors">{r.displayName || r.name}</span>
          <span className="font-mono text-[11px] text-text-muted">{r.name}</span>
        </Link>
      ),
    },
    // #2 数字化度量 + 可点
    {
      key: "memberCount",
      title: t("col.members"),
      sortable: true,
      width: "90px",
      sortFn: (a, b) => (a.memberCount || 0) - (b.memberCount || 0),
      render: (_, r) => (
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`${editUrl(r.name)}#members`); }}
          className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums transition-colors ${
            (r.memberCount || 0) > 0
              ? "bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20"
              : "bg-surface-2 text-text-muted hover:bg-surface-3"
          }`}
        >
          {r.memberCount || 0}
        </button>
      ),
    },
    // #3 关系 chip
    {
      key: "parentNames",
      title: t("col.inherits"),
      width: "200px",
      render: (_, r) => r.parentNames?.length ? (
        <div className="flex flex-wrap gap-1">
          {r.parentNames.map(n => (
            <button key={n} onClick={(e) => { e.stopPropagation(); navigate(editUrl(n)); }}
              className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] ...">
              <span className="text-text-muted">←</span>
              <span className="font-mono">{n}</span>
            </button>
          ))}
        </div>
      ) : <span className="text-text-muted">—</span>,
    },
    // #7 相对时间
    {
      key: "updatedTime",
      title: t("col.updated"),
      sortable: true,
      width: "130px",
      sortFn: (a, b) => (a.updatedTime || "").localeCompare(b.updatedTime || ""),
      render: (_, r) => (
        <span className="text-[12px] text-text-muted tabular-nums">
          {formatRelativeTime(r.updatedTime || r.createdTime) || "—"}
        </span>
      ),
    },
    // #4 操作按钮常显
    {
      key: "__actions",
      title: t("common.action"),
      fixed: "right",
      hideable: false,
      width: "100px",
      render: (_, r) => (
        <div className="flex items-center justify-end gap-0.5">
          <Link to={editUrl(r.name)} onClick={(e) => e.stopPropagation()}
            className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors">
            <Pencil size={14} />
          </Link>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(r); }}
            className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* 页面级工具栏：左边筛选 chip，右边 ColumnsMenu + 主 CTA */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {/* 多选维度 chip */}
          <FilterChip label="..." active={scopeSel.has("app")} onClick={() => toggleScope("app")} />
          {/* 单选维度 radio chip */}
          {/* ... */}
        </div>
        <div className="flex items-center gap-2">
          {/* 列菜单和 "新建 X" CTA 放一起 */}
          <ColumnsMenu
            columns={columns}
            hidden={tablePrefs.hidden}
            onToggle={tablePrefs.toggleHidden}
            onResetWidths={tablePrefs.resetWidths}      // 开启"重置列宽"按钮
          />
          <button className="btn-primary">+ 新建 X</button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.name}
        selectable                                      // #5 批量选择
        clientSort                                      // 小数据量前端排序
        clientPagination                                // 小数据量前端分页（含页大小选择器）
        pageSize={tablePrefs.pageSize}
        onPageSizeChange={tablePrefs.setPageSize}
        sort={tablePrefs.sort}                          // #8 受控排序
        onSortChange={tablePrefs.setSort}
        hidden={tablePrefs.hidden}                      // #8 受控列显隐
        resizable                                       // 列宽可调（拖拽 + 双击适配）
        widths={tablePrefs.widths}
        onWidthChange={tablePrefs.setWidth}
        onFilter={(f) => {                              // 列级文本搜索回调
          if (f.field === "identity") setNameFilter(f.value);
        }}
        bulkActions={({ selected, clear }) => (
          <BulkBar selected={selected} clear={clear} onRefresh={onRefresh} />
        )}
      />
    </div>
  );
}
```

### 2. 页面元素 → DataTable prop 对照表

| 需求 | prop | 默认值 |
|---|---|---|
| 行点击跳详情 | `onRowClick` | undefined（不开启） |
| 批量选择 + checkbox 列 | `selectable` | false |
| 跨页选择（分页列表） | `crossPageSelection` | false（换页自动丢选中） |
| 批量操作条 | `bulkActions: ({ selected, selectedKeys, clear }) => ReactNode` | undefined |
| 前端排序 | `clientSort` | false（只抛回调） |
| 前端分页 | `clientPagination` | false（不分页 / 走 server-side） |
| 初始排序 | `defaultSort`（非受控） | `{ field: "", order: "" }` |
| 初始页大小 | `defaultPageSize`（非受控）或 `useTablePrefs({ defaultPageSize })` | 20 |
| 页大小选项 | `pageSizeOptions: number[]` | `[10, 20, 50, 100]` |
| 受控页大小 | `pageSize` + `onPageSizeChange`（配合 `useTablePrefs`） | 非受控 |
| 持久化（排序 + 列显隐，非受控） | `persistKey: string` | undefined（不持久化） |
| 受控排序（推荐） | `sort` + `onSortChange`（配合 `useTablePrefs`） | 非受控 |
| 受控列显隐（推荐） | `hidden` 来自 `useTablePrefs` | 非受控 |
| 列显隐菜单 | 外部渲染 `<ColumnsMenu>` 组件 | — |
| 主列不可隐藏 | `column.hideable: false` | true（可隐藏） |
| 默认隐藏列 | `column.defaultHidden: true`（非受控）/ `useTablePrefs({ defaultHiddenKeys })`（受控） | false |
| 列级排序函数 | `column.sortFn: (a, b) => number` | 按 `column.key` 的字符串/数字默认比较 |
| 列级文本搜索（漏斗图标） | `column.filterable: true` + 外层 `onFilter` 回调 | 无 |
| 列级下拉筛选（单选） | `column.filterable` + `filterOptions` + 外层 `onFilter` | 无 |
| 列宽可调 | `resizable` + `widths` + `onWidthChange`（配合 `useTablePrefs`） | false（固定宽度） |
| 重置列宽按钮 | `<ColumnsMenu onResetWidths={tablePrefs.resetWidths} />` | 不显示 |

**为什么列菜单在外部**：列菜单和主 CTA（"新建 X"）放在一起，admin 目光一致命中，DataTable 内部不需要渲染额外的 toolbar 行（避免空白浪费）。Bulk actions 只在选中时才浮现，不存在空白问题，仍保留在 DataTable 内。

**跨页选择（服务端分页场景）**：
- 加 `crossPageSelection` prop 后，选中 id 集合跨翻页持久化
- 表头 checkbox 始终**只操作当前页**（勾选 = 把当前页全加入，取消 = 把当前页全从集合里移除）；其他页选中不动
- 当前页部分选中 → indeterminate；当前页全没选但其他页有 → indeterminate（提示用户 "还有别的页选了"）
- `bulkActions({ selected, selectedKeys, clear })`：
  - `selected: T[]` 是**行对象**（当前页 + DataTable 内部缓存过的行对象，遍历过的页都在）
  - `selectedKeys: string[]` 是**全集**权威列表，做 "共 N 条" 徽章、API 调用用它
  - `clear()` 清空全部（包括其他页）
- 业务通常只需要 id 列表做 API 调用，用 `selectedKeys` 更稳（不受 "还没翻到那页" 影响）

**分页**：
- 客户端（小数据量，`clientPagination`）：DataTable 自己切片 `sortedData`，page 内部管理，`effectiveTotal = sortedData.length`
- 服务端（大数据量，不传 `clientPagination`）：caller 传 `page`/`pageSize`/`total`/`onPageChange`，DataTable 只管渲染当前页 + 展示分页 UI
- **页大小选择器**：位于分页条右侧（在箭头左侧），默认 `[10, 20, 50, 100]`，当总行数 ≤ 最小 option 时自动隐藏
- 选页大小后会**重置到第 1 页**（否则可能停留在不存在的页）
- 持久化：`useTablePrefs` 的 `pageSize` 自动存 `localStorage[persistKey].pageSize`；自定义 option 改 `pageSizeOptions`

**列宽调节交互**：
- 鼠标移到列头右边缘 → 光标变 `col-resize`，出现细蓝色拖拽条
- 按住拖拽 → 实时更新列宽（全局 mousemove/mouseup，拖出 th 也不丢失）
- 双击拖拽条 → 自动适配到该列最长内容（临时移除 width 约束、测量、还原、落回 setWidth）
- 范围：60px ≤ 宽度 ≤ 800px
- `fixed: "left" | "right"` 列**不可调**（sticky offset 会乱），锁死
- 列宽通过 `useTablePrefs` 持久化，reset 通过 `<ColumnsMenu onResetWidths={...}>` 下拉里的"重置列宽"按钮

### 3. 哈希锚点配合

**列表**点击"成员数"：
```tsx
navigate(`${editUrl(r.name)}#members`);
```

**详情页**添加锚点 + 滚动副作用：
```tsx
// JSX: 用 div 包裹，id + scroll-mt 避开 sticky header
<div id="members" className="scroll-mt-24">
  <MembersTable roleId={role.id} />
</div>

// 在合适的 useEffect 里（等数据加载完才滚）：
useEffect(() => {
  if (!location.hash || !role?.id) return;
  const id = location.hash.slice(1);
  const raf = requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  return () => cancelAnimationFrame(raf);
}, [location.hash, role?.id]);
```

---

## 四、样式约定（quick reference）

### 颜色语义
- **主语义色**：`accent` — 主按钮 / 选中 chip / sort 激活箭头
- **数值徽章**：`indigo-500/10 text-indigo-500`（人）、`emerald-500/10 text-emerald-500`（权限）、`cyan-500/10 text-cyan-400`（数据对象）—— 零值一律用 `bg-surface-2 text-text-muted`
- **状态 chip**：启用 `success/10 text-success`、停用 `warning/10 text-warning`、危险 `danger/10 text-danger`
- **作用域**：app 本应用 `blue-500/10`、org 共享 `purple-500/10`

### 尺寸 token
- 行高：`py-2.5`（40-ish px）
- 列横向内边距：`px-4`
- 表头字号：`text-[11px] uppercase tracking-wider`
- 正文字号：`text-[13px]`
- 副字号：`text-[11px] text-text-muted`
- 徽章：`px-2 py-0.5 text-[10px] font-semibold rounded-full/rounded-md`
- 数值徽章：`tabular-nums`（列对齐）

### 布局 token
- 行圆角：无（只有外框圆角 `rounded-xl`）
- 外框：`rounded-xl border border-border bg-surface-1 overflow-hidden`
- 工具栏：`border-b border-border-subtle bg-surface-2/50 px-3 py-2`
- 粘性列：`fixed: "left" | "right"`；DataTable 自动算 offset

---

## 五、反模式（避免）

❌ **Hover-reveal 操作按钮**——触控板/触屏不可靠。常显低饱和，hover 变亮。
❌ **整行点击跳详情**——空白区域（时间、chip、数值等等）都会响应，用户想选文字/复制 id 会误触发。用**主列 displayName 是 `<Link>`** 替代。
❌ **同一列混用点击目的**——"点击角色名去详情 + 点击成员数去成员页"是 ✅，但"点击整行有时进详情有时触发选择"是 ❌。
❌ **操作列不固定右侧**——大宽表时操作按钮跑到屏幕外。始终 `fixed: "right"`。
❌ **关键度量不返回到列表接口**——别让前端每行再发一次请求查成员数。用聚合查询一次给全。
❌ **排序/筛选跨标签泄漏**——`persistKey` 带资源上下文（owner+app），别用全局 key。
❌ **批量删除不确认**——`modal.showConfirm` 永远走一次；显示具体数量。
❌ **时间用 "2026-04-17 11:23:45"**——管理员关心"新不新"，不关心秒。用相对时间 + tooltip 显示绝对时间（可选）。
❌ **把过滤嵌到列 FilterPopover 里**，只支持单选——如果是多选 chip（作用域可选多个），放表外 FilterChip。

---

## 六、迁移 checklist

新增列表页或重写现有列表页时，对照：

- [ ] 后端列表 API 含 `UpdatedTime` 字段；Add/Update 都会写入
- [ ] 后端 List 函数一次聚合查询填衍生度量（见"数据契约"）
- [ ] 前端第一列：displayName（粗）+ name（mono 灰字），**整块包在 `<Link>`** 里跳详情页（不是整行点击）
- [ ] 成员数/关联数等关键度量为独立列，可点击深链接
- [ ] 关系字段用 chip，点击跳目标详情
- [ ] 操作列 `fixed: "right"`，图标常显
- [ ] **不要用 `onRowClick`**；可点数字/chip 的单元格自己 `e.stopPropagation()` 以免冒泡到 Link 父节点
- [ ] `selectable` + `bulkActions` 已开启（破坏性操作二次确认）
- [ ] `clientSort` + `defaultSort`（列表 < ~200 行时）
- [ ] 跨列筛选用表外 FilterChip；列内用 FilterPopover（`column.filterable: true` + `onFilter`）
- [ ] 主列（displayName / name）加 `filterable: true`，用于文本搜索
- [ ] 用 `useTablePrefs` 持久化 sort + 列显隐 + 列宽；`persistKey` 含资源上下文（`{table}:{owner}/{app}`）
- [ ] `<ColumnsMenu>` 放在主 CTA（"新建 X"）前面；主列与 actions 列 `hideable: false`
- [ ] 开启 `resizable` + 传 `widths`/`onWidthChange`；`<ColumnsMenu>` 加 `onResetWidths`
- [ ] 小数据量列表：开 `clientPagination` + 传 `pageSize`/`onPageSizeChange`；大数据量列表：caller 传 server-side `page`/`total`
- [ ] 对应 i18n key 已加：`common.columns`、`common.resetColumnWidths`
- [ ] `最后修改` 列用 `formatRelativeTime` + `tabular-nums`
- [ ] 对应详情页 section 加 `id="members"` / `id="permissions"` + `scroll-mt-24`
- [ ] 详情页 hash-scroll effect 已添加
- [ ] i18n key 已添加（中英）

---

## 七、参考实现

- **前端组件**：`src/components/DataTable.tsx`（扩展后，所有新能力都是可选 prop）
- **参考页面**：`src/pages/AppAuthorizationPage.tsx` → `RolesTab` 函数
- **后端聚合示例**：`object/biz_role.go` → `enrichBizRoles`
- **共享工具**：`src/utils/appIcon.ts`（`pickAppIcon`）、`formatRelativeTimeLocal` (in `AppAuthorizationPage.tsx`)
