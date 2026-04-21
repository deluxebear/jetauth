# 原版商业与付款模块运作逻辑分析

## 1. 范围与结论

这份分析针对原版商业与付款大模块的前后端实现，覆盖：

- 后端路由、控制器与核心对象模型
- 前端商品、购物车、下单、支付、支付结果、订阅购买路径
- 订单、支付、订阅、交易、余额之间的状态流转
- 模块的关键约束、隐藏规则和风险点

本模块不是“一个支付页”，而是一个由以下子域拼起来的商业链路：

`Product -> Pricing/Plan -> Cart -> Order -> Payment -> Subscription -> Transaction -> Balance`

它的总体设计是对的：商品负责卖什么，计划/定价负责订阅包装，订单负责交易快照，支付负责对接渠道，订阅负责长期权益，交易负责账务痕迹，余额负责账户资产。

但实现上有几个很关键的特征：

- 订单支持多商品，但支付渠道实际由第一个商品决定
- 购物车不是独立表，而是挂在 `User.cart` 上
- 订阅在付款完成前就会先创建为 `Pending`
- 余额支付是同步成交，外部支付是异步回调成交
- 充值商品是特殊商品，它会影响余额，但不扣库存
- 外部支付的购买交易主要是审计记录，不直接扣用户余额

## 2. 后端模块地图

### 2.1 API 路由

商业与支付相关 API 集中在 [routers/router.go](/Users/xiongyanlin/projects/jetauth/routers/router.go:272)：

- 商品：`get/add/update/delete-product`，兼容接口 `buy-product`
- 订单：`get/get-user/add/update/delete/place/cancel/pay-order`
- 支付：`get/get-user/add/update/delete/notify-payment/invoice-payment`
- 计划：`get/add/update/delete-plan`
- 定价：`get/add/update/delete-pricing`
- 订阅：`get/add/update/delete-subscription`
- 交易：`get/add/update/delete-transaction`

其中真正的新主链路是：

1. `POST /api/place-order`
2. `POST /api/pay-order`
3. `POST /api/notify-payment/:owner/:payment`

`buy-product` 已退化为兼容接口，内部只是包装成“先下单，再支付”。

### 2.2 控制器职责

关键控制器分工如下：

- [controllers/product.go](/Users/xiongyanlin/projects/jetauth/controllers/product.go:173)
  - `BuyProduct()` 是废弃兼容入口
  - `GetProduct()` 会顺带扩展支付渠道对象，供前端直接渲染支付按钮
- [controllers/order_pay.go](/Users/xiongyanlin/projects/jetauth/controllers/order_pay.go:36)
  - `PlaceOrder()` 负责从请求体拿 `productInfos`
  - `PayOrder()` 负责校验订单归属后发起支付
  - `CancelOrder()` 只允许取消 `Created` 订单
- [controllers/payment.go](/Users/xiongyanlin/projects/jetauth/controllers/payment.go:223)
  - `NotifyPayment()` 是支付结果推进核心
  - `InvoicePayment()` 只允许对 `Paid` 支付开票

### 2.3 权限边界

权限模型有三个关键规则：

- 普通用户只能看自己的订单和支付记录，[controllers/order.go](/Users/xiongyanlin/projects/jetauth/controllers/order.go) 与 [controllers/payment.go](/Users/xiongyanlin/projects/jetauth/controllers/payment.go:61) 都做了约束
- 管理员可以代用户下单或付款
- 非管理员也可能通过 `paidUsername` 代一个指定用户购买，这是订阅购买场景留下的特殊入口，[controllers/order_pay.go](/Users/xiongyanlin/projects/jetauth/controllers/order_pay.go:56)

## 3. 核心对象模型

### 3.1 Product：售卖单元

[object/product.go](/Users/xiongyanlin/projects/jetauth/object/product.go:24)

核心字段：

- 基础售卖：`Currency`、`Price`、`Quantity`、`Sold`
- 充值特性：`IsRecharge`、`RechargeOptions`、`DisableCustomRecharge`
- 支付渠道：`Providers`
- 支付成功跳转：`SuccessUrl`
- 展示与发布：`DisplayName`、`Image`、`Detail`、`State`

