# Group 使用点全景审计

> **目的**: 为 Group 重构提供 blast-radius 地图，明确哪些地方是雷区、哪些地方可以放心改。
>
> **适用范围**: Casdoor/JetAuth fork 中所有引用 `object.Group` / `User.Groups` / `userEnforcer` 的代码路径。
>
> **审计日期**: 2026-04-17（本审计随代码演进，改动 Group 相关代码前请复核）。

---

## 1. 数据模型层

### Group 主表 (`object/group.go`)

```go
type Group struct {
    Owner       string   // pk
    Name        string   // pk (不能含 "/")
    DisplayName string
    Manager     string   // 用户 id
    ContactEmail string
    Type        string   // e.g. "Virtual"
    ParentId    string   // ⚠️ 短名，不是 owner/name
    IsTopGroup  bool     // ParentId == 所属组织名
    Users       []string // 瞬态，由 ExtendGroupWithUsers 填
    IsEnabled   bool
    // Title / Key / HaveChildren / Children 略
}
```

- 复合主键 `(owner, name)`，org 之间组名可重复
- 无外键约束（Casdoor 传统），所有引用完整性靠应用层

### 引用 Group 身份 (`owner/name` 或短名) 的表

| 表 / 字段 | 格式 | 来源 |
|---|---|---|
| `user.groups` (mediumtext JSON) | **混用**（owner/name + 短名） | 后台 API / signup / LDAP |
| `role.groups` (mediumtext JSON) | 短名 | 老版 Casdoor RBAC（biz 不读） |
| `permission.groups` (mediumtext JSON) | 短名 | 同上 |
| `biz_role_member.subject_id` (subject_type='group') | `owner/name` | 新 biz engine（我们加的） |
| `biz_permission_grantee.subject_id` (subject_type='group') | `owner/name` | 同上 |
| `application.default_group` | 短名 | 后台配置 |
| `invitation.signup_group` | 短名 | 后台配置 |
| `provider_item.signup_group` | 短名 | 后台配置 |
| `ldap.default_group` | 短名 | 后台配置 |

### Casbin 镜像

`userEnforcer` (object/user_enforcer.go) 把 `User.Groups` 同步为 Casbin `g user "group:"+groupId` 规则。prefix 用于与 role enforcer 共享 grouping 模型而不冲突。

---

## 2. 写路径（所有会改 User.Groups 的地方）

**不变式**: User.Groups 写入 → userEnforcer 必须同步 → biz app 策略必须 resync（如果有影响）。

| 函数 | User.Groups | userEnforcer | biz sync | 备注 |
|---|---|---|---|---|
| `AddUser` | ✅ insert | ✅ 先 update | ❌ | 新用户，无旧状态，无需 biz sync |
| `UpdateUser` | ✅ cols 含 `groups` 时 | ✅ 先 update | ✅ (我们新加) | 主写路径 |
| `UpdateUserForAllFields` | ✅ AllCols | ✅ 条件触发 | ✅ (我们新加) | 容易漏 diff |
| `DeleteUser` | ✅ 删行 | ✅ DeleteGroupsForUser | ✅ (我们新加) | 软删 / 硬删两条路径 |
| `DeleteGroupForUser` | ✅ 移一个 | ✅ | ✅ (我们新加) | 单组解绑 |
| `GroupChangeTrigger` | ✅ 替换成员 | ❌ (只改 User 表) | ✅ (我们新加) | rename 级联 |
| `userChangeTrigger` | ❌ | ❌ | ❌ | 仅改 user.Name |
| `syncer_dingtalk.go` | ✅ 追加 deptId | ❌ 无同步 | ❌ | ⚠️ 老代码，enforcer 不同步 |
| `controllers/auth.go` 1006-1011 (OAuth signup) | ✅ 赋值 | AddUser 代管 | ❌ | auto-join |
| `controllers/account.go` 262-267 (注册) | ✅ 赋值 | AddUser 代管 | ❌ | auto-join |
| `ldap_conn.go` 515-528 | ✅ 覆盖 | AddUser/UpdateUser 代管 | 间接 | LDAP 同步 |

### Group 本身的 CRUD (`object/group.go`)

| 函数 | 行为 | 副作用 |
|---|---|---|
| `AddGroup` | 校验 + insert | 无（不自动加成员） |
| `AddGroups` / `AddGroupsInBatch` | 批量 | 同上 |
| `UpdateGroup` | 重命名时调 `GroupChangeTrigger` | 见下 |
| `GroupChangeTrigger(owner, old, new)` | 改 User.Groups / 子 group.ParentId / biz_role_member / biz_permission_grantee | 最后 `SyncAfterUserGroupsChanged` |
| `DeleteGroup` | 拦截: 有子组 / 有成员 / 有 biz 引用 | 无级联，硬拦截 |
| `deleteGroup` (private) | 直接删 | ⚠️ 绕过所有拦截 |

