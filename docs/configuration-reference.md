# JetAuth 配置项参考

本文档列出 JetAuth 启动时读取的**全部**配置项。所有键都来自
`conf/app.conf`（Beego INI 格式），**但实际默认值并不都写在文件里** ——
很多键是代码里 hard-code 的 fallback，在 `app.conf` 中缺省或留空。本文档把
代码里的默认值显式补齐，避免"配置文件里没见到 = 这项不存在"的误解。

## 读取机制（先看这一段）

JetAuth 的配置读取链路：

```
os.LookupEnv(key)  ──── 命中 ────▶ 用环境变量值
        │
        ▼ 未命中
web.AppConfig.String(key)  ─── 命中 ────▶ 用 app.conf 的值
        │
        ▼ 空字符串
代码内的 fallback（有就用，没有返回空字符串/0/false）
```

三条关键规则：

1. **环境变量优先级最高**。任何键都可以通过同名环境变量覆盖（不只是 `httpport`
   和 `appname`），见 `conf/conf.go:44` 的 `GetConfigString`。大小写敏感。
2. **`GetConfigBool` 只认字面量 `"true"`**。写 `1`、`yes`、`True` 都会被当成
   false。见 `conf/conf.go:62`。
3. **Beego 内置键 vs JetAuth 扩展键**：`appname`、`httpport`、`runmode`、
   `copyrequestbody` 是 Beego 本身消费的（`web.BConfig`）；其余都是 JetAuth
   代码通过 `conf.GetConfigXxx` 读的。缺了前者 Beego 就起不来；缺了后者通常
   只是走默认值。

## 快速索引

**✅ 已出现在 `conf/app.conf`**；**➕ 代码里读取但文件里没有**。

| 键                          | 默认值                                   | 类型    | 在 app.conf 中 |
|-----------------------------|------------------------------------------|---------|----------------|
| `appname`                   | `jetauth`                                | string  | ✅             |
| `httpport`                  | `8000`                                   | int     | ✅             |
| `runmode`                   | `dev`                                    | string  | ✅             |
| `copyrequestbody`           | `true`                                   | bool    | ✅             |
| `driverName`                | `sqlite`                                 | string  | ✅             |
| `dataSourceName`            | `file:jetauth.db?cache=shared`           | string  | ✅             |
| `dbName`                    | `jetauth`                                | string  | ✅             |
| `tableNamePrefix`           | `""`（无前缀）                           | string  | ✅             |
| `showSql`                   | `false`                                  | bool    | ✅             |
| `gatewayHttpPort`           | `80`                                     | int64   | ➕             |
| `gatewayHttpsPort`          | `443`                                    | int64   | ➕             |
| `ldapServerPort`            | `""`（不启动 LDAP 服务）                 | string  | ✅             |
| `ldapsServerPort`           | `""`（不启动 LDAPS 服务）                | string  | ✅             |
| `ldapsCertId`               | `""`                                     | string  | ✅             |
| `redisEndpoint`             | `""`（用内存 session）                   | string  | ✅             |
| `bizPolicyCacheEnabled`     | `false`                                  | bool    | ✅             |
| `bizReBACCacheL3Enabled`    | `false`                                  | bool    | ✅             |
| `origin`                    | `""`（回调用当前请求 host）              | string  | ✅             |
| `originFrontend`            | `""`                                     | string  | ✅             |
| `authState`                 | `jetauth`                                | string  | ✅             |
| `socks5Proxy`               | `127.0.0.1:10808`                        | string  | ✅             |
| `defaultStorageProvider`    | `""`                                     | string  | ✅             |
| `isCloudIntranet`           | `false`                                  | bool    | ✅             |
| `verificationCodeTimeout`   | `10`（分钟）                             | int64   | ✅             |
| `initScore`                 | `0`                                      | int     | ✅             |
| `isUsernameLowered`         | `false`                                  | bool    | ✅             |
| `logPostOnly`               | `true`                                   | bool    | ✅             |
| `staticBaseUrl`             | `https://cdn.casbin.org`                 | string  | ✅             |
| `isDemoMode`                | `false`                                  | bool    | ✅             |
| `batchSize`                 | `100`                                    | int     | ✅             |
| `showGithubCorner`          | `false`                                  | bool    | ✅             |
| `forceLanguage`             | `""`（不强制）                           | string  | ✅             |
| `defaultLanguage`           | `en`                                     | string  | ✅             |
| `aiAssistantUrl`            | `https://ai.casbin.com`                  | string  | ✅             |
| `defaultApplication`        | `app-built-in`                           | string  | ✅             |
| `maxItemsForFlatMenu`       | `7`                                      | int64   | ✅             |
| `enableErrorMask`           | `false`                                  | bool    | ✅             |
| `enableErrorMask2`          | `false`                                  | bool    | ➕             |
| `enableGzip`                | `true`                                   | bool    | ✅             |
| `inactiveTimeoutMinutes`    | `0`（不启用）                            | int64   | ✅             |
| `quota`                     | `{-1,-1,-1,-1}`（不限）                  | json    | ✅             |
| `logConfig`                 | 自动生成（见"日志"章节）                 | json    | ✅             |
| `initDataNewOnly`           | `false`                                  | bool    | ✅             |
| `initDataFile`              | `""`                                     | string  | ✅             |
| `frontendBaseDir`           | `""`                                     | string  | ✅             |
| `ssrfAllowedHosts`          | `""`（全封私网）                         | string  | ✅             |
| `useGroupPathInToken`       | `false`                                  | bool    | ➕             |
| `acmeEmail`                 | `""`                                     | string  | ➕             |
| `acmePrivateKey`            | `""`                                     | string  | ➕             |

