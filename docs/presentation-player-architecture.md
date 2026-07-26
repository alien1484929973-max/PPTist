# 播放依赖架构与交付契约

## 结论

播放器采用“编辑器负责生产版本化 JSON，播放器包负责解释和执行 JSON”的边界。`pptist-presentation-player` 是唯一正式播放实现；Vue 画面只保留为迁移期回退，不再作为第二份行为规范。

编辑器与外部使用者必须经过同一条链路：

```text
Pinia / 外部 JSON
  -> serializePresentation / readPlayerDocument
  -> schemaVersion 校验
  -> compatibility + resource audit
  -> pptist-presentation-player/dist
  -> DOM / Web Animations / ECharts SVG / 原生媒体
```

## 包边界

- `packages/presentation-core`：无 UI 的动画、Morph、PPTX 元数据和 schema 迁移核心。当前为工作区私有包，并在播放器构建时打入 `dist`。
- `packages/presentation-player`：对外发布包。公开 JSON 读取、校验、资源审计、兼容性审计、渲染和播放控制 API，不依赖 Vue。
- `src/views/Screen/PresentationPlayerCanvas.vue`：很薄的 Vue 生命周期适配器，只负责创建、重载和销毁播放器，以及把状态同步回现有演讲者/观众控制链路。
- `src/utils/presentation.ts`：编辑器文稿的唯一序列化与迁移入口。云保存、JSON 导出和编辑器播放不得各自手拼文稿结构。

## JSON 契约

正式导出的文稿包含 `schemaVersion`、画布尺寸、主题、幻灯片、最后播放页和元素/动画/转场数据。播放器接受无版本旧文稿、版本 1 和当前版本 2；未来版本明确报错，避免旧播放器静默错误播放。

外部接入可直接传对象或 JSON 文本：

```ts
const player = createPresentationPlayer(container, jsonText, options)
```

File、Blob 和 Response 先交给 `readPlayerDocument()`。该函数和编辑器 JSON 导入共用，因此编辑器能导入的正式 JSON与外部依赖能读取的 JSON 使用同一个 schema gate。

## 媒体链接契约

推荐资源为永久、公开可读的绝对 HTTPS URL。JSON 与包本身不保存媒体二进制，资源生命周期属于媒体服务。

- 绝对 `http(s)`：可移植；生产环境推荐 HTTPS。
- 相对 URL：只有同时提供 JSON 原始位置 `baseUrl`/播放器 `resourceBaseUrl` 才可移植。
- `data:`：播放器支持且自包含，但不属于纯链接交付。
- `blob:`：仅当前页面会话有效，默认是 blocking。
- 其他协议、缺失的图片或音视频 `src`：blocking。

编辑器 JSON 导出会运行 `analyzePresentationResources()`，blocking 问题必须先通过媒体上传或 URL 修复解决。审计只判断静态可移植性；远程在线状态、鉴权过期、CORS、MIME、缓存和浏览器自动播放策略仍需在部署环境验证。

## 一致性保证

仓库根应用使用正式包名 `pptist-presentation-player`，Vite 不再把它替换为 `packages/presentation-player/src`。`predev` 和正式 `build` 都先生成播放器 `dist`，所以编辑器实际执行的文件与 tarball 内文件一致。

验证分为四级：

1. core 单元测试：动画、时间线、Morph、PPTX 元数据和 schema 迁移。
2. player 单元/DOM 测试：元素家族、切换、动画、JSON、资源解析和媒体基址。
3. built-entry 验证：直接导入 `dist`，检查公共导出、声明、无 Vue/私有工作区运行时引用，并执行 DOM 冒烟。
4. isolated-consumer 验证：`npm pack` 后安装到临时空项目，通过正式包名导入并读取 JSON/审计媒体。

发布前执行：

```bash
npm run test:core
npm run test:player
npm run verify:player-package
npm run type-check
npm run build
```

## 仍需部署侧持续验证的事项

- 真实 CDN/媒体服务的 URL 长期有效性、CORS、MIME、Range 请求和缓存头。
- Chrome/Edge/Safari 的音视频自动播放差异。
- 字体由宿主页面加载；缺失字体会按浏览器字体栈回退。
- 兼容性矩阵之外的自定义元素必须提供 `renderers` 适配器。
- 外部不可信 JSON 必须配置 `sanitizeHtml` 和 `resolveResourceUrl` 白名单策略。
- 截图基准仍应持续覆盖全部元素、动画、转场和 Morph；静态/DOM 测试不能替代像素级回归。
