# 多用户版本发布与恢复手册

更新：2026-11-12。本地分支 `codex/multi-user-auth`；生产尚未发布本次升级。

## 已完成与待实测

- 本地独立 MongoDB：`tcca_multi_preview_20261112`，真实 Google 登录已成功。
- 冻结快照中的 164 笔流水、4 个预设仅添加归属字段，原业务内容逐 ID/hash 一致。
- Google 登录、365 天滚动会话、多设备 Passkey、个人设置同步、个人 AI 配置、独立账本及 `/admin` 已实现。
- 49 项单元测试、60 项 HTTP 检查通过，覆盖历史功能、SSRF、加密、用户缓存切换、真实签名 Cookie、跨用户隔离、封禁、清理恢复、Passkey 注册/重命名/签名登录和阻止客户端提权。
- Docker 镜像 `tcca:multi-user-local-20261112` 构建及临时容器验收通过：匿名访问私人接口返回 401，已登录账号可读自己的预设和分页流水，容器重启后原 Google 会话仍有效；测试容器已移除。Compose 配置校验通过，并增加认证服务健康检查。
- 本地 Next.js 生产构建通过，重启后真实 Google 会话仍有效；原 AI 配置已明确导入预览账号，实际连接测试成功。手机宽度 393px 设置页和 320px 管理页已检查。
- Passkey 的密码学流程测试不等于 iPhone Face ID / Android 指纹真机验证。正式 HTTPS 上仍需分别添加凭据并退出后实测。
- Google Cloud 当前仍为 Testing，只有测试用户能登录。朋友加入前须将其加入测试名单，或按 Google 要求发布应用。只申请基本身份 scope。

## 密钥与环境

`.env.example` 是字段清单，实际凭据只放 Git 忽略的本地 `.env.local` 或服务器 `.env`。OAuth 下载 JSON 不加入仓库。`BETTER_AUTH_SECRET` 和 `AI_CONFIG_ENCRYPTION_KEY` 各自生成后保持稳定，另做受限离线备份；不能随构建重生成。丢失加密主密钥后，数据库备份无法恢复用户 AI Key。

生产 `BETTER_AUTH_URL=https://tcca.duckdns.org`；本地 `http://localhost:3184`。Passkey 绑定域名，localhost 的凭据不能用于正式域名。Google 回调为该 origin 加 `/api/auth/callback/google`。

生产首发先设置 `ALLOW_NEW_USERS=false`，只允许已核对邮箱的站长注册；完成迁移及验收后再开放。站长身份由已验证的 Google 邮箱初始化，不会把旧账分给第一个随意注册的人。

## 上线顺序（不要直接在旧数据库运行测试）

1. 手机上未确认的普通草稿先确认或另存；每个旧浏览器的自定义设置需要单独导出。原 HTTP 和新 HTTPS 是不同站点存储空间。新版提供公开静态 `/settings-export.html`，可在原有完整 origin（例如 `http://40.233.65.88:8084/settings-export.html`）的同一手机浏览器导出旧设置，交由维护者核对目标账号后进行一次性迁移。日常设置页按最新 UI 要求不提供设置文件导入/导出或账单导出入口。导出页不上传、不清除旧存储。已清空的旧存储无法由数据库恢复。
2. 记录当前生产 commit、Docker 镜像 ID、容器配置。停止旧应用写入，保留 HTTPS 代理。对当前整个生产数据库重新备份，单独安全备份服务器 `.env` 和两枚新主密钥。此备份包括 Nov8 之后持续新增的所有记录，不能拿历史快照覆盖现在的数据。
3. 把新代码置于服务器的新版本目录/镜像，设置生产认证环境；保留旧镜像供排查。MongoDB 使用原数据库。启动带登录保护的新应用，关闭普通注册。
4. 站长亲自用确认的 Google 邮箱登录生产。此时旧数据尚无 userId，正常界面不会显示。先运行下述归属 dry-run，确认目标邮箱、库名、记录数量，然后 apply。apply 会再自动产生仓库外全库备份，只改无归属的业务记录，不改金额、日期、内容和时间戳。
5. 按冻结历史 IDs 回归，对后续新增记录另做迁移前后比对。迁移脚本自动检查本次迁移前后业务字段一致；若有旧记录被用户主动编辑，不应拿旧快照强行覆盖。
6. 站长在设置里明确导入旧服务器 AI 配置；其他用户不会共享它。核对并迁移各自旧浏览器设置，检查分类筛选。测试一条临时账单、预设、暂存及分析，再清理临时数据。
7. 正式域名分别实测 iPhone / Android Passkey、多设备登录、重启容器后登录保持。验收后才开放注册。全程不改共享网关归属或证书配置。

