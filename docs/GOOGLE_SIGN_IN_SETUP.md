# TCCA：HTTPS 与 Google 登录准备指南

更新日期：2026-11-13。正式域名为 `tcca.duckdns.org`，Google 登录、多用户隔离、个人配置及站长后台已发布；以下保留 Google 控制台手工配置教程，生产迁移与验收见 MULTI_USER_RELEASE.md。

## 本项目固定使用的地址

| 项目 | 地址 |
| --- | --- |
| 现有 HTTP 网站 | `http://harborside.duckdns.org:8084/` |
| 当前正式入口 | `https://tcca.duckdns.org` |
| 计划 Google 回调 | `https://tcca.duckdns.org/api/auth/callback/google` |
| 计划本地调试入口 | `http://localhost:3184` |
| 计划本地 Google 回调 | `http://localhost:3184/api/auth/callback/google` |
| 计划站长后台 | `https://tcca.duckdns.org/admin` |

本地调试地址仅用于同一台电脑，不是手机可以直接访问的正式地址。`localhost` 与 `127.0.0.1` 是不同的主机名，后续程序与控制台必须保持一致。

## HTTPS 状态更新

- 用户已完成 HTTPS 部署，正式入口为 `https://tcca.duckdns.org`，没有 `:8084` 后缀。
- 2026-11-12 本轮 HTTPS 请求返回 200，页面标题为 TCCA，未跳过 TLS 证书验证。
- 2026-11-08 对旧域名 `harborside.duckdns.org` 的未部署检查仅是历史记录，不代表当前 HTTPS 状态。
- 共享 HTTPS 网关属于独立 `personal-gateway` 项目；不要把网关、证书或 ACME 密钥移进 TCCA 仓库。
- 本轮没有改动 DNS、证书、网关、Google 账户或计费配置，也没有重新核验自动续订周期。

## HTTPS 长期运维参考（已部署，不重复安装）

现有共享网关方案负责 TLS，应用继续使用内部 HTTP。以下保留长期检查清单，不是要求再次部署或覆盖现有网关。证书及自动续订配置在独立网关项目维护。

需要逐项确认：

1. DNS A 记录持续指向服务器；若配置了 AAAA，IPv6 也必须能正确到达服务器。
2. 云平台安全规则及服务器防火墙允许所选 ACME 验证与 HTTPS 使用的端口。采用常规自动配置时准备公网 TCP 80、443。
3. 代理在正确的非 Tailscale 网络接口监听，把 `tcca.duckdns.org` 请求转发给 TCCA；绑定方式按服务器实际网络配置确定。
4. 代理的证书／ACME 状态目录持久化，并让服务在服务器重启后自动启动。
5. 实测 `https://tcca.duckdns.org`，证书主机名正确、浏览器信任、页面/API/静态资源正常。
6. HTTP 到 HTTPS 的正式跳转要在旧浏览器个人设置安排导出／迁移后启用。
7. 长期保留自动续期所需的域名控制权及验证入口，检查续期错误和证书到期状态。

不建议现在直接把已有地址改成 `https://tcca.duckdns.org:8084`：8084 当前运行的是 HTTP 应用，不会因为换协议文字自动支持 TLS。

浏览器会把 HTTP/HTTPS、IP/域名和不同端口视为不同来源。旧入口的自定义分类／支付方式不会自动出现在新入口，虽然数据库流水和账单预设依然存在。先保留原手机站点数据。

## Google 控制台配置

HTTPS 现已可用，可以继续创建 Google 项目和客户端；正式联调还需要本站登录代码就绪。

### 费用边界（用户明确要求 Google 登录新增费用为零）

计划使用基础 Google OAuth／OIDC 登录，本站用户、会话与 Passkey 由自托管应用和现有 MongoDB 管理。它不是 Google Cloud 云主机试用，也不是采用 Firebase Authentication 或 Cloud Identity Platform 托管认证的 MAU 套餐。

Google 的登录 Codelab 明确账号和项目免费，并用自托管网页／后端接收身份信息。不需要为这条登录路线购买 Google Cloud 运行资源或使用 90 天赠送额度。相关授权限制是防滥用和审核限制，不能随意套用其他产品的 50,000 MAU 免费额度，也不能承诺无限请求或永远不受政策变化影响。

