# PPTist 播放器依赖使用指南

适用包：`pptist-presentation-player@0.1.0-beta.2`。该包是框架无关的 ESM 浏览器播放器，可在 Vue、React、Svelte 或原生页面中播放 PPTist JSON 文稿，不需要 iframe，也不依赖 Vue runtime。

## 1. 获取和校验

Node.js 要求 `>=18`。当前 Beta 的正式交付物是 PPTist 官网离线包：

```text
/downloads/pptist-presentation-player-0.1.0-beta.2.tgz
/downloads/SHA256SUMS.txt
```

下载后先校验 SHA-256，再安装本地文件：

```bash
npm install ./pptist-presentation-player-0.1.0-beta.2.tgz
```

也可以直接使用完整官网下载地址安装：

```bash
npm install https://<PPTist官网域名>/downloads/pptist-presentation-player-0.1.0-beta.2.tgz
```

当前包尚未发布到 npm 官方注册表；注册表发布完成后才可使用 `npm install pptist-presentation-player@0.1.0-beta.2`。不要把包名安装失败误判为本地构建问题。

## 2. 最小接入

页面必须给播放器容器一个可计算的宽高：

```html
<div id="ppt"></div>
<style>
  #ppt { width: 100%; height: 100vh; }
</style>
```

创建播放器并在不再使用时销毁：

```ts
import { createPresentationPlayer } from 'pptist-presentation-player'

const container = document.querySelector<HTMLElement>('#ppt')!
const player = createPresentationPlayer(container, presentationDocument, {
  keyboard: true,
  clickToAdvance: true,
  fit: 'contain',
  onStateChange: state => {
    console.log(state.slideIndex, state.stepIndex)
  },
})

await player.next()
await player.previous()
player.goTo(3)
player.goToStep(3, 2)
player.resize()

// 页面或组件卸载时执行
player.destroy()
```

在 Vue/React/Svelte 中，组件只需要持有容器元素，并在卸载生命周期调用 `destroy()`。不要同时对同一容器创建多个播放器实例。

## 3. 读取与验证 JSON

播放器接受对象和 JSON 文本。本地文件、`Blob` 或 `Response` 使用统一读取入口：

```ts
import {
  analyzePresentationCompatibility,
  analyzePresentationResources,
  createPresentationPlayer,
  readPlayerDocument,
} from 'pptist-presentation-player'

const file = document.querySelector<HTMLInputElement>('#json-file')!.files![0]
const document = await readPlayerDocument(file)

const compatibility = analyzePresentationCompatibility(document)
const resources = analyzePresentationResources(document)
if (compatibility.blocking.length || !resources.portable) {
  throw new Error('文稿包含当前播放器无法安全交付的内容')
}

const player = createPresentationPlayer(container, document)
```

播放器接受无 `schemaVersion` 的旧文稿、版本 1 和当前版本 2；未知未来版本会报错。未知元素属于阻断问题，未知导入转场会使用稳定的淡入回退。

## 4. 媒体资源

- 生产文稿优先使用长期有效的绝对 HTTPS 地址。
- `blob:` 只在创建它的浏览器会话内有效，不能用于交付。
- 相对 URL 必须同时设置 `resourceBaseUrl`，否则换站点后无法解析。
- 图片、字体和音视频服务器需要返回正确的 CORS、MIME、缓存头；音视频还应支持 Range 请求。

```ts
const documentUrl = 'https://cdn.example.com/decks/demo/document.json'
const document = await readPlayerDocument(await fetch(documentUrl))
const report = analyzePresentationResources(document, { baseUrl: documentUrl })
const player = createPresentationPlayer(container, document, {
  resourceBaseUrl: documentUrl,
})
```

## 5. 不可信文稿

外部或用户上传的富文本必须由宿主清理，并限制可加载的 URL：

```ts
import DOMPurify from 'dompurify'

createPresentationPlayer(container, document, {
  sanitizeHtml: html => DOMPurify.sanitize(html),
  resolveResourceUrl(url, kind) {
    const parsed = new URL(url, location.href)
    if (!['https:', 'data:', 'blob:'].includes(parsed.protocol)) return null
    if (kind === 'link' && parsed.origin !== location.origin) return null
    return parsed.href
  },
})
```

## 6. 常见问题

- **画面空白或尺寸为 0**：确认容器及父级有明确宽高，布局变化后调用 `resize()`。
- **视频无法自动播放**：浏览器通常要求先有用户交互；这是平台限制，不是播放器故障。
- **字体不同**：字体由宿主页面用 CSS/`@font-face` 加载，缺失时会回退到浏览器字体栈。
- **媒体在编辑器可见、交付后失效**：检查是否使用了 `blob:`、相对地址或带短期鉴权参数的 URL。
- **自定义元素被阻止**：通过 `renderers` 提供适配器，并在发布前运行兼容性审计。

## 7. 项目维护与发布

在 PPTist 仓库根目录执行：

```bash
npm ci
npm run clean
npm run test:core
npm run test:player
npm run verify:player-package
npm run build
```

`npm run build` 会从干净的源码入口构建前后端、生成播放器 `.tgz` 与 `SHA256SUMS.txt`，并把它们和本指南放入 `dist/public/downloads/`。最终可部署目录是 `dist/`，其中 Nginx 静态根目录应指向 `dist/public/`。

许可证为 `AGPL-3.0-only`。通过网络提供修改版本时，请同时履行对应的源码开放义务。