## 数据工具（Node 22）

以下示例要求主机安装 Node 22，并已在版本目录安装本项目依赖（`pnpm install --frozen-lockfile`），在仓库根目录运行，`--env-file=.env` 读取服务器配置；先核对库名。用实际时间戳替换占位目录，备份路径必须在仓库外且尚不存在。命令不会打印凭据。

```bash
node --env-file=.env scripts/ledger-data.mjs backup --database tcca --output /home/ubuntu/tcca-backups/pre-release-YYYYMMDDTHHMMSSZ
node --env-file=.env scripts/ledger-data.mjs migrate-owner --database tcca
node --env-file=.env scripts/ledger-data.mjs migrate-owner --database tcca --apply --confirm-db tcca --backup-dir /home/ubuntu/tcca-backups/owner-migration-YYYYMMDDTHHMMSSZ
node --env-file=.env scripts/ledger-data.mjs verify-baseline --database tcca --snapshot /home/ubuntu/tcca-backups/pre-multi-user-20261107T171430Z/mongodb.ejson
```

历史 `verify-baseline` 只比对冻结快照中的 ID，报告后增记录数量但不会将它们判错。不能按账单日期过滤，因为后增数据可能补录旧日期。快照后对原记录的主动编辑会报告 changed，需人工区分。

本地验证：

```powershell
node --experimental-strip-types --test tests/*.test.mjs
node --env-file=.env --env-file=.env.local tests/multi-user-integration.mjs
node --env-file=.env --env-file=.env.local scripts/ledger-data.mjs verify-baseline --database tcca_multi_preview_20261112 --snapshot C:\Users\28623\.codex\backups\tcca\pre-multi-user-20261107T171430Z\mongodb.ejson
```

集成脚本拒绝非预览/测试库，只连接 localhost:3184；创建随机测试账号，结束后只清除这些测试账号数据。`restore-preview` 也只允许独立命名的预览/测试数据库，且业务集合必须为空。该工具不是生产覆盖恢复命令。

## 回退与恢复

不能在公网直接回退到无登录的旧版本：它会暴露多用户集合。故障时先通过共享网关进入维护/仅站长可达状态，保留故障现场和最新备份；回滚到经过认证的稳定版本，或修复当前版本。任何数据库恢复先在全新的隔离库验证 EJSON 类型、集合选项、索引和文档内容，再决定切换；不要直接覆盖正在使用的库。

`mongodb.ejson` 包含集合选项和索引；`manifest.json` 有 SHA-256 和数量。备份可能包含加密凭据与认证数据，需要受限权限和独立安全存储。Linux 目录 700、文件 600；Windows 另设置仅当前用户和 SYSTEM 可读。持续备份应同时包含数据库与稳定环境密钥，按空间设置保留周期；当前实现不声称已配置生产定时备份。

站长后台位于 `/admin`，仅站长会话可访问。后台显示账号与数量、基础错误统计，不显示别人的账单原文或 API Key。清理要求先停用用户并输入邮箱；清理可恢复，彻底删除只处理已清理的数据，仍需再次明确确认。
