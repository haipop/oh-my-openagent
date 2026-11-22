# 功能分支需求与验收

本次改造包含四项要求：删除 Pi/Senpi 独立版、只支持 OpenCode V2 原生插件、保障 DSH 官方插件 `include:mnemon` 兼容、重写根 README。以下是验收条件，不能代替实机记录。

## 分支约定

- `origin/dev` 只同步上游 `dev`，不承载 fork 专有改动。
- `origin/feat/deepseek-harness` 承载 fork 定制，包括 DeepSeek Harness（DSH）和本轮新增的 OpenCode V2 插件需求。本文以 `ebfee574e009ea5363c4fe5333437725ded53195` 为基线；从上游吸收更新时，先同步 `dev`，再在功能分支验证整合结果。
- [适配器说明](./AGENTS.md) 记录实现与安装方法；[原路线图](./ROADMAP.md) 提供历史背景，不代表本轮承诺。

## DSH 现有能力与边界

| 能力 | 基线行为 |
| --- | --- |
| 安装 | 将 `packages/omo-dsh` 作为 Host bundle 加入指定 DSH profile；未发布独立 npm 包。 |
| 工作模式 | 支持 `ultrawork`、`team mode`、`hyperplan`（含 `hpp`），以及 `hyperplan + ultrawork` 组合。 |
| 技能和角色 | 15 个移植技能、2 个模式技能；9 个 OmO 角色预设。Web profile 可选预设，默认 headless profile 没有预设注册表。 |
| 规则和诊断 | 注入 `.omo/rules`；`write` / `edit` 执行后可附加注释告警；`omo_status` 只读报告生效配置与运行状态。 |
| 配置和模型 | 运行配置优先级为插件配置项 > 项目 `dsh` 配置 > 用户 `dsh` 配置；技能库开关只在插件配置项生效。模型由 DSH 会话选择，当前适配器不做按角色选模或模型回退。 |

## DSH 已有验证

上一轮在隔离环境使用真实 DSH `0.2.2-rc.5`：Web roster 显示 9 个 OmO 预设，实际选择验证覆盖 Sisyphus 和 Atlas；headless 会话日志验证了三轮中的模式与规则注入行为。聚焦测试为 132 通过、0 失败。那轮未调用模型、未运行全仓测试，也没有验证真实模型驱动的工具执行或团队任务端到端交付。

## DSH 官方插件兼容：`include:mnemon`

- **实机复现：** 已登录的 DSH Desktop `0.2.2-rc.5`、`desktop` profile 安装了 `dsh-mnemon@0.5.32`；「设置 → 内置插件 → 全局插件」显示 `include:mnemon` 已启用但启动失败。相同版本的隔离 Desktop 未装 OmO 也复现，宿主日志定位到 `MnemonLifecycle.start` 调用 `ctx.agents.roots()` 时报错。隔离 Desktop 启动已验证 `0.5.50` 与 OmO 共存；这不等于真实 profile 中已有记忆已通过升级验收。
- **已确认需求：** 安装和启用 `omo-dsh` 后，已有 `include:mnemon` 应保留并正常工作；不能以移除或禁用官方插件作为解决办法。
- **验收：** 记录受影响的 DSH 版本、profile、官方插件解析来源、脱敏配置和失败操作。用同构隔离环境分别验证仅官方插件、官方插件加基线 OmO、官方插件加候选 OmO，以及候选重装。比较插件组成和顺序，并用合成记忆证明实际写入、重启读回及普通轮和 `ulw` 轮的模型请求；重装还须保留已写记录。单有加载日志不算通过。不改动本机正在使用的 DSH profile。

## 已确认的裁剪要求

- 从 `feat/deepseek-harness` 删除基于 Pi/Senpi 的 OmO 独立 Agent，包括 `omo-native` 中的独立发行实现和专用构建及发布入口。`omo-ai` npm 包和独立二进制属于同一独立版。
- 裁剪仅在功能分支实施。`dev` 仍用于同步上游；`omo-dsh` Host bundle 和 DSH 内的 OmO 角色预设不在此次删除范围内。其他保留组件仍依赖的共享代码不能随独立版误删。
- **保留边界：** Senpi 宿主适配（`omo-senpi`、`senpi-task`、`omo-native`）已整体删除。保留 Codex、DSH、OpenCode、桌面引擎（`senpi-desktop-*`、`omo-computer-*`）及它们共用的功能和安全门禁。

## OpenCode V2 插件支持

- **已确认需求：** OmO 应作为插件原生运行在 OpenCode V2 中；功能分支不再支持 OpenCode V1。宿主能加载模块、能显示兼容性提示不算功能支持。功能分支不得再对外提供 V1 运行入口或引导安装；`dev` 随上游，不受此约束。
- **改造前基线：** 根入口同时导出 V1 `server` 和 V2 `setup`；V2 服务端入口只写日志，TUI 入口只显示警告。完整运行时走 V1 入口。
- **适配边界：** 以 OpenCode 官方[插件规范](https://opencode.ai/docs/build/plugins)和[V1 插件迁移指南](https://opencode.ai/docs/build/plugins/migrate-v1)为准。V2 在 `setup(ctx)` 里注册所需 hooks、工具和域转换；双入口不会自动迁移 V1 行为。按选定的最低宿主版本验证 API，不把整个 2.x 系列视为已支持。
- **首期验收：** 用真实 OpenCode `2.3.2` 加载从本分支打包并解包的产物。用无插件对照和候选运行证明 Sisyphus、`ulw` 只注入指定轮次、真实 `omo_status` 工具结果进入后续模型请求。产物无公开 V1 或 TUI 入口；旧安装入口不会写配置或缓存。首期不承诺迁齐 V1 功能。

## 重写 README

- **已确认需求：** 重写功能分支的[根目录 README](../../README.md)。现有 README 主要介绍上游的 Pi/Senpi 独立版；重写后应先说明 fork 与上游的关系、`dev` 和功能分支各自的用途，以及本分支实际支持什么。
- **内容与验收：** 从各宿主真正可用的安装入口出发，说明支持版本、配置位置、验证方式和已知限制，重点覆盖 DSH 与 OpenCode V2；保留上游归属和许可证入口。不再把被裁剪的 `omo-ai` 或独立 `omo` 命令当作 fork 的安装方式。逐条核对命令及链接；未验证的功能标明状态，不把 OpenCode V2 入口能加载或 `include:mnemon` 未复现当作兼容通过。
- **文档范围：** 重写根 README，不链接到内容与本分支不一致的上游安装说明。

## 本机验证环境

- `feat/deepseek-harness` 的 CI 和发布前验收仅覆盖 macOS。Linux 和 Windows 不属于本分支的测试或审计门禁；`dev` 沿用上游的测试策略。
- 安装、运行及发布前验收不依赖 Docker。使用本机真实宿主和临时配置：OpenCode 隔离 `HOME` 和 `XDG_*`，Codex 隔离 `CODEX_HOME`，DSH 使用测试 profile。涉及模型时使用本地测试服务，不使用个人账户或真实记忆。
- 按用户要求通过 Homebrew 安装 OpenCode V2。本机已安装 `2.3.2`，终端解析到 `/opt/homebrew/bin/opencode`，`--version` 和 `--help` 已验证。这个版本是本机验证环境，不代表其它 2.x 版本已通过验证。

## 落地门禁

真实宿主 QA 与独立 Oracle 审计均通过后，变更才可合并到 `origin/feat/deepseek-harness`；不写入 `dev`。无法复现或无法安全验证的项记录为阻塞，不记为通过。
