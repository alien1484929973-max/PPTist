# AGENTS.md

本文件是 AI 在本仓库工作的首要入口。详细架构和开发流程见
[`docs/development-guide.md`](docs/development-guide.md)。

## 开始工作前

1. 在仓库根目录检查 `git status --short --branch`，保留用户已有修改。
2. 阅读与任务相关的类型、实现、测试和文档，不要只根据组件名称推断行为。
3. 确认修改属于编辑器 `src/`、领域核心 `packages/presentation-core`、正式播放器
   `packages/presentation-player`、后端 `backend/` 中的哪一层。
4. 复杂修改先列出验证计划；不要修改生成目录来掩盖源码问题。

## 不可破坏的边界

- `packages/presentation-core` 不得依赖 Vue、Pinia、编辑器 store 或组件。
- `packages/presentation-player` 必须保持框架无关，不得导入根应用 `src/`。
- 正式文稿必须通过 `src/utils/presentation.ts` 序列化和迁移。
- 编辑器放映使用已构建的 `pptist-presentation-player` 包，不维护第二套播放规则。
- 当前文稿 schema 版本定义在 `packages/presentation-core/src/types.ts`。新增持久字段必须提供
  旧数据迁移，并同步播放器类型、校验、测试和文档。
- Morph 配置属于目标页；手工 `links` 优先，`excludedToElementIds` 禁止自动重连。
- 跨页复制保留 Morph 身份，同页复制创建新身份；使用
  `presentationMorphKeyForCopy()`，不要复制自制规则。
- 动画触发和步骤由 core 编译。首动画与转场、滚轮抢占等语义不得在 UI 层另行实现。
- 云端保存使用 revision 乐观锁；不得绕过冲突处理或把运行时密钥写入仓库。

## 文件与生成产物

以下目录/文件由构建生成，不要手工编辑：

- `.build/`
- `dist/`
- `release/`
- `packages/presentation-player/dist/`
- `*.tsbuildinfo`

`components.d.ts` 由组件自动导入工具维护。只有确实新增/删除自动注册组件并重新生成时才提交
其变化，不要手工填充无关声明。

真实 `backend/*.env`、数据库 URL、密码哈希、Session、媒体 API Key 和凭据密钥不得提交。
配置示例只写入 `backend/local.env.example`。

## 编辑要求

- 使用 TypeScript 和 Vue 3 Composition API 的现有风格。
- 遵循 2 空格、单引号、无分号；不要顺手格式化无关文件。
- 用户可撤销的内容修改应走 Pinia action，并按现有模式添加历史快照。
- 批量替换元素/页面 ID 时同步更新 group、动画 target、页面链接和 Morph 关联。
- 修改公共 API 时同步 `public.d.ts`、README、使用指南和消费者验证。
- 修改动画/Morph/PPTX 导入时优先在 core 中建立可测试的纯逻辑，再接 UI/DOM。
- 注释解释原因和边界，不重复代码表面行为。

## Windows 命令可靠性

- PowerShell 专用命令使用 PowerShell 7（`pwsh`）。若当前进程找不到 `pwsh`，先定位本机
  PowerShell 7 的完整安装路径，不要退回旧版 Windows PowerShell。
- 包含嵌套引号、JSON、正则表达式或多行逻辑时，写临时 `.ps1` 并通过
  `pwsh -NoLogo -NoProfile -File` 执行，不要继续嵌套 `-Command`。
- 读写文本时明确使用 UTF-8；文件修改使用补丁方式，避免意外改变全文件行尾。
- 搜索文件和文本优先使用 `rg --files` 与 `rg`。

## 验证矩阵

按实际修改范围执行，不要声称未运行的检查已经通过：

- core：`npm run test:core`、`npm run type-check`
- player：`npm run test:core`、`npm run test:player`、`npm run build:player`
- player 发布：再运行 `npm run verify:player-package`
- 普通编辑器：定向 ESLint、`npm run type-check`、`npm run build-only`
- 完整发布：`npm run clean` 后运行测试、包验证和 `npm run build`
- 文档：`npm run check:docs`、`git diff --check`，核对版本和命令

动画、Morph、布局或交互修改还要在真实浏览器中验证，不以类型检查代替视觉和快速连续输入测试。

## 文档同步

脚本、目录职责、数据结构、公共 API、动画/Morph 规则、后端配置或发布流程改变时，同一次
提交更新 `docs/development-guide.md` 及对应专题文档。文档入口见
[`docs/README.md`](docs/README.md)。
