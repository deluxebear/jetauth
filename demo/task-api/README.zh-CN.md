# Task API 演示服务

> English version: [README.md](./README.md)

一个极简的 HTTP 服务，用来验证 JetAuth WAF 网关的 **URL 级授权**能力。业务侧故意做得无聊（内存态任务列表），把复杂度都留给访问控制：11 个端点分到 5 个 tag 组，方便在**应用授权**模块里给不同角色分不同的子集，产生肉眼可见的行为差异。

## 为什么需要这个

JetAuth 现在支持给每个站点挂一个 Casbin Enforcer（隶属"应用授权"的某个应用），对每个请求做 URL 级放行。没这个 demo 之前，验证链路得把网关指到真实的内部服务，开发调试很痛苦。这个 demo：

- 一条命令起，无外部依赖；
- 自带 OpenAPI 3.1 规范，可以一键把 11 个资源导入应用授权；
- 会读网关注入的 `X-Forwarded-User` / `X-Forwarded-Email`，把身份原样回显，验证身份是否端到端透传。

## 本地启动

```bash
# 在仓库根目录
go run ./demo/task-api
# 或者指定端口
PORT=8081 go run ./demo/task-api
```

打开 http://localhost:8081/ 查看索引页和端点表。

## 本地环境配置 —— 让请求走 JetAuth WAF 网关

直接访问 `:8081` 只能看到 demo 本身，验证不了 URL 级授权。真正的数据流是
**浏览器 → JetAuth 网关 → demo**：SSO、身份头注入、BizAuthz 拦截都在网关
这一层发生。本地把这条链路串起来需要 4 步：

```
┌────────┐     task-demo.jetauth.local:8080     ┌──────────────┐
│ 浏览器 │ ───────────────────────────────────▶ │ JetAuth 网关 │
└────────┘                                      └──────┬───────┘
                                                       │  http://localhost:8081
                                                       ▼
                                                ┌──────────────┐
                                                │  task-api    │
                                                └──────────────┘
```

### 1. 选一个本地域名

随便造一个，只要浏览器会把它放到 `Host` 头里发出去、JetAuth 的站点查找能匹配
到就行。`.local`、`.test` 或者自己编的顶级域都可以。这份文档用的是：

```
task-demo.jetauth.local
```

### 2. 在 `/etc/hosts` 里把域名指向 127.0.0.1

```bash
# macOS / Linux — 加一行，然后 macOS 需要刷新 DNS 缓存
echo '127.0.0.1  task-demo.jetauth.local' | sudo tee -a /etc/hosts
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder  # 仅 macOS

# Windows — 用管理员权限编辑：
#   C:\Windows\System32\drivers\etc\hosts
#   加一行：  127.0.0.1  task-demo.jetauth.local
```

用 `ping task-demo.jetauth.local` 验一下能不能解析到 `127.0.0.1`。不通的话下面
都白搭。

### 3. 网关端口从 80/443 改成 8080/8443（macOS/Linux 避 sudo）

JetAuth 网关默认监听 `80` + `443`，在类 Unix 系统上需要 root。本地开发直接改
`conf/app.conf`：

```ini
gatewayHttpPort  = 8080
gatewayHttpsPort = 8443
```

然后重启 JetAuth 后端，让新端口生效。管理台 `:8000` 不受影响，是另一个监听。

> **为什么不干脆用 sudo 跑 80/443？** 也行，好处是 URL 能省掉端口——
> `http://task-demo.jetauth.local/api/tasks` 更干净。但每次重启都要 root，权衡
> 下来不如加个端口号省事。

### 4. 在 JetAuth 里配置站点

管理台（http://localhost:8000）进入 **Sites → Add**，按下表填：

| 字段                | 值                                   | 原因                                                 |
|---------------------|--------------------------------------|------------------------------------------------------|
| Name                | `task-demo`                          | 内部标识。                                           |
| Domain              | `task-demo.jetauth.local`            | 必须和第 1 步完全一致——这是查站点的 key。            |
| SSL mode            | `HTTP`                               | 本地跳过 TLS，不用折腾证书。                         |
| Host                | `http://localhost:8081`              | 上游地址。**协议头必须带**（代码里是字符串拼接）。   |
| Application         | 你的 JetAuth 应用                    | SSO + BizAuthz 的身份来源。                          |
| Enable BizAuthz     | 打开                                 | 开启 URL 级授权。                                    |
| BizAuthz bypass     | `/api/health`                        | 心跳探针跳过授权。                                   |
| BizAuthz fail mode  | `closed`（默认）                     | 引擎出错时拒绝——安全默认。                          |

