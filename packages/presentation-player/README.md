# pptist-presentation-player

PPTist 的框架无关浏览器播放器。运行时只使用普通 DOM、TypeScript、Web Animations API 和内置的 ECharts SVG 图表适配层，不依赖 Vue，也不需要 iframe。

当前版本：`0.1.0`。该稳定版在 PPTist 自身的桌面放映、演讲者视图、观众窗口和移动播放路径中实际调用；编辑器也从包的 `exports` 加载构建后的 `dist`，不再使用旧 Vue 播放回退。

## 安装

从 npm 官方注册表安装：

```bash
npm install pptist-presentation-player@0.1.0
```

也可以从官网下载离线包，校验 `SHA256SUMS.txt` 后从本地安装：

```bash
npm install ./pptist-presentation-player-0.1.0.tgz
```

## 使用

```ts
import { createPresentationPlayer } from 'pptist-presentation-player'

const player = createPresentationPlayer(
  document.querySelector<HTMLElement>('#ppt')!,
  presentationDocument,
  {
    keyboard: true,
    keyboardScope: 'document',
    wheel: true,
    clickToAdvance: true,
    fit: 'contain',
    onStateChange: state => console.log(state.slideIndex, state.stepIndex),
  },
)

await player.next()       // 先播放当前动画步骤，再翻页
await player.previous()
player.goTo(3)
player.goToStep(3, 2)     // 恢复观众窗口/持久化的动画游标
player.resize()
player.destroy()
```

也可以直接传入 JSON 文本；选择本地 JSON 文件时使用同一个异步读取入口：

```ts
import {
  createPresentationPlayer,
  readPlayerDocument,
} from 'pptist-presentation-player'

const playerFromText = createPresentationPlayer(container, jsonText)

const file = document.querySelector<HTMLInputElement>('#json-file')!.files![0]
const documentFromFile = await readPlayerDocument(file)
const playerFromFile = createPresentationPlayer(container, documentFromFile)
```

容器必须有可计算的宽高：

```css
#ppt { width: 100%; height: 100vh; }
```

相同 API 可直接在 Vue、React、Svelte 和原生页面中使用。框架组件只负责持有 DOM 容器并在卸载时调用 `destroy()`。

## 文稿和兼容性

播放器直接读取 PPTist 文稿 schema，接受无 `schemaVersion` 的旧数据、版本 1 和当前版本 2。未来未知版本会明确报错，避免静默错误渲染。可在加载前调用：

```ts
import {
  assertPlayerDocument,
  analyzePresentationCompatibility,
} from 'pptist-presentation-player'

const document = assertPlayerDocument(JSON.parse(source))
const report = analyzePresentationCompatibility(document)
```

## 链接媒体与可移植性

JSON 只保存媒体地址，不会把远程文件打入 npm 包。交付 JSON 前可执行资源审计：

```ts
import {
  analyzePresentationResources,
  parsePlayerDocument,
} from 'pptist-presentation-player'

const document = parsePlayerDocument(jsonText)
const resources = analyzePresentationResources(document)
if (!resources.portable) {
  console.error(resources.issues)
}
```

- 推荐图片、音频、视频、poster、背景和图案使用长期有效的绝对 HTTPS 地址。
- `blob:` 只在创建它的页面会话内有效，默认被标记为 blocking，不能作为可交付 JSON 的依赖。
- `data:` 可以播放且自包含；若业务要求“全部为链接”，审计时传入 `{ allowDataUrls: false }` 将其标记为 blocking。
- 相对地址在另一个站点没有稳定含义。若 JSON 与媒体保持固定相对目录，播放器传入 `resourceBaseUrl`，审计传入相同的 `baseUrl`：

```ts
const baseUrl = 'https://cdn.example.com/decks/demo/document.json'
const report = analyzePresentationResources(document, { baseUrl })
const player = createPresentationPlayer(container, document, { resourceBaseUrl: baseUrl })
```

静态审计验证地址形态和必填字段，不会跨域探测远程服务是否在线。资源服务器仍需保证 URL 长期有效，并为音视频返回正确 MIME；需要截图、导出或 canvas 读取的图片还需正确 CORS 响应头。

内置渲染覆盖文本富文本与字体、全部图片裁剪/滤镜/蒙版/翻转/阴影、形状、线条、表格、八类图表、LaTeX、视频、音频、组合及链接。动画读取新版 `animationTimeline` 并兼容旧版 `animations`，支持单击/同时/之后触发、段落和字符目标、运动路径、擦除、页面切换及 Morph。

未知元素会由兼容性审计标为 blocking，也可以通过 `renderers` 提供正式适配器：

```ts
createPresentationPlayer(container, document, {
  renderers: {
    privateWidget({ element, container }) {
      const node = container.ownerDocument.createElement('div')
      node.textContent = String(element.customData?.title || '')
      return node
    },
  },
})
```

## 不可信内容与外部资源

PPTist 富文本是 HTML。默认行为用于可信的编辑器自产数据；外部或用户上传文稿必须传入 HTML 清理函数，例如 DOMPurify：

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

`sanitizeHtml` 也应限制富文本内的图片、样式和链接；`resolveResourceUrl` 会另外检查页面背景、图片、图案、音视频、poster 和元素链接，返回 `null` 即拒绝加载。

字体由宿主页面通过 CSS/`@font-face` 加载。缺失字体按浏览器字体栈回退；远程字体、图片和媒体需要资源服务器提供正确的 CORS、MIME 和缓存头。浏览器的自动播放策略可能阻止未经过用户操作的音视频播放，这是正常的平台限制。

## 构建、类型和许可

```bash
npm run test
npm run build
npm run verify
npm run verify:consumer
npm pack --dry-run
```

`verify` 直接导入 `dist`，用 JSON 和 DOM 完成构建产物冒烟；`verify:consumer` 生成 tarball、安装到临时空项目并从包名导入，避免工作区路径掩盖缺文件或错误 `exports`。包提供 ESM 产物和完整 TypeScript 声明。ECharts 与 tinycolor2 是普通运行时依赖，发布产物不包含 Vue runtime。版本遵循 SemVer：`0.1.0` 后破坏性公共 API 变更只进入新的次版本/主版本。

本包是 PPTist 项目的一部分，使用 `AGPL-3.0-only` 许可证。通过网络向用户提供修改版本时，请履行 AGPL 对应源码义务；闭源商业集成前应自行确认许可要求。
