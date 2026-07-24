# @pptist/presentation-player

PPTist 的框架无关浏览器播放器。它只使用普通 DOM、TypeScript 和 Web Animations API，运行时不依赖 Vue，也不需要 iframe。

## 当前能力

- 播放 PPTist 文稿中的文本、图片、形状、线条、表格、LaTeX、视频和音频。
- 读取新版 `animationTimeline`，并兼容旧版 `animations` 数据。
- 支持单击、与上一动画同时、上一动画之后、分组目标、段落/字符目标及运动路径。
- 提供自定义元素渲染器，可由业务项目补充图表或私有元素。
- 自动按容器缩放，支持键盘、前进、后退和指定页跳转。

## 构建与安装

仓库内构建：

```bash
npm run build --workspace @pptist/presentation-player
```

构建后可发布 `packages/presentation-player`，或先在业务项目中通过本地路径安装：

```bash
npm install /path/to/PPTist/packages/presentation-player
```

## 使用

```ts
import { createPresentationPlayer } from '@pptist/presentation-player'

const player = createPresentationPlayer(
  document.querySelector('#ppt')!,
  presentationDocument,
  {
    keyboard: true,
    clickToAdvance: true,
    fit: 'contain',
  },
)

await player.next()
player.goTo(3)
player.destroy()
```

容器必须具有可计算的宽高：

```css
#ppt {
  width: 100%;
  height: 100vh;
}
```

PPTist 文本内容是 HTML。播放器默认把编辑器生成的 HTML 视为可信内容；播放外部或用户上传的数据时，请通过 `sanitizeHtml` 传入项目自己的 HTML 清理函数。

## 自定义元素

```ts
createPresentationPlayer(container, documentData, {
  renderers: {
    chart({ element, container }) {
      const canvas = container.ownerDocument.createElement('canvas')
      // 使用任意图表库渲染 element
      return canvas
    },
  },
})
```

编辑器继续使用 Vue 不会影响此包：公共文稿数据和动画引擎位于框架边界之外，业务项目可以在 Vue、React、Svelte 或原生页面中调用相同 API。

本包是 PPTist 项目的一部分，遵循仓库的 AGPL-3.0 许可证；闭源商业使用前需确认相应许可要求。
