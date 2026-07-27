# PPTist Cloud API

这是当前 Fork 的单用户云文稿服务，使用 Node.js HTTP API 和 PostgreSQL，提供登录、文稿
CRUD、revision 冲突保护、媒体凭据管理和媒体流式上传代理。

完整开发流程见 [`docs/development-guide.md`](../docs/development-guide.md)，生产部署见
[`DEPLOYMENT.md`](../DEPLOYMENT.md)。

## 本地启动

1. 准备 PostgreSQL 数据库和具有建表权限的本地账号。
2. 将 [`local.env.example`](./local.env.example) 复制为被 Git 忽略的 `local.env`，替换所有
   占位值。
3. 把 `local.env` 导入当前终端环境；后端不会自动读取 `.env`。
4. 在仓库根目录运行 `npm run cloud-server`。
5. 请求 `GET http://127.0.0.1:3175/api/cloud/health`，应返回 PostgreSQL healthy 状态。

服务启动时会创建或补齐表结构。首次启动且用户表为空时，必须提供有效的
`PPTIST_ADMIN_PASSWORD_HASH`。

## 环境变量

### HTTP 与登录

- `PPTIST_CLOUD_HOST`：监听地址，默认 `127.0.0.1`。
- `PPTIST_CLOUD_PORT`：监听端口，默认 `3175`。
- `PPTIST_ALLOWED_ORIGIN`：允许执行写请求的前端 Origin；生产环境必须使用公开 HTTPS
  Origin，本地值通常为 `http://127.0.0.1:5173`。
- `PPTIST_ADMIN_USERNAME`：初始用户名，默认 `alien`。
- `PPTIST_ADMIN_PASSWORD_HASH`：`scrypt$salt$key` 格式密码哈希；用户表为空时必填。
- `PPTIST_SESSION_DAYS`：Session 有效天数，默认 7。
- `PPTIST_MAX_BODY_BYTES`：普通 JSON 请求体上限，默认 50 MiB。媒体上传使用独立流式路径。

### PostgreSQL

- `PPTIST_DATABASE_URL`：直接提供 PostgreSQL URL；存在时优先使用。
- `PPTIST_DATABASE_URL_FILE`：保存 PostgreSQL URL 的文件，生产默认
  `/etc/pptist-cloud/database-url`。
- `PPTIST_DB_POOL_MAX`：连接池上限，默认 5，代码限制为 1 至 10。

生产环境优先使用只有服务账号可读、权限为 `0600` 的 URL 文件。升级历史 SQLite 部署时，
仅一次性运行 `scripts/migrate-sqlite-to-postgres.mjs`；当前服务不再以 SQLite 运行。

### 媒体服务

- `PPTIST_MEDIA_CREDENTIAL_SECRET`：直接提供至少 32 个字符的媒体凭据加密密钥。
- `PPTIST_MEDIA_CREDENTIAL_SECRET_FILE`：从文件读取上述密钥，生产默认
  `/etc/pptist-cloud/media-credential-secret`。
- `PPTIST_MEDIA_API_BASE`：带鉴权的媒体 API 基址，例如 `https://media.example.com/api`。
- `PPTIST_MEDIA_PUBLIC_BASE`：媒体公开访问源，例如 `https://media.example.com`。
- `PPTIST_MEDIA_MAX_IMAGE_BYTES`、`PPTIST_MEDIA_MAX_SVG_BYTES`、
  `PPTIST_MEDIA_MAX_AUDIO_BYTES`、`PPTIST_MEDIA_MAX_VIDEO_BYTES`：各媒体类型上传上限。

API Key 由登录用户在文稿管理器中绑定。浏览器不会收到已保存的明文；服务端验证后使用
AES-256-GCM 加密，只把密文写入 PostgreSQL。凭据密钥丢失后，需要重新绑定 API Key。

## 数据与并发

- `users` 保存 scrypt 密码哈希；
- `sessions` 只保存 Session Token 的 SHA-256 哈希；
- `presentations.content_json` 保存正式文稿 JSONB；
- `presentations.revision` 实现乐观锁，旧 revision 保存返回 HTTP 409；
- 删除文稿会写入 `deleted_at`，属于软删除；
- `user_media_credentials` 保存加密的媒体 API Key。

## 主要 API

- `GET /api/cloud/health`
- `POST /api/cloud/auth/login`
- `POST /api/cloud/auth/logout`
- `GET /api/cloud/auth/me`
- `GET|PUT|DELETE /api/cloud/media/settings`
- `GET|POST /api/cloud/documents`
- `GET|PUT|PATCH|DELETE /api/cloud/documents/{id}`
- `POST /api/cloud/documents/{id}/duplicate`
- `PUT /api/cloud/documents/{id}/media`

写请求会校验 `Origin`。生产反向代理应保留正确的 Origin、客户端 IP，并为媒体上传设置合适
的请求体上限、关闭请求体缓冲、增加读写超时。

## 安全约束

不得提交数据库 URL、真实密码哈希、Session、媒体 API Key、凭据密钥、数据库备份或运行时
数据。真实 `backend/*.env`、`backend/data/` 和 `backend/uploads/` 已被 `.gitignore` 排除；
示例配置只允许无效占位值。
