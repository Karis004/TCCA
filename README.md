# TCCA

TCCA 是一个个人用的 AI 记账网站。打开页面后直接输入一句自然语言，系统会调用 OpenAI 兼容接口解析账单，用户确认后保存到 MongoDB。分析页默认用港币查看，也可切换人民币，同时保留原币金额汇总。

## 一键部署

准备一台已经安装 Docker 和 Docker Compose 的服务器，把项目放上去后，在项目根目录创建 `.env`：

```bash
MONGODB_URI=mongodb+srv://user:password@example.mongodb.net
MONGODB_DB=tcca

AI_API_BASE_URL=https://api.openai.com/v1
AI_API_KEY=你的_API_KEY
AI_MODEL=gpt-4.1-mini

FX_API_BASE_URL=https://open.er-api.com/v6/latest
FX_API_KEY=
```

然后运行：

```bash
docker compose up -d --build
```

访问：

```text
http://服务器IP:3000
```

`docker-compose.yml` 会同时启动：

- `tcca`：Next.js 应用

MongoDB 不由 Docker 启动。你需要在 `.env` 的 `MONGODB_URI` 中填写自己的 MongoDB 地址。这样 Docker 只负责运行网站，数据仍然存放在你自己可控的数据库里。

如果你申请了 ExchangeRate-API 的免费 Key，可以这样配置：

```bash
FX_API_BASE_URL=https://v6.exchangerate-api.com/v6
FX_API_KEY=你的汇率_API_KEY
```

不填 `FX_API_KEY` 时，会使用 open access 汇率接口。

## 用户使用

首页只有一个核心入口：输入一句话。

例子：

```text
昨天在中环喝咖啡花了 48 hkd，八达通付款
```

点击“识别账单”后，AI 会生成一张待确认账单。用户可以修改：

- 类型：支出、收入、转账、退款
- 金额
- 货币
- 日期
- 分类
- 支付方式
- 商户
- 备注

确认后账单会写入数据库。

未明确指定币种时，AI 识别与手动新增均默认 HKD。“元”“块”或单独的 ¥、￥、$ 等货币符号也按港币处理；明确说出人民币、CNY、RMB，或日元、JPY 等币种名称/代码时，才使用对应币种。多笔账单分别判断，保留金额小数。待确认账单仍显示折算人民币金额。

商户字段会根据历史记录显示常用商户，方便快速点击填入。

待确认账单可以「存为预设」。账单预设单独保存在 MongoDB 的 `transaction_presets` 集合中，支持命名、编辑、删除，并可在手机与电脑间共用。

点击记账页的预设卡片后，会生成日期为当天的待确认账单，跳过 AI 识别，并重新获取汇率。保存或使用预设均不会写入流水，仍需点击「确认录入」。预设不保存旧日期、旧汇率或 AI 原文，编辑和删除预设也不会影响已有流水。

预设名称、金额、编辑和删除操作保持紧凑的一行。手机端将预设放在待确认区域之后，减少识别到账单确认之间的滚动距离。

AI 暂时不可用时，可以点击输入区的「暂存文字」，保存当前原文后继续记录下一笔；无需先调用 AI。识别失败时会保留输入，并显示暂存提示。暂存文字单独保存在 MongoDB 的 `pending_inputs` 集合中，默认收起，支持编辑、删除和单条或批量识别。

「批量识别」会逐条处理待识别文字，失败的保留原文及错误原因，成功的保存为待确认账单，刷新页面后可以继续确认。每条文字按其暂存时的参考日期理解「今天／昨天」，编辑时可调整该日期。已识别成功的条目不再重复调用 AI。确认录入后才写入流水并从暂存区移除，支持原有的「全部录入」；暂存账单重复确认不会重复写入。尚未提交的人工修改仍需在当前页面确认保存。

分析页提供：

- 页面顶部统一选择时间，默认当前月，也可选择任意月份或全部时间
- 顶部「查看币种」可切换 HKD / CNY，默认 HKD；所有汇总、分类和图表同步切换
- 所选期间的收入、支出、结余、每日流水和分类支出；无记录月份显示零
- 月度净流向始终展示全部月份，未记录月份按零显示，不受顶部筛选影响
- 分类支出环图，以及对应分类的金额和占比
- 折叠的原币金额汇总

结余表示所选期间的收入减支出，不代表实际账户余额。收入包含退款，转账不计入收入、支出和月度净流向。当前月按香港时区确定。