关键规则：

- 如果产品没显式配置 `Providers`，系统会自动取组织下的 Payment Provider
- `Alipay` 只能用于 `CNY` 商品，[object/product.go](/Users/xiongyanlin/projects/jetauth/object/product.go:189)
- 充值商品支付成功只增加 `sold`，不扣 `quantity`
- 普通商品支付成功会扣库存并增加销量，[object/product.go](/Users/xiongyanlin/projects/jetauth/object/product.go:101)

### 3.2 Plan：订阅计划

[object/plan.go](/Users/xiongyanlin/projects/jetauth/object/plan.go:25)

核心字段：

- `Price`、`Currency`
- `Period`，目前只支持 `Monthly` / `Yearly`
- `Product`，计划最终还是绑定到一个实际商品
- `PaymentProviders`
- `IsEnabled`
- `IsExclusive`

关键规则：

- `IsExclusive=true` 时，同一用户对同一计划不能同时拥有 `Active` / `Upcoming` / `Pending` 订阅
- 周期时长不是任意配置，而是直接映射到一月或一年，[object/plan.go](/Users/xiongyanlin/projects/jetauth/object/plan.go:53)

### 3.3 Pricing：定价包装

[object/pricing.go](/Users/xiongyanlin/projects/jetauth/object/pricing.go:25)

核心字段：

- `Plans []string`
- `IsEnabled`
- `TrialDuration`
- `Application`

它本质上不是账务对象，而是“面向应用展示的一组可买计划”。

关键规则：

- `Pricing` 只是计划集合，不直接定义金额
- 某个应用可以存在多个 pricing，但默认只会取第一个启用的 pricing，[object/pricing.go](/Users/xiongyanlin/projects/jetauth/object/pricing.go:108)
- 下单或订阅时会校验 `pricing` 是否真的包含目标 `plan`，[object/pricing.go](/Users/xiongyanlin/projects/jetauth/object/pricing.go:157)

### 3.4 Order：交易快照

[object/order.go](/Users/xiongyanlin/projects/jetauth/object/order.go:25)

核心字段：

- `Products []string`
- `ProductInfos []ProductInfo`
- `User`
- `Payment`
- `Price`、`Currency`
- `State`、`Message`、`UpdateTime`

`Order` 是整个商业链路的中心枢纽。它不是简单引用商品，而是保存了一份购买时快照：

- 商品展示名
- 图片
- 详情
- 当时价格
- 币种
- 是否充值
- 购买数量
- 对应的 `pricingName` 和 `planName`

这意味着：

- 即使后续商品信息变化，历史订单仍能保留原始购买上下文
- 订单是支付、订阅、交易统一挂载的中间层

### 3.5 Payment：支付实例

[object/payment.go](/Users/xiongyanlin/projects/jetauth/object/payment.go:25)

核心字段：

- 渠道：`Provider`、`Type`
- 商品摘要：`Products`、`ProductsDisplayName`
- 付款信息：`Currency`、`Price`
- 用户：`User`
- 发票：`InvoiceType`、`InvoiceTitle`、`InvoiceTaxId`、`InvoiceUrl`
- 订单关联：`Order`、`OutOrderId`
- 渠道跳转：`PayUrl`、`SuccessUrl`
- 状态：`State`、`Message`

`Payment` 是对外支付渠道的一次尝试实例，不是订单本身。一个订单理论上应只绑定一次支付实例。

### 3.6 Subscription：长期权益

[object/subscription.go](/Users/xiongyanlin/projects/jetauth/object/subscription.go:39)

核心字段：

- `User`
- `Pricing`
- `Plan`
- `Payment`
- `StartTime`、`EndTime`
- `Period`
- `State`

状态集：

- `Pending`
- `Error`
- `Suspended`
- `Active`
- `Upcoming`
- `Expired`

它的状态不是单纯人工维护，而是会根据支付结果和时间窗口自动更新。

### 3.7 Transaction：账务痕迹

[object/transaction.go](/Users/xiongyanlin/projects/jetauth/object/transaction.go:34)

核心字段：

