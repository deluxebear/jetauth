# 认证页模板画册 (Auth Template Gallery)

**日期**: 2026-04-19
**目的**: 用"模板 + 元素开关"替代当前**逐项 CSS**的 `界面定制` 配置，降低管理员上手门槛，同时保证可扩展（新模板 ≤1 天接入）。
**范围**: 登录 / 注册 / 忘记密码三个页面共用同一套模板系统。

---

## 1. 为什么不是逐项 CSS

当前模式：`signinItems[].customCss` × 15 项 + `signinCss` 全局 + `formCss` 表单级 + `signinHtml` 注入 = 管理员需要同时懂 **产品结构 + CSS 选择器 + 响应式**，配出来的效果还经常和 dark mode / mobile 打架。

本质问题：**零件仓库 ≠ 设计工具**。用户想要的是"看着像某某网站的登录页"，不是"给 `[data-signinitem='password']` 加 `border-radius: 8px`"。

模板化把三层分离：

| 层级 | 管理员需要做的事 | 产出 |
|------|------------------|------|
| **L1 模板选择** | 从画册里点一个 | 整体布局 + 视觉基调 |
| **L2 模板选项** | 填几个字段（hero 图 / 副标题文案 / 背景图） | 模板的可变参数 |
| **L3 元素开关** | 勾选要显示的登录方式 / 第三方 / 协议 | 功能可见性 |
| **L4 逃生通道**（保留） | 高级 CSS / HTML 注入 | 给 0.1% 的像素级客户 |

---

## 2. 架构总览

### 2.1 文件结构

```
web/src/auth/templates/
├── index.ts                    # 注册表（Vite glob 自动发现）
├── types.ts                    # TemplateMeta / TemplateProps / SlotContract
├── registry.ts                 # 工厂函数 + 默认回退
│
├── centered-card/
│   ├── index.tsx               # 默认导出 React 组件，具名导出 meta
│   ├── options.tsx             # (可选) 管理员侧的 options 表单
│   └── preview.png             # 画册缩略图
│
├── split-hero/
│   ├── index.tsx
│   ├── options.tsx
│   └── preview.png
│
├── full-bleed/
├── minimal-inline/
├── sidebar-brand/
└── qr-first/
```

### 2.2 槽位契约（Slot Contract）

每个模板声明它会渲染哪些槽位，调用方（`SigninPage` / `SignupPage` / `ForgotPasswordPage`）把已组装好的原子组件塞进去。模板只负责**布局**，不负责业务逻辑。

```ts
// web/src/auth/templates/types.ts

export type SlotId =
  | "branding"        // BrandingLayer（logo + displayName + title）
  | "form"            // 主表单（IdentifierStep / PasswordForm / CodeForm / SignupForm）
  | "providers"       // 第三方登录按钮行
  | "methodSwitcher"  // 登录方式切换（identifier-first 第2步 / classic tab）
  | "footerLinks"     // 注册链接 / 忘记密码链接
  | "agreementBlock"  // 协议确认（非模态，仅用于常驻式）
  | "orgPicker"       // 组织选择器
  | "topBar"          // 主题切换 + 语言
  | "signupHtmlInjection" // 逃生通道的 HTML 注入

export interface TemplateMeta {
  id: string;
  name: { en: string; zh: string };
  description: { en: string; zh: string };
  preview: string;                         // /templates/<id>.png
  category: "saas" | "consumer" | "developer" | "enterprise" | "china";
  requiredSlots: SlotId[];
  optionalSlots: SlotId[];
  defaultOptions: Record<string, unknown>; // 给 application.templateOptions 的默认值
  optionsSchema?: OptionsSchema;           // 驱动管理员侧 options 表单
}

export interface TemplateProps {
  variant: "signin" | "signup" | "forgot";
  application: AuthApplication;
  theme: "light" | "dark";
  slots: Partial<Record<SlotId, ReactNode>>;
  options: Record<string, unknown>;
}
```

### 2.3 注册表（自动发现）

```ts
// web/src/auth/templates/index.ts
import type { ComponentType } from "react";
import type { TemplateMeta, TemplateProps } from "./types";

const mods = import.meta.glob<{
  meta: TemplateMeta;
  default: ComponentType<TemplateProps>;
}>("./*/index.tsx", { eager: true });

export const templates = Object.fromEntries(
  Object.values(mods).map((m) => [m.meta.id, { meta: m.meta, Component: m.default }])
);

export const templateList = Object.values(templates).map((t) => t.meta);
export const DEFAULT_TEMPLATE_ID = "centered-card";

export function resolveTemplate(id: string | undefined) {
  return templates[id ?? DEFAULT_TEMPLATE_ID] ?? templates[DEFAULT_TEMPLATE_ID];
}
```

