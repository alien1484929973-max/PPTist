# pptist-presentation-player

PPTist 的框架无关浏览器播放器。运行时只使用普通 DOM、TypeScript、Web Animations API 和内置的 ECharts SVG 图表适配层，不依赖 Vue，也不需要 iframe。

当前版本：`0.1.0-beta.1`。Beta 在 PPTist 自身的桌面放映、演讲者视图、观众窗口和移动播放路径中实际调用；稳定版会在截图/浏览器基准持续通过后发布为 `0.1.0`。

## 安装

```bash
npm install pptist-presentation-player
```

在仓库内也可以安装 `npm pack` 生成的 tarball：

```bash
npm install ./pptist-presentation-player-0.1.0-beta.1.tgz
```

## 使用

```ts
import { createPresentationPlayer } from 'pptist-presentation-player'

const player = createPresentationPlayer(
  document.querySelector<HTMLElement>('#ppt')!,
  presentationDocument,
  {
    keyboard: true,
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

内置渲染覆盖文本富文本与字体、全部图片裁剪/滤镜/蒙版/翻转/阴影、形状、线条、表格、八类图表、LaTeX、视频、音频、组合及链接。动画读取新版 `animationTimeline` 并兼容旧版 `animations`，支持单击/同时/之后触发、段落和字符目标、运动路径、擦除、页面切换及 Morph。

未知元素会由兼容性审计标为 blocking，也可以通过 `renderers` 提供正式适配器：

```ts
createPresentationPlayer(container, document, {
  renderers: {
    privateWidget({ element, container }) {
      const node = container.ownerDocument.createElement('div')
      node.textContent = String(element.name || '')
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
npm pack --dry-run
```

包提供 ESM 产物和完整 TypeScript 声明。ECharts 与 tinycolor2 是普通运行时依赖，发布产物不包含 Vue runtime。版本遵循 SemVer：Beta 期间允许在发行说明中标注的 schema/API 调整；`0.1.0` 后破坏性公共 API 变更只进入新的次版本/主版本。

本包是 PPTist 项目的一部分，使用 `AGPL-3.0-only` 许可证。通过网络向用户提供修改版本时，请履行 AGPL 对应源码义务；闭源商业集成前应自行确认许可要求。