- `Category`：`Purchase` / `Recharge`
- `Type`、`Subtype`、`Provider`
- `User`
- `Tag`
- `Amount`、`Currency`
- `Payment`
- `State`

`Transaction` 才是余额变化和账目记录的真正落点，但不同支付方式对它的处理并不相同。

## 4. 主业务流程

### 4.1 商品浏览与订阅入口

原版前端主要入口有两个：

- 商品商城页 [web/src/ProductStorePage.js](/Users/xiongyanlin/projects/jetauth/web/src/ProductStorePage.js:105)
- 定价页 [web/src/pricing/PricingPage.js](/Users/xiongyanlin/projects/jetauth/web/src/pricing/PricingPage.js:114)

商品商城页负责卖“普通商品”。

定价页负责卖“订阅计划”，其链接并不是直接支付，而是跳转到：

- 已登录：`/buy-plan/{owner}/{pricing}?plan={plan}&user={user}`
- 未登录：先跳注册页，再携带计划参数

这说明订阅购买最终仍然走商品购买页，只是前面多了一层 `pricing/plan` 选择。

### 4.2 购物车机制

购物车不是独立的 cart 表，而是用户对象上的一个字段：

- [object/user.go](/Users/xiongyanlin/projects/jetauth/object/user.go:225) `Cart []ProductInfo`

前端行为：

- 商城页加购：[web/src/ProductStorePage.js](/Users/xiongyanlin/projects/jetauth/web/src/ProductStorePage.js:115)
- 商品详情页加购：[web/src/ProductBuyPage.js](/Users/xiongyanlin/projects/jetauth/web/src/ProductBuyPage.js:170)
- 购物车页编辑和下单：[web/src/CartListPage.js](/Users/xiongyanlin/projects/jetauth/web/src/CartListPage.js:71)

关键规则：

- 购物车只允许单币种，新增商品会校验币种是否与首个商品一致
- 充值商品不能在商城页直接加入购物车，必须进详情页选择金额
- 购物车项的去重键不只是 `product.name`
  - 普通商品：按商品名
  - 充值商品：按商品名 + 自定义金额
  - 订阅商品：还叠加 `pricingName + planName`

这套设计说明 `ProductInfo` 既是订单快照结构，也是购物车持久化结构。

### 4.3 下单

下单由 [object/order_pay.go](/Users/xiongyanlin/projects/jetauth/object/order_pay.go:26) 的 `PlaceOrder()` 完成。

后端做的事：

1. 校验 `productInfos` 非空，且每项必须有 `name`
2. 批量加载产品
3. 以第一个商品币种作为订单币种
4. 校验整个订单只能有单一币种
5. 生成 `ProductInfos` 快照
6. 计算总价
7. 写入 `Order`，初始状态为 `Created`

关键规则：

- 充值商品的价格取前端传入的自定义金额，而不是商品固定价格，[object/order_pay.go](/Users/xiongyanlin/projects/jetauth/object/order_pay.go:63)
- 普通商品价格以后端产品价格为准
- 订单创建时还没有 `Payment`

前端触发点：

- 商品详情立即下单：[web/src/ProductBuyPage.js](/Users/xiongyanlin/projects/jetauth/web/src/ProductBuyPage.js:250)
- 购物车批量下单：[web/src/CartListPage.js](/Users/xiongyanlin/projects/jetauth/web/src/CartListPage.js:90)

成功后都会跳到 `/orders/{owner}/{order}/pay`。

### 4.4 付款

付款由 [object/order_pay.go](/Users/xiongyanlin/projects/jetauth/object/order_pay.go:116) 的 `PayOrder()` 完成。

后端做的事：

1. 校验订单必须仍是 `Created`
2. 重新加载商品和用户
3. 校验币种一致
4. 用第一个商品决定支付渠道合法性
5. 生成 `paymentName`
6. 构造 `returnUrl` 和 `notifyUrl`
7. 如果订单里含 `pricing + plan`，先创建订阅
8. 调支付渠道 `Pay()`
9. 写入 `Payment`
10. 更新 `Order.payment`
11. 若是余额支付，则同步成交并立刻更新库存

这里有一个非常关键的隐藏规则：