---

## 1. 服务器与运行模式

### `appname` — 应用名
- **默认**：`jetauth`（来自 `app.conf`）
- **用途**：Beego 内部用作日志文件名（见 `logConfig` 自动生成规则），以及
  WebAuthn 的 `RPDisplayName`（`object/user_webauthn.go:39`）。
- **可环境变量覆盖**：✅（`conf.go:init` 里预置可用 env 覆盖）。

### `httpport` — 管理台 / API 端口
- **默认**：`8000`
- **用途**：Beego HTTP 监听端口。管理台 UI、所有 `/api/*` 接口都从这个端口
  暴露。**和网关的 `gatewayHttpPort` 是两个独立监听。**
- **可环境变量覆盖**：✅

### `runmode` — 运行模式
- **默认**：`dev`（文件里）
- **用途**：Beego 自身的运行模式；`pp/*.go` 里也用它判断是否走支付沙箱
  （`== "prod"` 时用生产支付端点）。
- **合法值**：`dev` / `prod` / `test`（Beego 约定）。

### `copyrequestbody` — 保留原始请求体
- **默认**：`true`
- **用途**：Beego 配置。允许控制器多次读取 `r.Body`（JetAuth 很多接口需要）。
  **不要关**。

---

## 2. 数据库

### `driverName` — 数据库驱动
- **默认**：`sqlite`
- **合法值**：`sqlite` / `mysql` / `postgres` / `mssql` / `cockroachdb`。
- **用途**：选 xorm 适配器。为空时会在启动时跳过 ORM 初始化（
  `object/ormer.go:92`）—— 通常意味着配置坏了。

### `dataSourceName` — 数据库连接串
- **默认**：`file:jetauth.db?cache=shared`（SQLite）
- **示例**：
  - MySQL：`user:pass@tcp(127.0.0.1:3306)/`（注意尾部 `/`，`dbName` 会拼上）
  - Postgres：`user=jetauth password=xxx host=127.0.0.1 port=5432 sslmode=disable dbname=`
- **Docker 特例**：`RUNNING_IN_DOCKER=true` 时会自动把 `localhost` 改成
  `host.docker.internal`（非 Linux）或 `172.17.0.1`（Linux），见
  `conf/conf.go:86`。

### `dbName` — 数据库名
- **默认**：`jetauth`
- **用途**：MySQL 时拼到 `dataSourceName` 末尾；Postgres/SQLite 时含义由驱动
  决定。

### `tableNamePrefix` — 表名前缀
- **默认**：`""`（无前缀）
- **用途**：xorm 建表时的前缀。改了要重新建表。

### `showSql` — 打印 SQL
- **默认**：`false`
- **用途**：调试时开，会把每条 SQL 打到日志。

---

## 3. 网关（WAF）

### `gatewayHttpPort` — 网关 HTTP 端口
- **默认**：`80`（文件里没写，代码 fallback，见 `service/proxy.go:369`）
- **本地开发建议**：改成 `8080` 避 sudo。
- **类型**：int64。写成字符串 Beego 也能解析，但非数字会导致启动失败。

### `gatewayHttpsPort` — 网关 HTTPS 端口
- **默认**：`443`（同上，`service/proxy.go:374`）
- **本地开发建议**：改成 `8443`。
- **证书**：SNI 动态获取，见 `service/proxy.go:427` 的 `GetCertificate`，
  从 `Cert` 表按域名查。本地开发把站点 SSL 模式设 `HTTP` 就能完全绕开。