### 2.4 数据模型增量

`Application` 新增两个字段：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `template` | `string` | `"centered-card"` | 模板 id |
| `templateOptions` | `jsonb / text(JSON)` | `{}` | 模板特定参数（hero 图 URL / 副标题 / 背景色 etc.） |

**现有 `signinItems[]` / `signinCss` / `signinHtml` 全部保留**，模板是**渲染入口**，不清空任何数据 —— 管理员随时可以切回"自定义 (Advanced)" 模式。

### 2.5 渲染流水线

```
SigninPage / SignupPage / ForgotPasswordPage
       │
       ├── 组装原子槽位（基于 application.signinItems 的可见性）:
       │     - <BrandingLayer />                   → slots.branding
       │     - <PasswordForm /> / <IdentifierStep /> → slots.form
       │     - <ProvidersRow />                    → slots.providers
       │     - <MethodStep />                      → slots.methodSwitcher
       │     - <SignupLink /> <ForgotLink />       → slots.footerLinks
       │     - <OrgChoiceWidget />                 → slots.orgPicker
       │     - <TopBar />                          → slots.topBar
       │
       ├── resolveTemplate(application.template)
       │
       └── <Template variant="signin" slots={...} options={application.templateOptions} />
```

模板组件**只看 slots 和 options**，不碰 `application` 业务字段（除了 `signupHtml` / `signinHtml` 这类逃生槽位）。这让模板纯粹是"视觉壳"，功能逻辑集中在页面层，维护成本低。

---

## 3. 模板画册（v1：6 个）

> 画册采用 `3 列网格` 展示，每张卡片：`preview.png` + 名称 + 一行描述 + 适用类别标签。点击后进入右侧 options 面板。

### T01 · Centered Card（居中卡片）— 默认

**Category**: `saas` | **Reference**: Stripe / Linear / Vercel / Supabase

```
┌────────────────────────────────────────────────┐
│                              [☀ EN▾]  ← topBar │
│                                                │
│                                                │
│                  ┌──────────────┐              │
│                  │     Logo     │ ← branding   │
│                  │  Welcome...  │              │
│                  │              │              │
│                  │  [Identifier]│ ← form       │
│                  │  [Password ] │              │
│                  │  [Continue ] │              │
│                  │              │              │
│                  │ ── or ──     │              │
│                  │ [G] [Apple]  │ ← providers  │
│                  │              │              │
│                  │  Forgot? New?│ ← footerLinks│
│                  └──────────────┘              │
│                                                │
└────────────────────────────────────────────────┘
```

**Required**: `branding`, `form`, `topBar`
**Optional**: `providers`, `methodSwitcher`, `footerLinks`, `orgPicker`, `agreementBlock`
**Options**:
- `backgroundStyle`: `"neutral" | "subtle-gradient" | "solid"`（默认 `neutral`）
- `cardShadow`: `"none" | "soft" | "elevated"`（默认 `soft`）
- `maxWidth`: `"narrow" | "default" | "wide"`（默认 `default`，对应 384px）

**适用**: 80% 的 SaaS 场景。**这就是迁移时给所有存量 app 落的默认模板**。

---

### T02 · Split Hero（左 hero 右表单）

**Category**: `saas` / `consumer` | **Reference**: Clerk / Notion / Linear signup / Supabase

```
┌────────────────────────────────────────────────┐
│                                      [☀ EN▾]  │
│ ┌────────────────────┐  ┌──────────────────┐   │
│ │                    │  │                  │   │
│ │   Hero Image /     │  │     Logo         │   │
│ │   Brand Art        │  │                  │   │
│ │                    │  │  [Identifier]    │   │
│ │   "Build faster"   │  │  [Password  ]    │   │
│ │   (marketing copy) │  │  [Continue  ]    │   │
│ │                    │  │                  │   │
│ │   ──────────       │  │  ── or ──        │   │
│ │   ⭐⭐⭐⭐⭐         │  │  [G] [Apple]     │   │
│ │   testimonial...   │  │                  │   │
│ │                    │  │  Forgot?  New?   │   │
│ └────────────────────┘  └──────────────────┘   │
└────────────────────────────────────────────────┘
```