- 多商品订单虽然存在，但支付渠道是由第一个商品决定的，[object/order_pay.go](/Users/xiongyanlin/projects/jetauth/object/order_pay.go:146)

这意味着：

- 混合多个商品下单时，后面的商品必须与第一个商品兼容同一个渠道
- 前端支付页只展示第一个商品的 `providerObjs`，这一点与后端规则一致，[web/src/OrderPayPage.js](/Users/xiongyanlin/projects/jetauth/web/src/OrderPayPage.js:72)

### 4.5 订阅创建时机

订阅不是支付成功后再建，而是在发起支付时就创建：

- [object/order_pay.go](/Users/xiongyanlin/projects/jetauth/object/order_pay.go:167)

创建逻辑：

1. 订单商品里只要带了 `pricingName + planName`
2. 就加载 `Plan`
3. 若 `IsExclusive`，先检查是否已有进行中订阅
4. 创建 `Subscription`
5. 初始状态为 `Pending`
6. 先把 `Payment` 字段填成即将生成的 `paymentName`

这意味着订阅和支付的关联是在支付成功前就建立好的。

好处：

- 支付回跳页可以通过 `subscription -> payment` 反查支付结果
- 订阅购买的前端结果页可以基于 subscription 路由统一承接

代价：

- 会产生一批未支付成功但已存在的 `Pending/Error` 订阅

### 4.6 支付结果推进

支付状态推进核心在 [object/payment.go](/Users/xiongyanlin/projects/jetauth/object/payment.go:259) `NotifyPayment()`。

流程如下：

1. 找到 `Payment`
2. 找到支付渠道 Provider
3. 调渠道 `Notify()`
4. 已终态的 payment 直接返回，避免重复处理
5. 若状态变化，更新 `Payment.state/message`
6. 推进 `Order.state`
7. 若 `Paid`，创建交易并更新库存

订单状态映射关系：

- `Payment.Paid -> Order.Paid`
- `Payment.Error -> Order.Failed`
- `Payment.Canceled -> Order.Canceled`
- `Payment.Timeout -> Order.Timeout`

这层还做了幂等保护：

- 支付已进入终态就不重复处理
- Provider 重复发 webhook，但状态没变化时也不重复落账

### 4.7 前端支付结果页

前端结果页在 [web/src/PaymentResultPage.js](/Users/xiongyanlin/projects/jetauth/web/src/PaymentResultPage.js:83)。

它不是简单展示，而是主动推进状态：

- 如果 `payment.state === Created`
- 对 `PayPal/Stripe/AirWallex/Alipay/WeChat Pay/Balance/Dummy`
- 前端每秒主动调用 `notify-payment`

这说明系统不是纯 webhook 驱动，而是“前端轮询 + 后端通知接口”双保险。

订阅场景里，结果页还会先：

1. 读取 `pricing`
2. 读取 `subscription`
3. 再从 `subscription.payment` 反查实际 `payment`

路径设计为：

- 普通支付：`/payments/{owner}/{payment}/result`
- 订阅支付：`/buy-plan/{owner}/{pricing}/result?subscription={sub}`

## 5. 状态机与资金流

### 5.1 订单状态机

订单状态主要有：

- `Created`
- `Paid`
- `Canceled`
- `Failed`
- `Timeout`

状态推进：

1. `PlaceOrder()` 生成 `Created`
2. `CancelOrder()` 可从 `Created -> Canceled`
3. `PayOrder()` 本身通常不改状态
4. `NotifyPayment()` 或余额支付同步流程推进为终态

### 5.2 支付状态机

支付状态来自 `pp.PaymentState`，常见包含：

- `Created`
- `Paid`
- `Canceled`
- `Timeout`
- `Error`

规则：

- 外部支付初始为 `Created`
- 余额支付创建后直接标记为 `Paid`，[object/order_pay.go](/Users/xiongyanlin/projects/jetauth/object/order_pay.go:279)

### 5.3 订阅状态机

订阅状态机在 [object/subscription.go](/Users/xiongyanlin/projects/jetauth/object/subscription.go:61)。

核心逻辑：

