# Presentation player 兼容基准

正式画面迁移以 `packages/presentation-player/src/compatibility.ts` 的可执行矩阵为准；本文件说明验收方法，不复制一份可能失真的状态表。

## 使用入口与回退

- 编辑器放映菜单的“依赖播放器预览（Beta）”先使用统一的 `serializePresentation()` 生成版本化文稿，再从已安装工作区包的 `exports`/`dist` 调用 `createPresentationPlayer`。编辑器不再通过 Vite 别名直接消费播放器源码。
- URL `?renderer=player` 可直接启用同一入口，`?renderer=vue` 强制使用经典回退，并会传递给观众窗口。
- 普通全屏、演讲者画面、观众窗口和移动播放共用该开关。可执行矩阵无 unsupported 行且内置 schema 审计没有 blocking 项后，依赖播放器成为默认；经典 Vue 路径在过渡期继续保留。
- 如果依赖播放器在创建或热重载文稿时抛错，当前视图会自动卸载它并切回经典 Vue 画面；URL/localStorage 开关仍可用于人工强制回退。

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

`analyzePresentationCompatibility(document)` 会在正式切换前扫描真实文稿：未知元素是 blocking；未知导入转场使用可靠淡入回退，无法映射的旧元素动画落到确定终态，两者都会给出 warning。`analyzePresentationResources(document)` 另行阻止缺失资源、`blob:` 会话地址和没有基址的相对地址进入可交付 JSON。图表必须由包内 ECharts SVG 渲染器输出，不允许占位符通过门槛。

`verify:player-package` 包含三层验证：构建 `dist`；直接导入构建入口执行 JSON/DOM 冒烟；`npm pack` 后在临时空项目安装并按正式包名导入。只有三层均通过，工作区内表现才可视为外部依赖表现。

## 截图夹具范围

浏览器截图基准需覆盖：富文本与本地/缺失字体；所有图片裁剪和滤镜；形状渐变、图案和文字；直线/折线/曲线端点；合并及主题表格；八类图表；LaTeX；音视频；组合与链接；段落/字符动画；运动路径与擦除；每种页面切换及 Morph。截图误差必须人工确认是字体栅格差异还是布局回归后才能更新基准。