> 这两项在默认 `app.conf` 里没有。想改请手动加：
> ```ini
> gatewayHttpPort = 8080
> gatewayHttpsPort = 8443
> ```

---

## 4. LDAP 服务

### `ldapServerPort` — 内建 LDAP 服务端口
- **默认**：`""`（不启动）
- **用途**：JetAuth 可以作为 LDAP 服务端对外提供目录查询。留空即不启动
  （`ldap/server.go:31`）。常用值：`389`。

### `ldapsServerPort` — 内建 LDAPS 端口
- **默认**：`""`（不启动）
- **用途**：同上，TLS 版本。常用值：`636`。

### `ldapsCertId` — LDAPS 使用的证书 ID
- **默认**：`""`
- **格式**：`admin/cert-name`，指向 Cert 表里的一行。仅在 `ldapsServerPort`
  非空时读取。

---

## 5. Redis / 缓存

### `redisEndpoint` — Redis 地址
- **默认**：`""`（不用 Redis，session 走内存）
- **格式**：`host:port`，例如 `127.0.0.1:6379`。
- **影响**：
  - 非空 → Beego session 改用 Redis 存储（`main.go:38`），多实例部署需要。
  - 配合 `bizPolicyCacheEnabled=true` 启用业务授权策略 Redis 缓存
    （`object/biz_redis_cache.go:48`）。

### `bizPolicyCacheEnabled` — 启用业务授权 Redis 缓存
- **默认**：`false`
- **前置条件**：`redisEndpoint` 非空才真正生效。
- **用途**：把 Casbin 策略/模型缓存到 Redis，SDK 通过 `/api/biz-get-policies`
  拉取时走 Redis；进程内 `sync.Map` 缓存仍在。**多实例部署时进程内缓存陈旧
  问题尚未解决**，详见 `TODO.md` *Redis 缓存 — 多实例部署支持*。

### `bizReBACCacheL3Enabled` — 启用 ReBAC tupleset Redis 缓存（L3 层）

**Type:** bool
**Default:** false

Enables the L3 Redis-backed tier for the ReBAC tupleset cache. When off (default),
ReBAC uses only the in-process L2 cache (`InMemoryBizReBACCache`). When on, requires
`redisEndpoint` to be set — reads go through Redis before falling back to the DB,
writes are mirrored to Redis, and invalidations are broadcast to all instances via a
`jetauth:rebac:invalidations` pub/sub channel so that a tuple write on instance A
immediately flushes the matching L2 entry on instance B. CP-8 C6.

---

## 6. 身份与 OAuth

### `origin` — JetAuth 自身对外地址
- **默认**：`""`（回调时用当前请求的 Host 拼）
- **用途**：OIDC discovery 文档（`/.well-known/openid-configuration`）、
  CORS 白名单、Casdoor SDK endpoint 等场景。
- **建议**：生产必须设，例如 `https://auth.jetauth.com`。

### `originFrontend` — 前端单独部署时的前端地址
- **默认**：`""`（前后端同源）
- **用途**：前后端分域部署时用来校验 postMessage origin、拼 CORS 头。
  见 `controllers/auth.go:908`、`routers/cors_filter.go:47`。

### `authState` — OAuth state 基准值
- **默认**：`jetauth`
- **用途**：SSO 登录时 `state` 参数的默认值，用于防 CSRF。应用级 state 也
  会通过（`controllers/auth.go:933`）。

### `socks5Proxy` — 出站 SOCKS5 代理
- **默认**：`127.0.0.1:10808`（**文件里写的这个值在无代理环境下会导致
  SMTP/代理功能失败**，建议改空）
- **用途**：SMTP 邮件（`email/smtp.go:44`）、对第三方代理请求
  （`proxy/proxy.go:60`）时走 SOCKS5。
- **关闭**：留空 `socks5Proxy =`。

### `verificationCodeTimeout` — 验证码有效期（分钟）
- **默认**：`10`
- **用途**：短信/邮件验证码有效期（`object/verification.go:295`、
  `object/sms.go:76`）。

### `isUsernameLowered` — 用户名强制小写
- **默认**：`false`
- **用途**：创建/匹配用户时把 username 转小写，避免 `Alice`/`alice`
  重名（`object/user.go:1097`）。

### `useGroupPathInToken` — JWT 里用组全路径
- **默认**：`false`（文件里没有）
- **用途**：JWT 里的 `groups` 字段是否用 `org/parent/child` 这种全路径。
  见 `object/token_jwt.go:516`。

