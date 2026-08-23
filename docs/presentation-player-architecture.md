# 播放器架构与交付契约

## 结论

编辑器负责生产版本化 JSON，`pptist-presentation-player` 负责解释和执行 JSON。独立播放器
是当前正式播放实现；Vue 层只负责生命周期、状态同步和演讲者/观众 UI，不定义第二套元素、
动画、转场或 Morph 语义。

```text
Pinia / 外部 JSON
  -> serializePresentation / readPlayerDocument
  -> schemaVersion 校验
  -> compatibility + resource audit
  -> pptist-presentation-player/dist
  -> DOM / Web Animations / ECharts SVG / 原生媒体
```

## 包边界

- `packages/presentation-core`：无 UI 的动画、Morph、PPTX 元数据、schema 迁移和播放游标。
  不得导入 Vue、Pinia、编辑器 store 或组件。
- `packages/presentation-player`：对外发布包。公开 JSON 读取、校验、资源审计、兼容性审计、
  渲染和播放控制 API，不依赖 Vue，也不得导入根应用 `src/`。
- `src/views/Screen/PresentationPlayerCanvas.vue`：薄 Vue 适配器，只创建、重载和销毁播放器，
  并将 `PlayerState` 同步到现有演讲者/观众控制链路。
- `src/utils/presentation.ts`：编辑器文稿的唯一序列化与迁移入口。云保存、JSON 导出和编辑器
  播放不得各自手拼文稿结构。

根应用通过正式包名 `pptist-presentation-player` 使用工作区包的 `exports` 和已构建 `dist`。
Vite 不把它别名到播放器源码；`predev` 和正式 `build` 会先构建播放器，防止源码入口与实际
发布包表现分叉。

## JSON 契约

正式文稿包含 `schemaVersion`、画布尺寸、主题、幻灯片、最后播放页和元素/动画/转场数据。
当前版本为 4。播放器接受无版本旧文稿、版本 1、版本 2、版本 3 和版本 4；未知未来版本明确报错，避免旧
播放器静默错误播放。

## 网页组件边界

`packages/presentation-player` 负责 widget 的位置、动画外壳、挂载时机、滚动条和滚轮仲裁，不能依赖 Vue。编辑器收集友好名称并自动生成持久化的 `widgetId`；宿主通过 `inspectPresentationRequirements()` 找到所有实例后，应优先按精确 `widgetId` 注册真实 Vue、React、Canvas、WebGL 或原生 DOM 实现，友好名称只作为便捷回退。新建元素默认 `eager + fit + contain + hidden`；插入时可选择长页面滚动、显示滚动条以及边界后交给播放器翻页。版本和 `onReveal` 等高级协议字段供外部生成器和兼容旧文稿使用。

生命周期为 `prepare -> ready -> entering -> active -> exiting -> suspended/destroyed`。页面转场保留真实旧页面 DOM 到动画结束，不再使用 `cloneNode()`，因此 Canvas 像素、媒体状态、事件监听和框架实例在转场期间不会失活。

外部接入可直接传对象或 JSON 文本：

```ts
const player = createPresentationPlayer(container, jsonText, options)
```

File、Blob、Response、`ArrayBuffer` 和 `Uint8Array` 先交给 `readPlayerDocument()`。JSON 输入直接校验；由本项目导出的 PPTX 会从 `pptist/presentation.json` 提取完整网页播放文稿。普通 PowerPoint 继续读取标准幻灯片对象和原生动画，网页播放器则读取同一文件内的源文稿并恢复 widget。没有该嵌入 part 的任意第三方 PPTX 会明确报错，需要先经过编辑器导入和重新导出。

## 播放语义

动画步骤由 `presentation-core` 编译。On Click、With Previous、After Previous 以及首动画与
页面转场的关系只在公共 controller 中解释。点击、键盘、滚轮、演讲者视图和观众视图共享
相同的 `slideIndex` / `stepIndex` 游标。

Morph 对象关联也由 core 完成，手工 link、排除项、强制名称、稳定身份和评分规则供编辑器与
播放器共用。播放器负责对象变换、交叉淡化、文字光流和取消/抢占；完全未变化的匹配对象不
进入合成动画，避免重新栅格化闪烁。形状路径 Morph 只把真实变化的路径和几何送入动画，
相同的内嵌文字与计算样式保持静态，避免无效合成层引起字形抖动。

## 媒体链接契约

推荐资源为永久、公开可读的绝对 HTTPS URL。JSON 与包本身不保存远程媒体二进制，资源生命
周期属于媒体服务。

- 绝对 `http(s)`：可移植；生产环境推荐 HTTPS。
- 相对 URL：只有同时提供 JSON 原始位置 `baseUrl` / `resourceBaseUrl` 才可移植。
- `data:`：播放器支持且自包含，但体积大，不属于纯链接交付。
- `blob:`：仅当前页面会话有效，默认是 blocking。
- 其他协议、缺失的图片或音视频 `src`：blocking。

编辑器 JSON 导出和发布流程应运行 `analyzePresentationResources()`。审计只判断静态可移植性；
远程在线状态、鉴权过期、CORS、MIME、缓存和浏览器自动播放策略仍需在部署环境验证。

## 一致性保证

验证分为四级：

1. core 单元测试：动画、时间线、Morph、PPTX 元数据和 schema 迁移。
2. player 单元/DOM 测试：元素家族、切换、动画、文字 Morph、JSON、资源和媒体基址。
3. built-entry 验证：直接导入 `dist`，检查公共导出、声明、无 Vue/私有工作区运行时引用，
   并执行 DOM 冒烟。
4. isolated-consumer 验证：`npm pack` 后安装到临时空项目，通过正式包名导入并读取 JSON、
   审计资源和创建播放器。

发布前执行：

```bash
npm run test:core
npm run test:player
npm run verify:player-package
npm run type-check
npm run build
```

## 部署侧持续验证

- 真实 CDN/媒体服务的 URL 长期有效性、CORS、MIME、Range 请求和缓存头；
- Chrome、Edge、Safari 的音视频自动播放差异；
- 字体由宿主页面加载，缺失时按浏览器字体栈回退；
- 兼容矩阵之外的自定义元素必须提供 `renderers` 适配器；
- 外部不可信 JSON 必须配置 `sanitizeHtml` 和 `resolveResourceUrl` 白名单策略；
- 浏览器截图持续覆盖全部元素、动画、转场和 Morph，静态/DOM 测试不能替代像素级回归。

完整仓库开发边界见 [开发指南](./development-guide.md)。
