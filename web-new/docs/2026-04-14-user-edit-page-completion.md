# UserEditPage 功能补齐 — 工作记录

**日期**: 2026-04-14
**分支**: feat/embed-frontend
**目标**: 深度对比原版 Casdoor UserEditPage 与新版实现，补齐缺失功能

---

## 一、初始对比分析

通过全面阅读原版 `web/src/UserEditPage.js`（~1200 行）和新版 `web-new/src/pages/UserEditPage.tsx`（~1360 行），发现以下差异：

### 已有字段覆盖（50+ 个表单字段全部存在）

新版 5 个标签页（Basic / Profile / Security / Finance / Admin）已包含原版所有字段，包括：
- 身份信息、联系方式、个人资料、身份验证（ID card + 照片上传）
- 财务（余额/购物车/交易）、评分排名、注册信息
- 管理开关（isAdmin/isForbidden/isDeleted 等）
- 角色/权限/同意记录/自定义属性
- MFA 相关（multiFactorAuths/mfaItems/mfaAccounts/webauthnCredentials/managedAccounts/faceId）

### 发现的功能缺失

| # | 问题 | 严重程度 |
|---|------|---------|
| 1 | WebAuthn `isSelf` 硬编码为 `false`，添加按钮永远禁用 | Bug |
| 2 | Is deleted 切换时不自动更新 `deletedTime` | 缺失 |
| 3 | Tag 字段始终显示 Input，原版当组织有 tags 时显示 Select | 缺失 |
| 4 | Properties 只读显示，原版支持增删改键值对 | 缺失 |
| 5 | 第三方登录只显示笼统文字，不展示实际关联的提供商 | 不完整 |
| 6 | Created/Updated time 不受 dynField 可见性控制 | 缺失 |
| 7 | WebAuthn 添加按钮只是添加空行，没有真正的注册流程 | 未实现 |
| 8 | MFA 多因素认证区域只读，缺少"设为首选/编辑/设置/启用/禁用"操作 | 未实现 |
| 9 | MFA Items 表存储值大小写错误，导致后端策略检查不生效 | Bug |
| 10 | MFA Rule "Prompted" 拼写不一致，Prompted vs Prompt | Bug |
| 11 | 登录后 MFA 提示通知（EnableMfaNotification）未实现 | 未实现 |

---

## 二、修复过程

### 2.1 基础修复（第一轮）

**Commit**: `feat: complete UserEditPage missing features — WebAuthn, MFA, Properties, 3rd-party logins`

#### 修复项 1-6：小修复

- **WebAuthn isSelf**: `isSelf={false}` → `isSelf={isSelf}`
- **deletedTime 联动**: 切换 isDeleted 时自动设置/清空 deletedTime
- **Tag 条件渲染**: 新增 `orgTags` 状态，从组织数据提取 tags 列表；当有 tags 时用 `SimpleSelect`（支持 `value|displayName` 格式中英文），否则用 Input
- **Properties 可编辑**: 新增 `PropertyTable` 组件，支持添加/重命名 key/编辑 value/删除行，管理员可编辑，受 disabled 控制
- **第三方登录**: 遍历用户对象上 80+ 个 OAuth 提供商字段（github/google/wechat...），展示每个已关联的提供商及账号 ID
- **时间字段**: Created time / Updated time 包裹在 `dynField` 中，响应 accountItems 可见性配置

### 2.2 WebAuthn 真实注册流程

**文件变更**:
- 新增 `src/backend/WebauthnBackend.ts` — WebAuthn 注册 + 删除 API
- 重写 `WebAuthnTable` 组件

**实现细节**:

原版 WebAuthn 注册是标准两阶段仪式（Registration Ceremony）：

```
1. GET /api/webauthn/signup/begin → 获取 CredentialCreationOptions
2. 解码 challenge / user.id / excludeCredentials（base64url → ArrayBuffer）
3. navigator.credentials.create() → 浏览器弹出验证器 UI
4. 编码 attestationObject / clientDataJSON（ArrayBuffer → base64url）
5. POST /api/webauthn/signup/finish → 服务端验证并保存凭证
```

新版完全复制了这个流程，包括 `bufferDecode()` / `bufferEncode()` 辅助函数。