---

## 7. 前端 UI

### `staticBaseUrl` — 静态资源基址
- **默认**：`https://cdn.casbin.org`（`conf.go:52` 里 hard-code）
- **用途**：前端图片/图标的 CDN 前缀。私有部署改成自己 CDN 或留空用本地。

### `frontendBaseDir` — 前端构建产物目录
- **默认**：`""`
- **用途**：自定义前端静态文件位置（`routers/static_filter.go:39`）。默认用
  `embed_static.go` 打进 binary 的 `web/build/`。

### `enableGzip` — 静态资源 gzip
- **默认**：`true`
- **用途**：`routers/static_filter.go:38`，静态资源响应压缩。

### `showGithubCorner` — 右上角 GitHub 角标
- **默认**：`false`
- **用途**：前端右上角那个折角链接。私有化部署关掉。

### `forceLanguage` / `defaultLanguage`
- **默认**：`forceLanguage=""`（不强制），`defaultLanguage=en`
- **用途**：前端语言选择。`forceLanguage` 非空时忽略浏览器语言强制使用。

### `aiAssistantUrl` — AI 助手入口
- **默认**：`https://ai.casbin.com`
- **用途**：管理台右下角 AI 助手弹层。私有化部署改指向自建或留空。

### `defaultApplication` — 默认应用
- **默认**：`app-built-in`（`web_config.go:39` fallback）
- **用途**：未指定应用的登录入口默认走哪个 Application。

### `maxItemsForFlatMenu` — 扁平菜单阈值
- **默认**：`7`（`web_config.go:44` fallback）
- **用途**：菜单项少于此值时用扁平布局，多于时分组折叠。

---

## 8. 存储

### `defaultStorageProvider` — 默认存储提供商
- **默认**：`""`
- **用途**：用户头像/资源上传默认走哪个 Provider。留空则直接用 avatar
  URL（`object/avatar.go:29`）。

### `isCloudIntranet` — 云内网模式
- **默认**：`false`
- **用途**：存储上传走内网端点（阿里云 OSS 等），见 `object/storage.go:43`。

---

## 9. 日志与观测

### `logConfig` — 日志配置 JSON
- **默认**：`{"adapter":"console"}`（app.conf）
- **未配时 fallback**：`{"filename":"logs/<appname>.log","maxdays":99999,"perm":"0770"}`
  （`conf.go:54`）
- **用途**：Beego logs 的 adapter 配置。合法 adapter：`console` / `file` /
  `multifile` / `conn`（远程）等。
- **示例**：同时输出文件和控制台
  ```json
  {"adapter":"multifile","filename":"logs/jetauth.log","separate":["error","info"]}
  ```

### `logPostOnly` — 只记录 POST 请求
- **默认**：`true`
- **用途**：访问日志是否只记录 POST（`object/record.go:35`）。生产建议保持
  `true`，GET 太多会把记录表撑爆。

### `enableErrorMask` / `enableErrorMask2` — 错误信息脱敏
- **默认**：`false` / `false`（`enableErrorMask2` 文件里没有）
- **用途**：对外响应里把内部错误消息替换为通用提示。生产开，开发关。

---

## 10. 配额（quota）

### `quota` — 资源数量上限（JSON）
- **默认**：`{"organization":-1,"user":-1,"application":-1,"provider":-1}`（即不限）
- **用途**：SaaS 限制每个租户能建多少组织/用户/应用/Provider。
  `-1` = 不限。见 `conf/conf_quota.go`。

---

## 11. 初始化数据

### `initDataFile` — 首启种子数据文件
- **默认**：`""`
- **用途**：指定 JSON 文件路径，首次启动时导入组织/应用/用户/权限初始数据。
  见 `object/init_data.go:57`。

### `initDataNewOnly` — 只写新对象
- **默认**：`false`
- **用途**：`true` 时已存在的对象不会被 seed 文件覆盖（保护用户修改）。

---

## 12. ACME / 证书

### `acmeEmail` — Let's Encrypt 账户邮箱
- **默认**：`""`（文件里没有）
- **用途**：站点开启 ACME 自动签发证书时必填。空值会在签发时直接报错
  （`object/site_cert_account.go:96`）。

### `acmePrivateKey` — ACME 账户私钥
- **默认**：`""`
- **用途**：同上。PEM 格式。

> 这两项只在你要用 JetAuth 管理 Let's Encrypt 证书时才需要，本地 HTTP 模式
> 用不到。

---

