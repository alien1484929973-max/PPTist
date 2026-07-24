# 云文稿功能

本 Fork 在 PPTist 编辑器之上增加了单用户云文稿能力：

- 用户登录与服务端 Session
- 新建、打开、重命名、复制、删除多个文稿
- 自动保存、手动保存和 `Ctrl / Command + S`
- SQLite 持久化
- 乐观锁版本号，避免不同浏览器页面静默覆盖文稿

## 数据模型

`presentations` 表中的每条记录对应一个 PPT 文稿。`content_json` 沿用 PPTist 的 JSON 导出结构，包含标题、画布、主题、页面、元素、动画和备注等数据。

数据库同时包含：

- `users`：用户和加盐后的 scrypt 密码哈希
- `sessions`：只保存 Session Token 的 SHA-256 哈希
- `presentations`：文稿内容、版本和时间信息

系统不提供注册接口。初始用户由服务端环境变量初始化，任何真实密码、数据库和 Session 都不能提交到 Git。

## 服务端配置

云文稿 API 使用 Node.js 22 内置 SQLite，默认仅监听 `127.0.0.1:3175`。生产环境应通过 HTTPS 反向代理 `/api/cloud/`。

环境变量说明见 [`backend/README.md`](../backend/README.md)。

## 当前资源边界

本地图片沿用上游方案，以 Data URL 保存在文稿 JSON 内，可以随文稿持久化。浏览器 Blob URL 形式的本地音频和视频仍是临时资源，后续应接入独立的文件上传与对象存储能力。