**遇到的问题**: "Error validating origin" — Vite dev server (port 7001) 和后端 (port 8000) origin 不匹配。这是开发环境问题，后端 `getOriginFromHostInternal()` 在 dev 模式下有 `localhost:8000 → localhost:7001` 的映射，但 Vite proxy 转发时 Host header 处理可能不一致。

**后端 i18n**: 将 `controllers/webauthn.go` 中所有裸 `err.Error()` 用 `c.T()` + `fmt.Sprintf` 包装，新增 5 个中英文翻译 key。

### 2.3 MFA 交互功能

**文件变更**:
- 新增 `src/backend/MfaBackend.ts` — setPreferredMfa / deleteMfa / mfaSetupInitiate / mfaSetupEnable API
- 新增 `MfaSection` 组件替换只读列表

**原版交互逻辑**:

| 状态 | 条件 | 按钮 |
|------|------|------|
| 已启用 + 非首选 | isSelf \|\| isAdmin | "设为首选" → `POST /api/set-preferred-mfa` |
| 已启用 + 是首选 | — | 蓝色"首选"标签 |
| 已启用 | isSelf | "编辑" → 导航到 `/mfa/setup` |
| 已禁用 + 非 TOTP | isAdmin && !isSelf | "启用" → initiate + enable API |
| 已禁用 | isSelf | "设置" → 导航到 `/mfa/setup` |
| 任何已启用 | isSelf \|\| isAdmin | "全部禁用" → `POST /api/delete-mfa` |

**关键设计**: TOTP（应用）类型不能由管理员为他人启用，因为需要用户本人扫描 QR 码。原版通过 `item.mfaType !== TotpMfaType` 条件排除。

### 2.4 MFA Items 值不匹配 Bug（严重）

**Commit**: `fix: MFA Items use correct backend values (sms/email/app/push) instead of display names`

**根因**: MfaItemsTable 的选项值使用了显示名（`"Phone"`, `"Email"`, `"App"`, `"Push"`），但后端 `IsNeedPromptMfa()` 比较的是 Go 常量（`"sms"`, `"email"`, `"app"`, `"push"`）。

**定位过程**:
1. 用户报告：设置了 MFA Items 后用户登录不被要求设置 TOTP
2. 在 App.tsx 加 `console.log` 确认登录返回 `data: "jetems1/admin"` 而非 `"RequiredMfa"`
3. 直接查数据库：`SELECT mfa_items FROM user WHERE owner='jetems1' AND name='admin';` → `[{"name":"App","rule":"Required"}]`
4. 后端代码：`if item.Name == TotpType && ...`，其中 `TotpType = "app"`（小写）
5. 确认原版 MfaTable.js 用 `{name: "App", value: SmsMfaType}` 区分显示名和存储值

**修复**:
```typescript
// 之前：直接用显示名作为值
const MFA_NAME_KEYS = ["Phone", "Email", "App", "Push"];

// 修复后：区分显示名和后端值
const MFA_ITEMS = [
  { display: "Phone", value: "sms" },
  { display: "Email", value: "email" },
  { display: "App", value: "app" },
  { display: "Push", value: "push" },
];
```

### 2.5 MFA Rule "Prompted" 拼写不一致

**根因**: 原版 `Setting.js` 定义 `MfaRulePrompted = "Prompted"`（带 ed），新版 `MFA_RULE_KEYS` 用了 `"Prompt"`（无 ed）。

**影响**: 组织设置的 "提示" 规则存入数据库为 `"Prompt"`，但 `EnableMfaNotification` 过滤条件检查 `"Prompted"`，永远匹配不上。

**修复**: `MFA_RULE_KEYS` 改为 `["Optional", "Prompted", "Required"]`，通知组件同时兼容两种值。

### 2.6 EnableMfaNotification 通知组件

**文件变更**:
- 新增 `src/components/EnableMfaNotification.tsx`
- 修改 `App.tsx`：添加 `justLoggedIn` 状态，在两个 Layout 中渲染通知组件

**三种 MFA 规则的行为差异**:

| 规则 | 时机 | 行为 | 可跳过 |
|------|------|------|--------|
| Required（必需） | 登录前 | 后端 `IsNeedPromptMfa()` 拦截，返回 `RequiredMfa`，强制跳转 MFA 设置 | ✗ |
| Prompted（提示） | 登录后 | 前端弹通知，建议启用，可选"去启用"或"稍后" | ✓ |
| Optional（可选） | 不提示 | 用户自行决定 | ✓ |

