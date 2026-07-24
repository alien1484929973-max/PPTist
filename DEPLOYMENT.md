# PPTist 统一生产部署

- 唯一项目与 Git 仓库：`/srv/pptist`
- 前端源码：项目根目录的 `src/`、`public/` 和 `packages/`
- 后端源码：`/srv/pptist/backend`
- 统一生产目录：`/srv/pptist/dist`
- 前端生产文件：`/srv/pptist/dist/public`
- 后端生产文件：`/srv/pptist/dist/backend`
- 环境配置：`/etc/pptist-cloud.env`
- PostgreSQL URL：`/etc/pptist-cloud/database-url`（`0600 pptist-cloud:pptist-cloud`）
- PostgreSQL 数据库：`pptist`，最小权限账号 `pptist_app`
- PostgreSQL 备份：`/var/backups/pptist-cloud/*.dump`

```bash
cd /srv/pptist
npm ci
npm run test:core
npm run test:player
npm run build
systemctl restart pptist-cloud.service
npm run verify:player-package
```

Nginx 直接提供 `dist/public`，`/api/cloud/` 转发到 `127.0.0.1:3175`。`pptist-cloud.service` 与备份定时器均依赖 PostgreSQL 18；备份使用 `pg_dump` 自定义格式，生产目录不再保留 SQLite。项目不使用 `/opt`、`/www/wwwroot`、`releases` 或 `current`。