**Required**: `branding`, `form`, `topBar`
**Optional**: `providers`, `footerLinks`, `methodSwitcher`, `agreementBlock`
**Options**:
- `heroImageUrl`: `string`
- `heroImageUrlDark`: `string`（可选，默认 fallback 到 light）
- `heroHeadline`: `{ en: string; zh: string }`
- `heroSubcopy`: `{ en: string; zh: string }`
- `heroSide`: `"left" | "right"`（默认 `left`）
- `heroBackground`: `"image" | "gradient" | "solid"`

**适用**: 注重品牌 / 营销型 B2B 产品；signup 页转化率最高的模板。**在 mobile 下 heroSide 自动隐藏**，回退成 T01 布局。

---

### T03 · Full-bleed Background（全屏背景 + 玻璃表单）

**Category**: `consumer` | **Reference**: Apple / Figma / Framer

```
┌────────────────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  [☀ EN▾]  │
│ ░░░░ Full-bleed background image ░░░░░░░░░░░   │
│ ░░░░    (app-specific photography) ░░░░░░░░░   │
│ ░░░░░░░░░░░░░░ ┌──────────────┐ ░░░░░░░░░░░░   │
│ ░░░░░░░░░░░░░░ │ ░ glass ░    │ ░░░░░░░░░░░░   │
│ ░░░░░░░░░░░░░░ │   Logo       │ ░░░░░░░░░░░░   │
│ ░░░░░░░░░░░░░░ │  [Identifier]│ ░░░░░░░░░░░░   │
│ ░░░░░░░░░░░░░░ │  [Password ] │ ░░░░░░░░░░░░   │
│ ░░░░░░░░░░░░░░ │  [Continue ] │ ░░░░░░░░░░░░   │
│ ░░░░░░░░░░░░░░ │ [G] [Apple]  │ ░░░░░░░░░░░░   │
│ ░░░░░░░░░░░░░░ └──────────────┘ ░░░░░░░░░░░░   │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
└────────────────────────────────────────────────┘
```

**Required**: `branding`, `form`, `topBar`
**Optional**: `providers`, `footerLinks`, `methodSwitcher`, `agreementBlock`
**Options**:
- `backgroundImageUrl`: `string`
- `backgroundImageUrlDark`: `string`
- `overlayOpacity`: `0..1`（默认 `0.3`，保证玻璃表单上文字可读）
- `glassBlur`: `number`（默认 `16`）
- `formPosition`: `"center" | "top-center" | "bottom-center"`

**适用**: 消费级 / 品牌驱动产品；游戏 / 媒体 / 旅游 / 高端零售。**会自动做 `prefers-reduced-transparency` 回退**。

---

### T04 · Minimal Inline（极简内联）

**Category**: `developer` | **Reference**: GitHub / Vercel v0 / Railway

```
┌────────────────────────────────────────────────┐
│                                      [☀ EN▾]  │
│                                                │
│                                                │
│                      Logo                      │
│                                                │
│                  Sign in to Jetauth            │
│                                                │
│        ┌───────────────────────────────┐       │
│        │ Identifier                    │       │
│        └───────────────────────────────┘       │
│        ┌───────────────────────────────┐       │
│        │ Password                      │       │
│        └───────────────────────────────┘       │
│        ┌───────────────────────────────┐       │
│        │          Continue             │       │
│        └───────────────────────────────┘       │
│                                                │
│                ──────── or ────────            │
│                                                │
│        ┌───────────────────────────────┐       │
│        │   [G]  Continue with Google   │       │
│        └───────────────────────────────┘       │
│                                                │
│             Forgot password?  Sign up          │
│                                                │
└────────────────────────────────────────────────┘
```

**Required**: `branding`, `form`, `topBar`
**Optional**: `providers`, `footerLinks`, `methodSwitcher`
**Options**:
- `density`: `"compact" | "comfortable"`（默认 `comfortable`）
- `providerStyle`: `"button-row" | "stacked-full-width"`（默认 `stacked-full-width`）

**适用**: 开发者工具 / CLI 周边 / 低调 B2B。**无卡片 chrome**，最接近 "朴素但专业" 的观感；协议确认默认用弹窗模式而非常驻块。

---

### T05 · Sidebar Brand（左品牌栏 + 右表单）

**Category**: `enterprise` | **Reference**: Atlassian / Okta / 钉钉 / 飞书

