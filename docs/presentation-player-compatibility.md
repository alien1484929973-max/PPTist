# Presentation player 兼容基准

正式画面以 `packages/presentation-player/src/compatibility.ts` 的可执行矩阵为准；本文件说明
验收方法，不复制一份容易失真的状态表。

## 使用入口

- 编辑器放映通过 `src/views/Screen/PresentationPlayerCanvas.vue` 使用统一的
  `serializePresentation()` 生成版本化文稿，再从工作区安装包的 `exports` / `dist` 调用
  `createPresentationPlayer()`。
- 普通全屏、演讲者画面、观众窗口和移动播放应共享同一播放器语义和状态游标。
- Vue 层只适配生命周期和状态。如果播放器创建或重载失败，应显示明确错误，不得静默切换到
  一套未经同等验证的播放实现。

## 自动化门槛

每次兼容性改动至少运行：

```bash
npm run test:core
npm run test:player
NODE_OPTIONS=--max-old-space-size=1024 npm run type-check
npm run build:player
npm run verify:player-package
NODE_OPTIONS=--max-old-space-size=1024 npm run build-only
```

`analyzePresentationCompatibility(document)` 扫描真实文稿：未知元素是 blocking；未知导入
转场使用可靠淡入回退，无法映射的旧元素动画落到确定终态，两者给出 warning。
`analyzePresentationResources(document)` 另行阻止缺失资源、`blob:` 会话地址和没有基址的
相对地址进入可交付 JSON。图表必须由包内 ECharts SVG 渲染器输出，不允许占位符通过门槛。

`verify:player-package` 包含三层验证：构建 `dist`；直接导入构建入口执行 JSON/DOM 冒烟；
`npm pack` 后在临时空项目安装并按正式包名导入。三层都通过，工作区表现才可视为外部依赖
表现。

## 截图与交互基准

浏览器基准至少覆盖：

- 富文本、本地/缺失字体、文字颜色/字号/内容变化和词/字符级 Morph；
- 所有图片裁剪和滤镜；
- 形状渐变、图案和文字；
- 直线、折线、曲线和端点；
- 合并及主题表格、八类图表、LaTeX；
- 音频、视频、组合、链接；
- 段落/字符动画、运动路径、擦除、延迟、重复和自动反向；
- 每种页面切换、手工/自动 Morph 关联、不变对象；
- 点击、键盘、滚轮、快速连续输入、演讲者与观众同步。

截图误差必须人工确认是字体栅格差异还是布局回归后才能更新基准。动画还应检查中间帧、
取消时终态和下一步游标，不能只对比开始/结束静态图。
