# PPTist 统一生产部署

- 唯一项目与 Git 仓库：`/srv/pptist`
- 前端源码：项目根目录的 `src/`、`public/` 和 `packages/`
- 后端源码：`/srv/pptist/backend`
- 统一生产目录：`/srv/pptist/dist`
- 前端生产文件：`/srv/pptist/dist/public`
- 播放器离线包与指南：`/srv/pptist/dist/public/downloads`
- 后端生产文件：`/srv/pptist/dist/backend`
- 环境配置：`/etc/pptist-cloud.env`
- PostgreSQL URL：`/etc/pptist-cloud/database-url`（`0600 pptist-cloud:pptist-cloud`）
- PostgreSQL 数据库：`pptist`，最小权限账号 `pptist_app`
- PostgreSQL 备份：`/var/backups/pptist-cloud/*.dump`
- 媒体凭据加密密钥：`/etc/pptist-cloud/media-credential-secret`（`0600 pptist-cloud:pptist-cloud`）

```bash
cd /srv/pptist
npm ci
npm run clean
npm run test:core
npm run test:player
npm run build
systemctl restart pptist-cloud.service
npm run verify:player-package
```

`npm run build` 会重新生成 `pptist-presentation-player` 压缩包、`SHA256SUMS.txt` 和使用指南。部署后可从 `/downloads/` 下载；不要手工复用 `release/` 或旧 `dist/` 中的历史产物。

Nginx 直接提供 `dist/public`，`/api/cloud/` 转发到 `127.0.0.1:3175`。`pptist-cloud.service` 与备份定时器均依赖 PostgreSQL 18；备份使用 `pg_dump` 自定义格式，生产目录不再保留 SQLite。项目不使用 `/opt`、`/www/wwwroot`、`releases` 或 `current`。

媒体上传通过 `/api/cloud/documents/{id}/media` 流式代理。生产环境必须设置：

```text
PPTIST_MEDIA_CREDENTIAL_SECRET_FILE=/etc/pptist-cloud/media-credential-secret
PPTIST_MEDIA_API_BASE=https://media.kjxs.site/api
PPTIST_MEDIA_PUBLIC_BASE=https://media.kjxs.site
```

对应的 Nginx `/api/cloud/` 代理需要允许目标视频大小，并关闭请求体缓冲：

```nginx
client_max_body_size 2g;
proxy_request_buffering off;
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
```