```
┌────────────────────────────────────────────────┐
│┌──────────┐                          [☀ EN▾]  │
││          │                                    │
││          │          ┌──────────────┐          │
││   Logo   │          │              │          │
││          │          │  Sign in     │          │
││ Product  │          │              │          │
││   Name   │          │  [Identifier]│          │
││          │          │  [Password ] │          │
││ ────     │          │  [Continue ] │          │
││          │          │              │          │
││ Feature  │          │  [G] [Apple] │          │
││ • Team   │          │              │          │
││ • Audit  │          │ Forgot? New? │          │
││ • SSO    │          │              │          │
││          │          └──────────────┘          │
││  v1.4.2  │                                    │
│└──────────┘                                    │
└────────────────────────────────────────────────┘
```

**Required**: `branding`, `form`, `topBar`
**Optional**: `providers`, `footerLinks`, `methodSwitcher`, `orgPicker`, `agreementBlock`
**Options**:
- `sidebarWidth`: `"narrow" | "standard" | "wide"`（默认 `standard`，240px）
- `sidebarFeatureList`: `Array<{ icon: string; label: { en: string; zh: string } }>`（最多 5 项）
- `sidebarFooterText`: `{ en: string; zh: string }`（版本号 / 版权信息 / 备案）
- `sidebarBackground`: `"surface-2" | "accent" | "gradient"`

**适用**: 企业内部门户 / 多租户 SaaS 登录门户；**非常适合需要展示"我们是谁"的企业客户**。Mobile 下 sidebar 折叠成顶部 64px 条。

---

### T06 · QR-First（扫码优先，中国式）

**Category**: `china` | **Reference**: 微信网页版 / 淘宝 / 支付宝 / 企业微信

```
┌────────────────────────────────────────────────┐
│                                      [☀ EN▾]  │
│                                                │
│                  ┌──────────────┐              │
│                  │     Logo     │              │
│                  │              │              │
│                  │  ┌────────┐  │              │
│                  │  │████████│  │              │
│                  │  │██ QR ██│  │ ← 主入口     │
│                  │  │████████│  │              │
│                  │  │████████│  │              │
│                  │  └────────┘  │              │
│                  │              │              │
│                  │  扫码登录     │              │
│                  │  打开 App →  │              │
│                  │              │              │
│                  │ ─ 账号登录 ─ │ ← 次要 tab   │
│                  │              │              │
│                  │  [G] [WX]    │              │
│                  │              │              │
│                  │ □ 我已阅读协议│              │
│                  └──────────────┘              │
│                                                │
└────────────────────────────────────────────────┘
```

**Required**: `branding`, `form`, `topBar`
**Optional**: `providers`, `footerLinks`, `agreementBlock`
**Options**:
- `qrEndpoint`: `string`（返回二维码图片的 API endpoint，默认沿用 Casdoor 现有 QR 通道）
- `qrPollInterval`: `number`（ms，默认 `2000`）
- `qrInstruction`: `{ en: string; zh: string }`（默认 "使用 App 扫码登录"）
- `showPasswordTab`: `boolean`（默认 `true`，关闭后只保留扫码）
- `forceAgreementInline`: `boolean`（默认 `true`，协议确认强制常驻，符合中国备案要求）

**适用**: 中国大陆面向个人用户的产品；**自动把 `WeChat` / `DingTalk` / `Lark` provider 提到主位**，其它 provider 折到"更多登录方式"。

---

## 4. 新增模板的流程（目标：≤1 天）

1. **拷贝** `templates/centered-card/` 到 `templates/<new-id>/`
2. **改** `index.tsx` 里的 `meta.id` / `meta.name` / `meta.preview`，布局按需调整
3. **声明** `requiredSlots` / `optionalSlots` / `defaultOptions`
4. **（可选）** 如果模板有特殊参数（hero 图 / 侧栏文案），写 `optionsSchema` 并在 `options.tsx` 里写管理员表单（或让系统按 schema 自动生成）
5. **放缩略图** `preview.png`（1200×800，浅色背景）到 `web/public/templates/<new-id>.png`
6. **自测**：`/template-preview?id=<new-id>&variant=signin` 能渲染
7. **提交 PR** —— 注册表靠 `import.meta.glob` 自动发现，**无需修改任何中心文件**

**预估工作量**:
- 相似布局的变体（e.g. Split Hero 的镜像版）：2-3 小时
- 全新布局：4-8 小时
- 有复杂 options UI 的：1 天

---

## 5. 管理员侧 UX 改造

原来的 `界面定制` tab 重构为三段：