港币视图保留港币账单原额，其他币种按当前汇率换算；人民币视图沿用每笔账单保存时的人民币折算金额。切换视图不会修改历史流水或已保存的汇率。月度净流向不受时间筛选影响，但跟随查看币种切换。

设置页可以编辑：

- 消费分类
- 支付方式

这些自定义内容会参与后续 AI 识别。

## 本地开发

技术栈：

- Next.js 15
- React 18
- TypeScript
- MongoDB
- Recharts
- Zod
- OpenAI-compatible Chat Completions API

安装依赖：

```bash
pnpm install
```

创建 `.env`：

```bash
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=tcca

AI_API_BASE_URL=https://api.openai.com/v1
AI_API_KEY=你的_API_KEY
AI_MODEL=gpt-4.1-mini

FX_API_BASE_URL=https://open.er-api.com/v6/latest
FX_API_KEY=
```

启动开发服务：

```bash
pnpm dev
```

构建检查：

```bash
pnpm build
```

分析统计测试（已在 Node.js 22.12 验证）：

```bash
pnpm test:analytics
```

账单预设校验与日期复用测试：

```bash
pnpm test:presets
```

币种默认值、明确指定与多币种识别规则测试：

```bash
pnpm test:currency
```

暂存文字校验、恢复合并和去重测试：

```bash
pnpm test:pending
```

## 项目结构

```text
src/
  app/
    page.tsx                 主页面和主要交互
    api/
      parse/route.ts         AI 文本解析
      transactions/route.ts  流水增删查
      analytics/route.ts     分析数据
      fx/route.ts            汇率查询
      presets/route.ts       预设分类和支付方式

  components/
    TransactionEditor.tsx    待确认账单编辑器
    AnalyticsPanel.tsx       分析页筛选与响应式图表

  lib/
    aiClient.ts              OpenAI 兼容接口调用、错误重试
    aiPrompt.ts              AI 解析 Prompt
    currency.ts              币种识别和标准化
    fx.ts                    汇率接口
    analytics.ts             时间范围与收支统计
    mongodb.ts               MongoDB 连接

  models/
    ledger.ts                账单类型定义

  presets/
    ledger.ts                默认分类、支付方式、币种
```

## API 简介

`POST /api/parse`

输入自然语言，返回 AI 识别后的账单草稿。服务端会自动处理临时性 AI 错误并重试一次。

`GET /api/transactions`

返回最近流水。

`POST /api/transactions`

保存账单。保存时会重新计算人民币金额，避免前端数据不准。

`DELETE /api/transactions?id=...`

删除流水。

`GET /api/analytics?month=YYYY-MM&currency=HKD`

返回所选月份的收支、每日流水、分类、支付方式和原币汇总；不传月份时默认当前月，`month=all` 表示全部时间。`currency` 支持 `HKD`（默认）和 `CNY`，返回的 `displayCurrency` 标注汇总单位。月度净流向始终使用全部记录，并跟随查看币种。

`GET /api/fx?currency=HKD`

返回指定币种到人民币的汇率。

`GET /api/transaction-presets`、`POST /api/transaction-presets`

读取或创建账单预设。

`PUT /api/transaction-presets?id=...`、`DELETE /api/transaction-presets?id=...`

更新或删除指定预设，不修改 `transactions` 流水集合。

`GET /api/pending-inputs`、`POST /api/pending-inputs`

读取未完成的暂存记录，或保存 `{ text, referenceDate: "YYYY-MM-DD" }`。读取时会恢复已超时的识别任务。

`PUT /api/pending-inputs?id=...`、`DELETE /api/pending-inputs?id=...`

编辑待识别原文与参考日期，或删除指定暂存记录。`DELETE` 可加 `draftId`，单独移除尚未录入的识别结果。

`POST /api/pending-inputs/parse?id=...`

识别指定原文并持久化草稿；已成功的记录直接返回原结果，失败则保留原文。通过短期任务租约避免同时重复调用 AI。批量操作在客户端逐条调用，部分失败不影响其他条目。

`POST /api/transactions` 可携带 `pendingInputId` 与 `pendingDraftId`，仅在确认时写入暂存账单，并通过稳定的记录 ID 避免重试产生重复流水。

## 部署注意

- 这是个人项目，没有登录系统。
- AI Key 只保存在服务端环境变量中，不会出现在浏览器页面里。
- Docker 只运行 TCCA 应用，不会创建或保存 MongoDB 数据。
- 账单数据存放在你配置的 `MONGODB_URI` 对应数据库中。
- open access 汇率接口需要保留页面底部的 ExchangeRate-API attribution。
