# PPTist 播放器依赖使用指南

适用包：`pptist-presentation-player@0.2.1`。该包是框架无关的 ESM 浏览器播放器，可在 Vue、React、Svelte 或原生页面中播放 PPTist JSON 文稿，不需要 iframe，也不依赖 Vue runtime。

## 同源网页组件

同一网站内的业务组件使用 `type: 'widget'`，不需要把整页塞进 iframe。编辑器插入时填写友好名称，系统自动生成持久化的 `widgetId` 和 state key。消费项目先检查文稿需求，再用精确 `widgetId` 注册真正的框架组件；友好名称用于选择业务实现和人工识别：

```ts
const requirements = inspectPresentationRequirements(presentation)
const widgets = Object.fromEntries(requirements.requirements.map(requirement => [
  requirement.widgetId,
  definePresentationWidget({
    id: requirement.widgetId,
    render({ content, props, stateKey, onCleanup }) {
      const name = requirement.occurrences[0]?.name
      const app = createApp(widgetComponents[name || ''], { ...props, stateKey })
      app.mount(content)
      onCleanup(() => app.unmount())
    },
  }),
]))
const player = createPresentationPlayer(host, presentation, { widgets })
```

`inspectPresentationRequirements()` 按 `widgetId` 汇总需求；每个 occurrence 返回友好 `name`、页码、元素 ID、尺寸、滚动模式、滚动条策略、边界策略和动画出现时机。`widgetId` 是机器契约，`elementId` 是文稿内部实例位置，`name` 是面向人的业务标签。版本要求和延迟挂载等协议字段仍保留给外部生成器及高级接入。

`eager` 会在入场动画前挂载；新建组件固定使用该默认值。`onReveal` 仍可由外部文稿生成器设置，适合明确需要延迟创建的重型图表或 WebGL。

- `fit`：按 intrinsic size 居中等比缩放到元素矩形，不滚动。
- `internal`：组件占满固定视口，超出内容在内部滚动。
- `document`：内容形成长页面，仍被幻灯片元素矩形裁切；可用 `intrinsicHeight` 声明最小内容高度。
- `contain`：到滚动边界后仍拦截手势。
- `handoff`：到边界后将后续规范化手势交给播放器翻页。
- `hidden`：隐藏滚动条但保留滚轮、触摸和键盘滚动。
- `auto`：使用浏览器滚动条。

编辑器新建组件默认使用 `fit + contain + hidden`，内容受元素宽高限制，鼠标位于组件区域时不会触发播放器翻页。开启“允许长页面滚动”后改用 `document`，滚动条仍默认隐藏；只有进一步开启“滚动到边界后允许翻页”才使用 `handoff`。鼠标移出组件区域后，播放器照常接管滚轮翻页。

播放器会沿事件目标向上识别组件内部原生的 `overflow: auto/scroll` 容器；只要该容器仍可滚动，
滚轮就不会进入幻灯片翻页手势。

## 1. 获取和校验

Node.js 要求 `>=18`。统一构建会生成带版本号的离线包：

```text
/downloads/pptist-presentation-player-0.2.1.tgz
/downloads/SHA256SUMS.txt
```

下载后先校验 SHA-256，再安装本地文件：

```bash
npm install ./pptist-presentation-player-0.2.1.tgz
```

也可以直接使用完整官网下载地址安装：

```bash
npm install https://<PPTist官网域名>/downloads/pptist-presentation-player-0.2.1.tgz
```

若该版本已通过发布工作流推送到 npm，也可使用
`npm install pptist-presentation-player@0.2.1`。注册表是否可用取决于发布状态；离线包和
`SHA256SUMS.txt` 始终以当前部署的 `/downloads/` 为准。

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

## 3. 读取与验证 PPTX/JSON

播放器接受对象、JSON 文本，以及由本项目导出的 PPTX。本地文件、`Blob`、`Response` 或二进制数据使用统一读取入口：

```ts
import {
  analyzePresentationCompatibility,
  analyzePresentationResources,
  createPresentationPlayer,
  readPlayerDocument,
} from 'pptist-presentation-player'

const file = document.querySelector<HTMLInputElement>('#presentation-file')!.files![0]
const document = await readPlayerDocument(file)

const compatibility = analyzePresentationCompatibility(document)
const resources = analyzePresentationResources(document)
if (compatibility.blocking.length || !resources.portable) {
  throw new Error('文稿包含当前播放器无法安全交付的内容')
}

const player = createPresentationPlayer(container, document)
```

PPTX 在 PowerPoint 中仍按标准格式播放，网页组件显示 poster 或占位图；同一文件内部的 `pptist/presentation.json` 保存完整网页播放源。NPM 播放器提取该文稿后，`inspectPresentationRequirements()` 即可获得所有 `widgetId` 和 occurrence，再挂载真实网页组件。第三方普通 PPTX 不含此 part，不能被播放器直接当作 PPTist 文稿读取，需要先在编辑器中导入并重新导出。

播放器接受无 `schemaVersion` 的旧文稿、版本 1、版本 2、版本 3 和当前版本 4；未知未来版本会报错。未知元素属于阻断问题，未知导入转场会使用稳定的淡入回退。

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