```
┌─ 模板 ──────────────────────────────────────────┐
│  ⦿ Centered Card      ◯ Split Hero              │
│    [缩略图]              [缩略图]                │
│    SaaS 默认             营销导向                │
│                                                 │
│  ◯ Full-bleed         ◯ Minimal Inline          │
│  ◯ Sidebar Brand      ◯ QR-First                │
│  [+ 社区模板 (3)]                                │
└─────────────────────────────────────────────────┘

┌─ 模板选项（Split Hero）─────────────────────────┐
│  Hero 图片         [Upload]  [Upload dark]      │
│  标题文案 (EN/ZH)  [_______]                    │
│  副标题            [_______]                    │
│  Hero 位置         ⦿ 左  ◯ 右                   │
│  背景类型          ⦿ 图片 ◯ 渐变 ◯ 纯色        │
└─────────────────────────────────────────────────┘

┌─ 元素开关（跨模板通用）─────────────────────────┐
│  ☑ 密码登录    ☑ 验证码登录    ☐ Passkey       │
│  ☑ 第三方登录  ☑ 组织选择器    ☑ 协议确认       │
│  ☑ 注册链接    ☑ 忘记密码链接                   │
│                                                 │
│  [管理第三方登录提供商 →]                         │
└─────────────────────────────────────────────────┘

┌─ 高级（Advanced，可折叠）───────────────────────┐
│  ⚠ 仅在需要像素级控制时启用                      │
│  [ 按项 CSS 定制 (原 signinItems) ]              │
│  [ HTML 注入 (signinHtml / signupHtml) ]         │
│  [ 全局 CSS (signinCss / signupCss) ]            │
└─────────────────────────────────────────────────┘
```

**预览面板**（右侧 iframe）实时更新，已有的 `AdminPreview` 管道无需改动，只是数据源变成 `application.template` + `application.templateOptions`。

---

## 6. 迁移策略

| 现状 | 迁移后 |
|------|--------|
| 存量 app **无** `template` 字段 | DB 迁移默认 `template = "centered-card"` |
| 存量 app 有 `signinCss` / `signupCss` / `signinHtml` | **保留，继续生效**（模板渲染后叠加） |
| 存量 app 有 `formBackgroundUrl` | 自动映射到 `template = "full-bleed"` + `templateOptions.backgroundImageUrl` |
| 存量 app `signinItems[].customCss` 非空 | **保留**，但在 UI 里提示"你当前使用自定义 CSS，切换模板会保留 CSS 但可能需要调整" |
| 存量 app `signinMethodMode = "classic"` | 与模板**正交**，任何模板都支持 classic / identifier-first 切换 |

**零破坏**：不删任何字段，不清任何数据。管理员随时可在"高级"里回到原来的逐项 CSS 模式。

---

## 7. 落地路线（建议 3 里程碑）

| 里程碑 | 内容 | 预估 |
|--------|------|------|
| **M1 · 基础设施** | `templates/` 目录 + 注册表 + `types.ts` + T01 Centered Card（作为现有 UI 的 1:1 等价替换） + DB 迁移 | 3-4 天 |
| **M2 · 画册首发** | T02 Split Hero、T03 Full-bleed、T04 Minimal Inline 三个模板 + 管理员侧模板选择器 + 缩略图 | 4-5 天 |
| **M3 · 企业 + 中国** | T05 Sidebar Brand、T06 QR-First + options 表单自动生成器 + 社区模板目录占位 | 3-4 天 |

**总计约 2 周**，期间旧的逐项 CSS 路径始终可用，可以灰度上线。

---

## 8. 开放问题（供后续讨论）

1. **社区模板**: 是否允许管理员上传 JSON 定义的模板（受限 DSL），还是只接受 PR？→ 建议 v2 再做
2. **主题变量**: 虽然 L1 brand tokens 本期不做，但模板应预留 `--accent` / `--surface-1` 等 CSS 变量接入点，未来加 tokens 是平滑升级
3. **A/B 测试**: 是否给同一个 app 配多个模板按权重分流？→ 超出 v1 范围
4. **模板预览独立页**: 画册里点"查看大图"是否进入 `/template-preview?id=xxx`？→ 建议做，复用现有 `AdminPreview` 管道

---

**下一步**：如果方向确认，我从 M1 开始 —— 先把 `templates/` 基础设施 + Centered Card（与现有视觉等价）做完，确保**零回归**，然后再做新模板。

需要我开始写 M1 吗？还是先对这份画册里的某个模板布局调整？