---

## 3. 读 / enforce 路径

### 基础查询
- `GetGroupUsers(groupId)` — 走 userEnforcer，**biz engine 重建策略的关键依赖**
- `GetGroupUsersWithoutError` — 静默变体
- `ExtendGroupWithUsers` / `ExtendGroupsWithUsers` — API 响应填 users 字段
- `GetGroupUserCount` / `GetPaginationGroupUsers` — 分页
- `userEnforcer.GetGroupsForUser / GetAllUsersByGroup / GetUserNamesByGroupName` — 底层

### 层级遍历
- `GetUserFullGroupPath` (user.go:1485) — 沿 ParentId 向上拼路径，**强制 owner/name 格式**
- `ConvertToTreeData` — 前端树形视图
- `GetGroupsHaveChildrenMap` — 计算 hasChildren 标志

### 协议输出
- JWT `generateJwtToken` — 配 `useGroupPathInToken=true` 时嵌入 full path，否则原样
- `/userinfo` (OIDC profile scope) — `GetUserInfo` 直接拷贝 user.Groups
- LDAP `handleSearch` memberOf 属性 — 原样吐，格式随 User.Groups
- SAML / OAuth 仅在 token 路径

### biz engine
- `expandGroupMembership` (biz_incremental_sync.go:129) — 扫 biz_role_member + biz_permission_grantee 里的 group subject，对每个组调 `GetGroupUsers` 发 `g userId groupId`
- `SyncAfterUserGroupsChanged` (biz_incremental_sync.go, 我们加的) — User.Groups 变动的扇出入口

---

## 4. Signup / Provisioning Auto-Join

4 条入口把用户自动放进组，都写**短名**：

1. `Invitation.SignupGroup` (最高优先级, 一次性)
2. `ProviderItem.SignupGroup` (某 OAuth provider)
3. `Application.DefaultGroup` (fallback)
4. `Ldap.DefaultGroup` (LDAP bind 时 memberOf 为空的 fallback)

以及 syncer：
- `syncer_dingtalk.go:468` — `user.Groups = append(user.Groups, fmt.Sprintf("%d", deptId))`（数字字符串，不是 owner/name 也不是组名）

---

## 5. Controllers / HTTP 端点

`controllers/group.go`:

| 路由 | 方法 | 函数 | 授权 |
|---|---|---|---|
| `/api/get-groups` | GET | GetGroups / GetPaginationGroups | owner |
| `/api/get-group` | GET | GetGroup | owner |
| `/api/add-group` | POST | AddGroup | owner |
| `/api/update-group` | POST | UpdateGroup | owner |
| `/api/delete-group` | POST | DeleteGroup | owner |

授权走 `controllers.requireAdmin` 标准链路，无特殊逻辑。

---

## 6. 前端消费点 (`web-new/src/`)

| 页面 / 组件 | 读 | 写 | 说明 |
|---|---|---|---|
| `GroupListPage` | ✅ | — | 列表 + 筛选 |
| `GroupTreePage` | ✅ | — | withTree=true，树形视图 |
| `GroupEditPage` | ✅ | ✅ | 单组编辑 / 新建 / 删除 |
| `UserEditPage` | ✅ | ✅ (user.groups 字段) | 下拉多选组 |
| `OrganizationEditPage` | — | ✅ (默认 app / defaultGroup) | 见我们最近修的 SearchableSelect |
| `BizRoleMemberTable` | ✅ | ✅ (addBizRoleMember subject_type='group') | 新 biz 模块 |
| `BizPermissionGranteeTable` | ✅ | ✅ (subject_type='group') | 新 biz 模块 |
| `backend/GroupBackend.ts` | API 层 | API 层 | 所有页面共享 |

---

## 7. 隐藏依赖 & 不变式

### 🔴 最大的坑：User.Groups 格式双存

存量数据里 `user.groups` 列同时存在两种格式：

| 来源 | 例 |
|---|---|
| 后台管理页保存用户 | `"jetems/eng"` (owner/name) |
| Invitation/Application/Provider/LDAP auto-join | `"eng"` (短名) |
| syncer_dingtalk | `"1234"` (部门 id 字符串) |

下游对此的假设不一致：

