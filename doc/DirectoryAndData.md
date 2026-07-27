# 项目目录与数据结构

> 本页保留原有链接，提供简要入口。当前完整目录、架构、开发和验证说明见
> [`docs/development-guide.md`](../docs/development-guide.md)。

## 主要目录

```text
├── src/                         # Vue 编辑器、移动端、云文稿 UI 和播放适配层
│   ├── assets/                  # 字体、图标和全局样式
│   ├── components/              # 与业务弱耦合的通用 Vue 组件
│   ├── configs/                 # 动画、形状、字体、快捷键等静态配置
│   ├── hooks/                   # 编辑、导入、导出等跨组件操作
│   ├── services/                # 云文稿和媒体 API 客户端
│   ├── store/                   # Pinia 编辑状态、云文稿和撤销重做
│   ├── types/                   # 编辑器业务类型
│   ├── utils/                   # 文稿、元素、富文本等通用逻辑
│   └── views/                   # Editor、Screen、Mobile、Cloud 和元素组件
├── packages/
│   ├── presentation-core/       # 无 UI 的动画、Morph、PPTX、schema 和播放游标
│   └── presentation-player/     # 可发布的框架无关 DOM 播放器
├── backend/                     # Node.js + PostgreSQL 云文稿 API 和媒体代理
├── scripts/                     # 清理、迁移、打包和统一产物装配
├── doc/                         # 上游专题文档和兼容入口
├── docs/                        # 当前 Fork 的工程与播放器文档
└── public/                      # 前端静态资源
```

`.build/`、`dist/`、`release/`、`packages/presentation-player/dist/` 和 `*.tsbuildinfo`
均为生成产物，不是源码。

## 编辑状态

幻灯片编辑状态主要位于 `src/store/slides.ts`：

- `title`：标题；
- `slides`：页面，以及页面中的元素、背景、动画、转场、备注和批注；
- `theme`：主题颜色、字体、默认边框和阴影；
- `slideIndex`：当前页；
- `viewportSize`：逻辑画布宽度，默认 1000；
- `viewportRatio`：高宽比，默认 0.5625；
- `templates`：编辑器模板，不写入正式文稿。

页面和元素完整编辑类型见 `src/types/slides.ts`。框架无关的 schema、动画、Morph 和 PPTX
类型见 `packages/presentation-core/src/types.ts`。

## 正式文稿 JSON

Pinia 状态不是数据库或播放器的直接契约。`src/utils/presentation.ts` 是唯一正式入口：

- `serializePresentation()` 生成版本化、无响应式 Proxy 的 JSON；
- `migratePresentation()` 把旧文稿迁移到当前 schema；
- `applyPresentation()` 将文稿应用回编辑状态。

当前文稿 `schemaVersion` 为 2。云端将正式 JSON 存入 PostgreSQL JSONB；独立播放器读取同一
结构。新增持久化字段时，必须同步默认值、迁移、播放器类型/校验、导入导出、测试和文档。

## 画布坐标

默认逻辑画布为 `1000 × 562.5`。元素的 `left`、`top`、`width`、`height` 都使用逻辑坐标。
编辑器画布、缩略图和播放器通过整体比例显示相同数据，不应把真实屏幕像素写回文稿。

更多原理见 [`Canvas.md`](./Canvas.md)，面向 AI 直接生成页面数据的结构见
[`AI_PPT_SCHEMA.md`](./AI_PPT_SCHEMA.md)。