- `Pending`
  - 关联支付不存在 -> `Error`
  - 支付已付 -> `Active`
  - 支付不是 `Created` 且未付款 -> `Error`
- 时间驱动：
  - `startTime > now` -> `Upcoming`
  - `endTime < now` -> `Expired`
  - 其余 -> `Active`

注意点：

- `Pending` 订阅在排他计划中也会被视为占用名额，[object/subscription.go](/Users/xiongyanlin/projects/jetauth/object/subscription.go:232)

### 5.4 交易与余额流

交易逻辑在 [object/transaction.go](/Users/xiongyanlin/projects/jetauth/object/transaction.go:151)。

它分成三种入口：

- `AddTransaction()`
- `AddInternalPaymentTransaction()`
- `AddExternalPaymentTransaction()`

差异非常关键：

- 内部支付交易会先校验余额，再真实变更余额
- 外部支付交易只有 `Recharge` 类别才会改余额
- 外部支付的 `Purchase` 交易只是落账记录，不实际扣用户余额

余额更新规则：

- `Tag == Organization`：改组织自有余额
- `Tag == User`：改用户余额，并同步改组织用户余额汇总

### 5.5 余额支付

余额支付是同步完成的：

1. `PayOrder()` 创建 `Payment`
2. 直接把 `Payment.state = Paid`
3. 创建一条 `Purchase` 负向交易，扣用户余额
4. 如果订单里包含充值商品，再创建 `Recharge` 正向交易
5. 更新 `Order` 为 `Paid`
6. 更新库存

这条链路不依赖后续 `notify-payment`。

### 5.6 外部支付

外部支付是异步完成的：

1. `PayOrder()` 只创建 `Payment(Created)` 和 `Order.payment`
2. 用户跳到第三方支付
3. webhook 或前端轮询触发 `NotifyPayment()`
4. `NotifyPayment()` 更新 `Payment`
5. 推进 `Order`
6. 写 `Purchase` 交易
7. 如有充值商品，再写 `Recharge` 交易并增加余额
8. 扣库存

## 6. 前端页面职责拆解

### 6.1 商品商城页

[web/src/ProductStorePage.js](/Users/xiongyanlin/projects/jetauth/web/src/ProductStorePage.js:105)

职责：

- 拉取已发布商品
- 维护商品数量选择
- 将普通商品加入购物车
- 直接跳转商品详情购买页

限制：

- 不允许在这里直接加购充值商品

### 6.2 商品购买页

[web/src/ProductBuyPage.js](/Users/xiongyanlin/projects/jetauth/web/src/ProductBuyPage.js:250)

职责：

- 兼容普通商品购买
- 兼容订阅计划购买
- 兼容充值商品自定义金额
- 支持加购与立即下单

它实际上是商业主入口页，因为三种购买形态都在这里汇合。

### 6.3 购物车页

[web/src/CartListPage.js](/Users/xiongyanlin/projects/jetauth/web/src/CartListPage.js:71)

职责：

- 从 `user.cart` 读取购物车
- 回源检查商品是否还存在、是否有效
- 调整数量、删除条目
- 批量生成 `productInfos`
- 统一下单

### 6.4 订单支付页

[web/src/OrderPayPage.js](/Users/xiongyanlin/projects/jetauth/web/src/OrderPayPage.js:140)

职责：

- 拉取订单
- 拉取首个商品
- 根据首个商品的 `providerObjs` 渲染支付按钮
- 发起 `pay-order`
- 处理微信内 H5 / JSAPI 两种路径

这个页面和后端“首商品决定支付渠道”的规则是强绑定的。

### 6.5 支付结果页

[web/src/PaymentResultPage.js](/Users/xiongyanlin/projects/jetauth/web/src/PaymentResultPage.js:83)

职责：

- 承接支付返回
- 轮询或主动触发支付状态同步
- 处理普通购买与订阅购买两种回跳
- 对充值支付显示充值后余额

### 6.6 支付详情页

[web/src/PaymentEditPage.js](/Users/xiongyanlin/projects/jetauth/web/src/PaymentEditPage.js:73)

职责：

- 查看支付详情
- 发起开票
- 查看关联订单