- `GroupChangeTrigger` (改名前): 只用 `builder.Like{"groups", oldName}` **子串匹配** —— `"eng"` 会误匹配 `"english"`；我们新修的版本同时替换短名和 owner/name 两种形式，但 syncer_dingtalk 的数字 id 走第三条路
- `GetUserFullGroupPath`: **强制** `owner/name`，短名直接崩
- LDAP server: 原样吐，客户端看到的字符串格式飘忽
- biz engine `expandGroupMembership`: 假设 subject_id 是 owner/name（我们自己可控），然后 `GetGroupUsers(owner/name)` → `userEnforcer` 查 `"group:owner/name"` —— 如果 User.Groups 里存的是短名，enforcer 里也就是短名，**查不到**

### userEnforcer ↔ DB 一致性漂移风险

- `UpdateUser` / `AddUser` 把 `userEnforcer.UpdateGroupsForUser` 放在 DB update **之前**。DB 失败 → enforcer 已经更新 → 漂移直到重启
- `syncer_dingtalk` 根本不调 enforcer，直接写 DB
- 无重试 / 对账机制

### 层级完整性靠应用层

- `Group.ParentId` 存**短名**，且没有外键
- 删父组前只检查有没有子组，不检查 User.Groups 里是否还有引用该组的老数据（软删不会清 User.Groups）
- `GetUserFullGroupPath` 遇到 ParentId 指向不存在的组时 **返回 error**（不是静默降级）—— 层级一旦烂掉，JWT 失败

### biz 表没有外键到 Group

- `biz_role_member.subject_id` / `biz_permission_grantee.subject_id` 是 varchar，不绑 FK
- 靠 `DeleteGroup` 的应用层拦截（我们刚加）
- 靠 `GroupChangeTrigger` 的应用层级联 rename（我们刚加）
- 任何**绕过** `DeleteGroup` / `UpdateGroup` 的直写（比如 syncer、管理员 SQL）都会留孤儿

### SyncAfterUserGroupsChanged 是 fire-and-forget

- `go func(){...}()` 失败只打 Warning，不重试不追溯
- 没有版本号 / 对账 / 观测指标
- 若 goroutine panic 或 DB 短暂故障，biz 策略永久漂移到下一次任何触发

---

## 8. Blast-Radius 矩阵

| 表面 | 读 | 写 | auto-prov | emit-token | 重构风险 |
|---|:---:|:---:|:---:|:---:|---|
| **User.Groups 存储** | ✅ | ✅ | ✅ | ✅ | 🔴 CRITICAL — 格式双存；重命名级联；每次用户改动都碰 |
| **userEnforcer g-rules** | ✅ | ✅ | — | — | 🔴 HIGH — 必须和 User.Groups 一致；4 个写入点；无对账 |
| **Group.ParentId 层级** | ✅ | ✅ | — | — | 🔴 HIGH — 重命名级联；孤儿风险；无 FK；遍历假设完整 |
| **GetGroupUsers / GetUserFullGroupPath** | ✅ | — | — | — | 🔴 HIGH — enforcer ↔ DB 一致性；格式假设；错误传播 |
| **Token 生成 (useGroupPathInToken)** | ✅ | — | — | ✅ | 🟡 MEDIUM — 配置开关；下游可能硬编码格式 |
| **LDAP memberOf 输出** | ✅ | — | — | — | 🟡 MEDIUM — 客户端期望短名或 DN，`owner/name` 会泄露 |
| **biz_role_member / biz_permission_grantee** | ✅ | ✅ | — | — | 🟡 MEDIUM — 无 FK；rename 级联；孤儿风险 |
| **biz engine expandGroupMembership** | ✅ | — | — | — | 🟡 MEDIUM — GetGroupUsers 必须一致；异步重建；陈旧策略风险 |
| **SyncAfterUserGroupsChanged** | — | ✅ | — | — | 🟡 MEDIUM — 漏触发即策略陈旧；org-scope 查 apps 慢 |
| **Auto-join (DefaultGroup/SignupGroup)** | — | ✅ | ✅ | — | 🟡 MEDIUM — 短名格式硬编码；无校验 group 存在 |
| **LDAP sync (dnToGroupName)** | ✅ | ✅ | ✅ | — | 🟡 MEDIUM — DN 解析脆弱；首次同步自动建组；无回滚 |
| **Syncer.syncGroups** | ✅ | ✅ | ✅ | — | 🟡 MEDIUM — 批量；不同步 enforcer；每组独立 UpdateGroup |
| **老 Role.Groups / Permission.Groups** | ✅ | ✅ | — | — | 🟢 LOW — 废弃；biz 不读；无级联更新 |
| **LDAP server handleSearch** | ✅ | — | — | — | 🟢 LOW — 只读输出；格式泄露但不会破坏功能 |
| **Group CRUD 端点** | ✅ | ✅ | — | — | 🟢 LOW — 标准 REST；无特殊逻辑 |
| **前端页面** | ✅ | ✅ | — | — | 🟢 LOW — UI 层；跟随 API 变 |

