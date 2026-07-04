# TCCA

TCCA 是一个个人用的 AI 记账网站。打开页面后直接输入一句自然语言，系统会调用 OpenAI 兼容接口解析账单，用户确认后保存到 MongoDB。分析页会把不同币种统一折算为人民币，同时保留原币种视图。

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

商户字段会根据历史记录显示常用商户，方便快速点击填入。

分析页提供：

- 收入、支出、结余
- 每日流水折线图
- 月度净流向
- 分类支出
- 货币对比

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

  lib/
    aiClient.ts              OpenAI 兼容接口调用、错误重试
    aiPrompt.ts              AI 解析 Prompt
    currency.ts              币种识别和标准化
    fx.ts                    汇率接口
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

`GET /api/analytics?month=YYYY-MM`

返回分析数据，包括月度、每日、分类、支付方式、币种对比。

`GET /api/fx?currency=HKD`

返回指定币种到人民币的汇率。

## 部署注意

- 这是个人项目，没有登录系统。
- AI Key 只保存在服务端环境变量中，不会出现在浏览器页面里。
- Docker 只运行 TCCA 应用，不会创建或保存 MongoDB 数据。
- 账单数据存放在你配置的 `MONGODB_URI` 对应数据库中。
- open access 汇率接口需要保留页面底部的 ExchangeRate-API attribution。