**通知组件逻辑**（对照原版 `EnableMfaNotification.js` + `getMfaItemsByRules()`）:
1. 合并用户级和组织级 mfaItems（用户级优先完全覆盖）
2. 筛选 rule === "Prompted" 的项
3. 再过滤：只保留 `multiFactorAuths` 中 `mfaType` 匹配且 `enabled === false` 的
4. 有结果则显示通知卡片

**遇到的路由问题**: 非管理员用户路由缺少 `/mfa/setup`，点"去启用"被 `path="*"` 重定向回首页。修复：在非管理员路由中添加 `/mfa/setup` 路由。

### 2.7 MFA 密码验证逻辑

原版使用 `UserBackend.checkUserPassword()` → `POST /api/check-user-password`（专用接口，只验证用户密码）。

新版使用 `/api/login` 接口验证，逻辑一致——只接受用户自己的密码，不接受组织万能密码。但 `application` 参数为空字符串可能导致后端找不到 application。待后续改为使用 `check-user-password` 专用 API。

---

## 三、i18n 新增 Key 汇总

### 前端（en.ts / zh.ts）

| Key | EN | ZH |
|-----|----|----|
| `users.provider.linked` | Linked | 已关联 |
| `users.prop.key` | Key | 键 |
| `users.prop.value` | Value | 值 |
| `users.webauthn.*` | WebAuthn 注册相关 5 个 | WebAuthn 注册相关 5 个 |
| `users.mfa.setPreferred` | Set preferred | 设为首选 |
| `users.mfa.disableAll` | Disable all | 全部禁用 |
| `users.mfa.setup` | Setup | 设置 |
| `users.mfa.*` | MFA 操作相关 10 个 | MFA 操作相关 10 个 |
| `mfa.notification.*` | MFA 通知相关 4 个 | MFA 通知相关 4 个 |
| `common.enable` | Enable | 启用 |
| `accountItem.Created time` | Created Time | 创建时间 |
| `accountItem.Updated time` | Updated Time | 更新时间 |

### 后端（i18n/locales/en/data.json, zh/data.json）

| Key | EN | ZH |
|-----|----|----|
| `webauthn:Failed to get WebAuthn configuration: %s` | ... | 获取 WebAuthn 配置失败：%s |
| `webauthn:Failed to begin WebAuthn registration: %s` | ... | WebAuthn 注册初始化失败：%s |
| `webauthn:Failed to finish WebAuthn registration: %s` | ... | WebAuthn 注册完成失败：%s |
| `webauthn:Failed to begin WebAuthn login: %s` | ... | WebAuthn 登录初始化失败：%s |
| `webauthn:Failed to finish WebAuthn login: %s` | ... | WebAuthn 登录完成失败：%s |

---

## 四、新增文件

| 文件 | 用途 |
|------|------|
| `src/backend/WebauthnBackend.ts` | WebAuthn 注册/删除 API（base64url 编解码 + 两阶段注册仪式） |
| `src/backend/MfaBackend.ts` | MFA API（setPreferred / delete / initiate / enable） |
| `src/components/EnableMfaNotification.tsx` | 登录后 MFA 提示通知组件 |

---

## 五、关键教训

1. **必须直接读原版源码**，不能只依赖子代理摘要。子代理可能遗漏关键细节（如 MFA Items 的 display name vs value 区分）。

2. **存储值必须和后端常量完全匹配**，包括大小写。`"App"` ≠ `"app"`、`"Prompt"` ≠ `"Prompted"` 这类问题很难通过 UI 测试发现，需要直接查数据库。

3. **定位数据问题的最快方式是查数据库**，而不是反复猜测前端/后端逻辑。`sqlite3 casdoor.db "SELECT mfa_items FROM user WHERE ..."` 一条命令就能确认数据是否正确写入。

4. **非管理员用户的路由容易遗漏**。管理员路由通常通过 `entityRoutes` 自动注册，但特殊页面（如 `/mfa/setup`）需要手动添加到非管理员路由中。

---

## 六、待办事项

- [ ] MFA 密码验证改用 `POST /api/check-user-password` 专用 API（当前用 `/api/login` 且 application 为空）
- [ ] WebAuthn "Error validating origin" 开发环境问题排查
- [ ] 第三方登录增强：获取 application 的 provider 列表，显示完整的绑定/解绑 UI（当前只读展示）