保存即可，JetAuth 在保存时会刷新内存中的 `SiteMap`，这一步不用重启。

> **不想填 `Host`？** 留空，把 `Port` 设成 `8081` 也行——`site.GetHost()` 在只
> 有 `Port` 时会拼出 `http://localhost:8081`。两种都可以；上游不在 `localhost`
> 的时候用 `Host` 更清楚。

### 5. 把两个服务都跑起来

```bash
# 终端 1 —— JetAuth 后端（管理台 :8000 + 网关 :8080）
go run .

# 终端 2 —— task-api demo（上游 :8081）
go run ./demo/task-api
```

### 6. 走网关访问，不要直连 demo

```bash
# 预期：200 JSON，跳过授权（在 bypass 白名单里）
curl -i http://task-demo.jetauth.local:8080/api/health

# 预期：302 跳到 SSO，因为还没登录
curl -i http://task-demo.jetauth.local:8080/api/tasks

# 浏览器：
open http://task-demo.jetauth.local:8080/api/me
# 走完 SSO 之后应该看到：
#   {"identity":{"user":"built-in/alice","email":"alice@ex.com"}}
# 这说明网关注入了身份头，demo 也正确读到了。
```

如果 `/api/me` 返回空 `user` 加 `gatewayNote`，说明请求没走网关（直接打到了
`:8081`，不是 `:8080`）。

## 端点清单

| 方法   | 路径                    | Tag      | 建议角色                |
|--------|-------------------------|----------|-------------------------|
| GET    | `/api/health`           | health   | bypass（白名单）        |
| GET    | `/api/me`               | identity | 任意已登录用户          |
| GET    | `/api/tasks`            | tasks    | viewer / editor / admin |
| POST   | `/api/tasks`            | tasks    | editor / admin          |
| GET    | `/api/tasks/{id}`       | tasks    | viewer / editor / admin |
| PUT    | `/api/tasks/{id}`       | tasks    | editor / admin          |
| DELETE | `/api/tasks/{id}`       | tasks    | admin                   |
| GET    | `/api/reports/summary`  | reports  | admin                   |
| GET    | `/api/reports/export`   | reports  | admin                   |
| GET    | `/api/admin/audit`      | admin    | super-admin             |
| POST   | `/api/admin/broadcast`  | admin    | super-admin             |

## 端到端走查

1. **准备一个 JetAuth 应用**（没有就先建）——这是网关 BizAuthz 校验身份的来源。
2. **建一个 Biz 应用授权配置**，绑定上一步的应用，模型用默认 RBAC 就够。
3. **导入 OpenAPI 规范**——在授权模块里走*资源 → 导入 → OpenAPI*，粘贴 `demo/task-api/openapi.yaml`（或从 `http://localhost:8081/openapi.yaml` 拉），应该会看到 11 个资源按 tag 分组。
4. **配角色和权限**——建议矩阵：
   - `viewer`：`tasks:listTasks`、`tasks:getTask`、`identity:whoAmI`
   - `editor`：viewer 的全部 + `tasks:createTask`、`tasks:updateTask`
   - `admin`：editor 的全部 + `tasks:deleteTask`、`reports:*`
   - `super-admin`：admin 的全部 + `admin:*`
5. **建一个站点**指向这个 demo——字段怎么填、端口怎么改、SSL 怎么选、bypass
   和 fail-mode 怎么设置，详见上面的
   [本地环境配置](#本地环境配置--让请求走-jetauth-waf-网关)。
6. **给用户分配角色**（在授权模块里）。
7. **通过网关访问站点**——比如 `http://task-demo.jetauth.local:8080/api/tasks`。
   SSO 走完之后，网关会把 `(userId, path, method)` 交给 Enforcer，然后根据角色
   返回 200 或 JSON 格式的 403。

## 排错

- **`/api/me` 返回空用户**——请求没走网关，或者站点 `EnableBizAuthz` 是关的。`gatewayNote` 字段只在缺失请求头时才出现，用来区分这两种情况。
- **所有请求都 503**——应用绑定错了，或者 Biz 应用被禁用了。503 专指"授权栈配置异常"，403 才是"被策略拒"。需要追代码路径看 `service/authz.go`。
- **策略改完过一会儿才生效**——Enforcer 缓存目前是进程内本地缓存。多实例部署的注意事项见 `TODO.md` *Redis 缓存 — 多实例部署支持*。