它更多是支付后台运维页，而不是用户交易主路径。

## 7. 关键隐藏规则

### 7.1 单订单单币种

不管是购物车还是订单，系统都假设一次交易只能有一种币种。

这条规则在前端先挡一次，在后端再挡一次。

### 7.2 多商品订单的渠道由首商品决定

这是模块最重要的实现约束之一。

它虽然简化了支付设计，但也引入了组合购买边界：

- 理论上订单能放多个商品
- 实际上这些商品必须共享首商品的支付可用性

### 7.3 订阅不是免费对象

订阅并不是独立直接买，它必须经过：

- `pricing`
- `plan`
- `plan.product`
- `order`
- `payment`

所以订阅购买底层仍是“买商品”。

### 7.4 充值商品会形成正负两笔交易

如果用余额去买充值商品，流程会出现：

- 一笔 `Purchase` 负向交易
- 一笔 `Recharge` 正向交易

业务上看起来像“用余额买余额”，本质上更像一套统一账务模型下的特殊商品。

### 7.5 支付结果确认依赖主动同步

系统不是只依赖支付渠道 webhook。

前端结果页会主动调用 `notify-payment`，这意味着：

- 前端参与了支付收敛
- 支付最终一致性部分落在用户回跳链路上

## 8. 风险点与技术债

### 8.1 订单多商品能力与支付能力不完全对齐

订单结构支持多商品，但支付渠道选择、前端按钮展示、成功回跳都围绕首商品设计。这个模型可用，但不是严格的一致多商品支付模型。

### 8.2 订阅在支付前创建

好处是回跳和结果页处理更顺。

风险是会长期积累：

- `Pending` 订阅
- 失败后变 `Error` 的脏订阅

后续如果做运营视图或订阅统计，需要把这类状态明确区分。

### 8.3 购物车挂在用户对象上

这种方式实现简单，但存在天然问题：

- 并发写冲突风险高
- 用户对象体积被购物车污染
- 购物车历史、过期、拆单能力都弱

### 8.4 外部支付购买交易不改余额

这本身没问题，因为外部支付本来也不该扣站内余额。

但如果后续有人把 `Transaction` 当成“余额变化明细”来看，就会误解 `Purchase` 的语义。这里需要在产品和报表层做语义区分。

### 8.5 前端轮询驱动支付收敛

这对支付成功体验友好，但会导致：

- 前端承担过多支付确认责任
- 接口被高频轮询
- 若用户不回跳，结果完全依赖 webhook

### 8.6 充值结果页字段语义可能不一致

原版结果页在 [web/src/PaymentResultPage.js](/Users/xiongyanlin/projects/jetauth/web/src/PaymentResultPage.js:170) 用 `payment.isRecharge` 判断是否展示“充值成功”和余额文案。

但后端 `Payment` 模型并没有 `isRecharge` 字段，[object/payment.go](/Users/xiongyanlin/projects/jetauth/object/payment.go:25) 里只有商品列表和金额信息，没有充值标记。

这意味着：

- 充值支付成功后，前端未必能稳定进入充值专属成功态
- 更稳妥的做法应该是从 `order.productInfos` 或 `payment.products` 回查是否包含充值商品

## 9. 一句话理解整个模块

原版商业与付款模块的真实逻辑不是“商品支付”，而是：

先把商品或订阅计划包装成订单快照，再把订单挂到支付实例上，通过支付结果推进订阅和交易，最后由交易去沉淀账务和余额变化。

它的核心不是页面，而是 `Order / Payment / Subscription / Transaction` 这四个对象之间的串联。

## 10. 建议的后续研究方向

如果下一步继续深入，建议按这三个方向拆：

1. 研究“商业后台配置面”
   - 产品、计划、定价、支付渠道、交易列表、订阅列表是怎么被管理端配置和运营使用的
2. 研究“新版 web-new 与原版业务模型的映射差异”
   - 看新版 UI 是否只是换壳，还是已经改变了流程与对象边界
3. 研究“账务与余额语义”
   - 明确 `Purchase`、`Recharge`、组织余额、用户余额、外部支付交易记录之间的产品定义
