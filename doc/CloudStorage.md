# 云文稿功能

> 本页保留原有链接，内容已按当前 Fork 更新。完整工程说明见
> [`docs/development-guide.md`](../docs/development-guide.md)，生产配置见
> [`DEPLOYMENT.md`](../DEPLOYMENT.md)。

当前云文稿能力包括：

- 单用户登录和服务端 Cookie Session；
- 新建、打开、重命名、复制、软删除多个文稿；
- 明确的“保存”操作和 `Ctrl / Command + S`；
- PostgreSQL JSONB 持久化；
- revision 乐观锁，避免多个浏览器页面静默覆盖；
- 媒体 API Key 加密存储和大文件流式上传代理。

## 数据模型

PostgreSQL 结构由 `backend/database.mjs` 在服务启动时创建或补齐：

- `users`：用户名、scrypt 密码哈希和禁用状态；
- `sessions`：只保存随机 Session Token 的 SHA-256 哈希和过期时间；
- `presentations`：标题、文稿 JSONB、页面数、revision、媒体前缀和软删除时间；
- `user_media_credentials`：AES-256-GCM 加密后的媒体 API Key。

`presentations.content_json` 使用正式 PPTist 文稿结构，包含 `schemaVersion`、标题、画布、
主题、页面、元素、动画、转场和备注。文稿的唯一序列化/迁移入口是
`src/utils/presentation.ts`。

保存时客户端携带当前 `revision`。服务端只更新 revision 仍一致的记录并将其加一；不一致时
返回 HTTP 409，客户端进入冲突状态，必须重新加载或由用户处理，不能自动覆盖。

## 服务端配置

云文稿 API 默认监听 `127.0.0.1:3175`，开发环境由 Vite 将 `/api/cloud` 代理到该端口。
本地配置模板见 [`backend/local.env.example`](../backend/local.env.example)，环境变量完整说明见
[`backend/README.md`](../backend/README.md)。后端不会自动加载 `.env`，启动前需要把配置导入
当前进程环境。

生产环境通过 HTTPS 反向代理 `/api/cloud/`，数据库连接和所有凭据文件放在仓库外，并使用
最小权限账号。当前生产部署使用 PostgreSQL，不再运行 SQLite；
`scripts/migrate-sqlite-to-postgres.mjs` 只用于一次性迁移历史数据。

## 媒体资源边界

图片、音频和视频可能先以 `data:` 或浏览器 `blob:` 形式进入编辑状态。保存前，前端媒体服务
会将待持久化内容上传到 `/api/cloud/documents/{id}/media`，后端再流式转发到外部媒体服务，
并把文稿内资源替换为长期公开 URL。

- `blob:` 仅当前浏览器会话有效，不能作为可交付文稿资源；
- 相对 URL 需要明确的文稿基址；
- 生产资源优先使用长期有效的 HTTPS URL；
- 远端服务必须正确配置 CORS、MIME、缓存，音视频还应支持 Range 请求。

浏览器不会收到服务端保存的媒体 API Key 明文。后端只保存加密值；用于加密的凭据密钥丢失
后，需要用户重新绑定 API Key。

## 安全约束

不得向 Git 提交真实的：

- `backend/local.env` 或其他 `backend/*.env`；
- PostgreSQL URL、管理员密码哈希、Session Token；
- 媒体 API Key、媒体凭据加密密钥；
- 数据库文件、备份或运行时上传目录。

仓库中的 `backend/local.env.example` 只能包含无效占位值。