## 13. 安全与 SSRF

### `ssrfAllowedHosts` — 自定义 HTTP 邮件 SSRF 白名单（CIDR）
- **默认**：`""`（全部私网 IP 都被拦）
- **格式**：逗号分隔 CIDR，例如 `10.0.0.0/8,172.20.0.0/16`
- **用途**：Custom HTTP Email 发送端点走的 HTTP 请求默认禁止打到 RFC1918 /
  loopback / link-local / 云元数据 IP。想让它能访问内网邮件网关，把对应
  CIDR 加进来（`object/email.go:84`）。

### `inactiveTimeoutMinutes` — 闲置自动登出（分钟）
- **默认**：`0`（不启用）
- **用途**：用户多久没活动就被踢下线（`routers/timeout_filter.go:34`）。

### `isDemoMode` — 演示模式
- **默认**：`false`
- **用途**：开启后禁用写操作，只允许浏览（`conf/conf.go:111`）。公开 demo
  站点才会开。

---

## 14. 其他

### `initScore` — 新用户初始积分
- **默认**：`0`
- **用途**：Organization 的 init score，用户注册时继承
  （`object/organization.go:623`）。

### `batchSize` — 批量操作分批大小
- **默认**：`100`（`conf/conf.go:118` fallback）
- **用途**：批量导入/同步时每批条数。

---

## 示例配置

### 本地开发（配合 Task API demo）

```ini
appname          = jetauth
httpport         = 8000
runmode          = dev
copyrequestbody  = true

driverName       = sqlite
dataSourceName   = "file:jetauth.db?cache=shared"
dbName           = jetauth

# 关键：网关端口改掉避开 sudo，和 Task API demo 的 :8081 分开
gatewayHttpPort  = 8080
gatewayHttpsPort = 8443

# 无代理就留空，不要照抄默认值
socks5Proxy      =

redisEndpoint    =
logConfig        = {"adapter":"console"}
```

### 生产最简样本（单实例）

```ini
appname          = jetauth
httpport         = 8000
runmode          = prod
copyrequestbody  = true

driverName       = mysql
dataSourceName   = "jetauth:***@tcp(db.internal:3306)/"
dbName           = jetauth

gatewayHttpPort  = 80
gatewayHttpsPort = 443

origin           = https://auth.example.com
originFrontend   = https://admin.example.com

redisEndpoint    = redis.internal:6379
bizPolicyCacheEnabled = true

enableErrorMask  = true
enableErrorMask2 = true
showGithubCorner = false
isDemoMode       = false

logConfig        = {"adapter":"file","filename":"logs/jetauth.log","maxdays":30}

acmeEmail        = ops@example.com
acmePrivateKey   = "-----BEGIN PRIVATE KEY-----\n..."
```

---

## 排错 FAQ

**改了 app.conf 没生效？**
检查是否同名环境变量被设置——env 变量优先级高于文件。用 `env | grep -i <key>`
看一眼。

**`gatewayHttpPort = abc` 启动失败？**
int64 解析不了会 log 错误，但不会致命；`GetConfigInt64` 返回 error 时
`service/proxy.go` 会走 `fallback=80`。**建议只写数字。**

**`bizPolicyCacheEnabled=true` 但没看到 Redis 读写？**
`redisEndpoint` 必须同时非空，两个条件都满足才启用（`biz_redis_cache.go:48`）。

**`socks5Proxy` 默认值 `127.0.0.1:10808` 导致 SMTP 超时？**
这个默认值在文件里，但本地没起代理就会失败。**改成空字符串 `socks5Proxy =`
即可关闭**。

**`GetConfigBool("xxx")` 在我设 `yes` 时返回 false？**
设计就是这样——只有字面量字符串 `"true"` 才返回 true。写 `True` 也不认。

**想看某键实际被读到的值？**
最稳的办法是在代码里临时加一句 `logs.Info("%s=%q", key, conf.GetConfigString(key))`
启动一次。没有内置的 "dump all config" 命令。

---

## 后续完善清单

- [ ] 增加 `/api/admin/dump-config` 端点（demo-mode 下拒绝），方便排障时
      查看合并后的有效配置。
- [ ] 把 `gatewayHttpPort` / `gatewayHttpsPort` / `enableErrorMask2` /
      `useGroupPathInToken` / `acmeEmail` / `acmePrivateKey` 加到默认
      `app.conf` 注释里（带说明 + 默认值），不必启用但留个提示。
- [ ] 在启动日志里打印一次所有已读配置的摘要（敏感字段脱敏）。