用户截图显示 Cloud Free Trial，不代表已经进入按量付费。官方说明只有手动升级到付费结算账户后才可能收费；试用到期不自动扣款，但试用关联的云资源可能停止。为了让登录配置与试用账单分开，建议新建仅用于 TCCA OAuth 的项目，确认不关联 Cloud Billing 账户；不要为登录去点 Upgrade、创建 VM、Cloud Run、存储桶或启用 Identity Platform。

具体项目是否已关联结算，需要在 Billing → My projects 检查；本轮只查看截图及官方文档，没有访问用户控制台或替用户解除／启用计费。预算提醒不等于支出硬上限。若已有其他云资源，不要盲目停用其计费或删除项目。

参考：[Google 官方登录 Codelab](https://codelabs.developers.google.com/codelabs/sign-in-with-google-button)、[试用及自动计费规则](https://cloud.google.com/signup-faqs)、[OAuth 授权限制](https://support.google.com/cloud/answer/9028764?hl=en)。

### 1. 创建独立项目

打开 [Google Cloud Console](https://console.cloud.google.com/)，使用长期管理这个网站的个人 Google 账号。

在顶部项目选择器选择“新建项目／New project”，名称可填 `TCCA Login`，创建后确认顶部当前项目为这个项目。个人账号没有组织时按控制台允许的无组织方式创建即可。为零费用路线确认该项目未关联 Cloud Billing，避免沿用截图里承载试用资源的默认项目。

### 2. 初始化 Google Auth Platform

在顶部搜索框搜索 `Google Auth Platform`。也可打开 [OAuth 概览](https://console.cloud.google.com/auth/overview)。若提示 `Get started／开始使用`，进入初始化。

依次填写：

| 字段 | 建议值 |
| --- | --- |
| App name／应用名称 | `TCCA` |
| User support email／用户支持邮箱 | 你的管理邮箱 |
| Audience／目标受众 | `External／外部` |
| Contact information／开发者联系邮箱 | 你长期接收通知的邮箱 |

朋友之间使用也选择 External；Internal 指同一个 Google Workspace 组织内的账号，不等于私人朋友。

按控制台要求阅读并自行确认相关协议，完成创建。

### 3. Branding／品牌信息

打开左侧 `Branding`：

- 名称填 `TCCA`，支持邮箱和联系邮箱使用前述邮箱。
- 若需要授权网域，填写 `tcca.duckdns.org`，不带协议、端口或路径。
- 不把 `duckdns.org` 当作自己拥有的根域名填写。
- 初期测试可先不上传 Logo，也不急于申请正式品牌发布。
- 主页填写 `https://tcca.duckdns.org`；HTTPS 已在本轮确认可访问。
- 隐私政策填写 `https://tcca.duckdns.org/privacy`，使用条款填写 `https://tcca.duckdns.org/terms`；这两个页面现已实现并发布。
- 若控制台要求域名所有权验证，需要先完成可行的 Search Console 验证；免费子域名不等于已通过 Google 验证，也不代表一定不能用。

显示自定义品牌与获取基本登录身份是不同的验证事项。正式发布前按控制台实际要求补齐主页、隐私说明、条款和品牌验证；不能承诺仅创建 OAuth 客户端就完成全部上线条件。

### 4. Audience／受众和发布状态

开发阶段先保留 `Testing`，可在 `Test users` 中添加自己和朋友的 Google 邮箱，方便按测试账号联调。

注意：Google 当前规则对只请求 `openid`、`email`、`profile` 的应用存在测试名单例外，所以这里的名单不能代替本站邀请码、注册限制或访问控制。我们已决定不做邀请码，日后依靠本站账号状态及轻量管理功能处理。

暂时不必点击 `Publish app`。准备正式使用时再结合品牌和发布要求处理。

### 5. Data Access／数据访问权限

点击 `Add or remove scopes／添加或移除范围`，只选择基本身份信息：

```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

界面可能显示对应的“邮箱”“个人资料”说明。这对应程序里的 `openid email profile`。

不要申请 Gmail 邮件、Drive、Calendar 等权限，也无需为简单身份登录启用这些产品。保存选择。

### 6. Clients／创建 OAuth 客户端

打开左侧 `Clients` → `Create client`：

| 字段 | 填写值 |
| --- | --- |
| Application type／应用类型 | `Web application` |
| Name／名称 | `TCCA Web` |

即使用户用 iPhone、Android 或添加到主屏幕访问，现在仍然是网站，所以选择 Web application，不为两种手机分别创建原生客户端。

**Authorized JavaScript origins／已获授权的 JavaScript 来源**：我们计划主要使用服务器回调流程，这不是必需的客户端 JS 权限配置；如果填写，准确使用以下来源，不带路径：

```text
https://tcca.duckdns.org
```

可另加本地调试来源：

```text
http://localhost:3184
```

**Authorized redirect URIs／已获授权的重定向 URI**：这是必须正确填写的回调字段。正式地址为：

```text
https://tcca.duckdns.org/api/auth/callback/google
```

本地调试可另外添加：

```text
http://localhost:3184/api/auth/callback/google
```

不要填 HTTP 公网 8084 地址、服务器裸 IP 或 `/admin`。回调路径不是后台入口，末尾也不自行多加 `/`。正式与本地客户端／项目后续如需分开，可再单独创建。

### 7. 保存凭据

点击创建，保存 `Client ID` 和 `Client Secret`；如果提供 JSON 下载，可安全保存到仓库之外。

Google 当前文档提示新建客户端的 Secret 只在创建时展示，务必当场保存。Client ID 常以 `.apps.googleusercontent.com` 结尾；Secret 是网站的机密配置，不是普通的 Google API Key，也不是用户的 Google 密码。

Client Secret 不贴聊天、不上传 GitHub。后续通过服务器环境变量交给程序，计划使用：

```dotenv
GOOGLE_CLIENT_ID=这里填写客户端ID
GOOGLE_CLIENT_SECRET=这里填写客户端Secret
BETTER_AUTH_URL=https://tcca.duckdns.org
```

应用现已读取这些认证配置。还需配置稳定的 `BETTER_AUTH_SECRET`、`AI_CONFIG_ENCRYPTION_KEY`、站长邮箱及注册开关；完整字段见 `.env.example`，Compose 已传递这些变量。

### 8. 准备完成的判断

- 已有 TCCA 项目，受众为 External。
- 只选择基本身份权限。
- 已创建 Web application 客户端。
- 回调地址与本文一致，凭据已安全保存。
- 正式 HTTPS 可访问后再联调。
- 未填写不存在的隐私页面，也未把创建客户端误当成程序已接入。

应用侧 Google 登录、会话、角色、数据归属及迁移现已完成。回调接口由 Google 授权流程访问，不应手工直接打开；`/admin` 仅允许已登录的站长账号使用。

## 多设备 Passkey 与后台设计确认

一个本站账号可有多枚 Passkey。建议两台常用手机分别添加一枚：iPhone 用 Face ID 或解锁密码，Android 用指纹或其设备解锁方式，都登录同一个 userId。设备不会被另一个设备挤下线。

Passkey 不是手输的一段网站密码。设备 PIN 只用于本机解锁密钥；网站不保存该 PIN 或生物信息。跨平台不假定 Apple 与 Google 的密码管理器自动互通。

后台是同站点 `/admin`，登录站长账号后在设置中显示入口；普通账号即使直接输入 URL，也由服务器拒绝。角色绑定内部用户，不因登录方式改为 Passkey 或换设备而变化。

## 固定历史数据回归范围

本轮已冻结的基线是 164 笔流水、4 个预设的固定记录 ID，并保存在备份目录的 `regression-baseline.json` 中。已核对其创建时间均早于香港时间 2026-11-08 00:00。

后续测试使用快照的独立数据库，不写生产库；比对只覆盖这些固定 ID，不纳入新增记录，即使新增记录填的是旧账单日期。快照后的主动编辑／删除单列报告，不恢复旧备份覆盖日常新增数据。正式迁移前仍须重新完整备份并迁移届时全部旧账号数据。

## 官方资料

- [Google Auth Platform 入门](https://support.google.com/cloud/answer/15544987?hl=en)
- [品牌及授权网域](https://support.google.com/cloud/answer/15549049?hl=en)
- [OAuth 客户端及回调规则](https://support.google.com/cloud/answer/15549257?hl=en)
- [数据访问范围](https://support.google.com/cloud/answer/15549135?hl=en)
- [测试／发布状态](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- [Better Auth Google 回调约定](https://better-auth.com/docs/authentication/google)
- [Apple Passkey 多设备问答](https://developer.apple.com/news/?id=21mnmxow)
- [Google Passkey 环境及同步说明](https://developers.google.com/identity/passkeys/supported-environments)
- [Caddy 自动 HTTPS 与续期](https://caddyserver.com/docs/automatic-https)
