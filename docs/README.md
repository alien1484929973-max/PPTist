# PPTist 工程文档导航

本目录保存当前 Fork 的工程文档。第一次参与开发时，请先阅读
[开发指南](./development-guide.md)；AI 工具还应先读取仓库根目录的
[`AGENTS.md`](../AGENTS.md)。

## 推荐阅读顺序

| 读者或任务 | 文档 |
| --- | --- |
| 新开发者上手 | [开发指南](./development-guide.md) |
| AI 阅读和修改仓库 | [`AGENTS.md`](../AGENTS.md) → [开发指南](./development-guide.md) |
| 播放器架构或边界调整 | [播放器架构](./presentation-player-architecture.md) |
| 播放兼容性验收 | [播放器兼容基准](./presentation-player-compatibility.md) |
| 外部项目接入播放器 | [播放器依赖使用指南](./presentation-player-usage.md) |
| 生产部署 | [`DEPLOYMENT.md`](../DEPLOYMENT.md) 和 [`backend/README.md`](../backend/README.md) |
| PPTist 页面/元素 JSON | [`doc/AI_PPT_SCHEMA.md`](../doc/AI_PPT_SCHEMA.md) |
| 扩展新元素 | [`doc/CustomElement.md`](../doc/CustomElement.md) |
| 画布原理 | [`doc/Canvas.md`](../doc/Canvas.md) |
| AIPPT 模板 | [`doc/AIPPT.md`](../doc/AIPPT.md) |

## 文档分区

- `docs/`：当前 Fork 的架构、播放器、开发、交付文档。
- `doc/`：上游 PPTist 的专题说明和兼容入口。旧链接较多，暂不移动；其中涉及
  当前工程状态的内容必须以本目录和实际代码为准。
- `README_zh.md` / `README.md`：项目定位和功能入口，不承担详细架构说明。
- `packages/*/README.md`：对应工作区包的使用边界。

## 事实来源与维护规则

文档和代码不一致时，按以下顺序确认真实行为：

1. `package.json`、工作流文件和实际可执行测试；
2. `packages/presentation-core/src/types.ts` 与 `src/types/slides.ts`；
3. `src/utils/presentation.ts`、播放器和后端实现；
4. 本目录中的说明文档；
5. `doc/` 中的历史说明。

修改脚本、数据结构、播放器公共 API、Morph/动画语义、后端环境变量或发布流程时，
必须在同一次提交中更新对应文档。不要在多份文档里复制易变化的完整类型或兼容矩阵；
优先链接到代码中的单一事实来源。