---

## 9. 重构建议（分阶段）

### Phase 1 — 归一化（最低风险，最高 ROI）

> 做完这一步，后面所有事都变简单。

1. 审计现有 `user.groups` 列，统计多少行是短名 vs full id vs 数字
2. 写一次性迁移脚本：所有 user.Groups 条目标准化成 `owner/name`
3. 改 4 个 auto-join 入口 (Application/Invitation/Provider/LDAP DefaultGroup/SignupGroup) 让它们存 `owner/name`
4. 改 syncer_dingtalk 让它也存 `owner/name`（需要先建 dingtalk→group 的映射表，或动态建组）
5. `User.Groups` setter 加校验：拒绝短名
6. 删掉 `GroupChangeTrigger` 里的短名替换分支（迁移后不再需要）
7. 测试：rename 组 → User.Groups / biz 表 / 子组 ParentId 全部更新 → enforce 正确

### Phase 2 — 加强不变式（中风险）

1. 给 `biz_role_member.subject_id` / `biz_permission_grantee.subject_id` 加外键到 Group（如果 DB 支持；否则加 trigger）
2. 把 `userEnforcer` 更新纳入和 DB update 同一个事务（xorm session 包一下）
3. 给 `SyncAfterUserGroupsChanged` 加失败队列 / 重试 / 对账指标
4. 给 `GroupChangeTrigger` 改成事务内同步执行（当前 biz sync 是 goroutine，rename 完成不代表策略已重建）

### Phase 3 — 简化 Group 身份（高风险）

1. `Group.ParentId` 改成 full id（或 computed column）—— 改完 `GetUserFullGroupPath` 可以删 owner 推导
2. 考虑 `biz_role_member.subject_id` 从字符串改成 `group_id` FK（但 user/role/userset 复用同列就不好做）
3. 评估是否废弃老 `role.Groups` / `permission.Groups`

### Phase 4 — biz engine 演进（前三阶段完成后）

1. 组继承支持（group 里可以放 group）
2. org-scope role 查找 apps 加缓存（hot path）
3. `subject_type='userset'` 真正接入 ReBAC 解析（当前是占位符）
4. 组的所有者 / 管理权限（谁能改成员）

---

## 10. 当前已落的相关修复（2026-04-17）

| commit | 内容 |
|---|---|
| `93c739ca` | `expandGroupMembership` —— 首次让 biz engine 把 group→user 展开成 Casbin g 规则 |
| `e38b44f5` | User.Groups 变动触发 biz sync；GroupChangeTrigger 级联到 biz 表；DeleteGroup 拦截 biz 引用 |

---

## 附录：关键调用链速查

### "用户被移出组" → biz enforce 应拒绝

```
UpdateUser(user, cols=[groups])
  ├─ userEnforcer.UpdateGroupsForUser(userId, newGroups)
  │     └─ 重建 Casbin `g userId "group:xxx"` 规则
  ├─ ormer.Engine.Update(user, cols)
  └─ SyncAfterUserGroupsChanged(org, diff(old, new))
        └─ findAppsReferencingGroups(org, diffGroups)
              ├─ biz_permission_grantee where subject_type='group' and subject_id in diff
              └─ biz_role_member where subject_type='group' and subject_id in diff
                    └─ + ExpandRoleDescendants(roleId) (继承向下传播)
        └─ for each app: go SyncAppPolicies(org, app)
              └─ expandGroupMembership → GetGroupUsers(groupId) → emit `g user groupId`
              └─ e.SavePolicy() → 写 policy 表
              └─ StoreBizEnforcerCache(app, enforcer)
```

### "组被重命名" → 所有引用级联

```
UpdateGroup(newGroup)
  └─ GroupChangeTrigger(owner, oldName, newName)
        ├─ session.Where("groups LIKE %oldName%").Update User.Groups (短名 + full id 双替换)
        ├─ session.Update child groups' ParentId
        ├─ session.Exec UPDATE biz_role_member SET subject_id
        ├─ session.Exec UPDATE biz_permission_grantee SET subject_id
        ├─ session.Commit
        └─ SyncAfterUserGroupsChanged(owner, [newGroupId])
              └─ 同上
```

### "组被删除" → 应拒绝如果有 biz 引用

```
DeleteGroup(group)
  ├─ 检查: 有子组? → "group has children group"
  ├─ 检查: GetGroupUserCount > 0? → "group has users"
  ├─ 检查: biz_role_member 有引用? → "group is referenced by biz role members"
  ├─ 检查: biz_permission_grantee 有引用? → "group is referenced by biz permission grantees"
  └─ deleteGroup(group)
```
