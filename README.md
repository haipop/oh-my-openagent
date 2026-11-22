# Oh My OpenAgent: DeepSeek Harness fork

本仓库 fork 自 [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)。`dev` 只同步上游；`feat/deepseek-harness` 保存本 fork 的改动。本页只描述功能分支，不适用于上游 npm 发行版。

`feat/deepseek-harness` 的 CI 和发布前验收仅覆盖 macOS，不运行 Linux 或 Windows 测试。安装、运行和验收都不需要 Docker；实机验收使用 macOS 上的真实宿主、临时配置目录和本地模型服务。

| 宿主 | 功能分支范围 |
| --- | --- |
| DeepSeek Harness | `omo-dsh` Host bundle：工作模式、角色预设、规则注入和只读状态工具。预设取决于 profile；默认 headless 不注册这些预设。 |
| OpenCode | 目标宿主及插件 SDK 为 `2.3.2`。V2 首期仅包含 Sisyphus、当前轮的 `ulw` / `ultrawork` 指令和只读 `omo_status`；不提供 V1、OmO TUI、团队或后台代理功能。 |
| Senpi / Codex | 保留宿主插件与共享库，不再提供基于 Pi/Senpi 的 OmO 独立 Agent。 |

## DeepSeek Harness

在功能分支的 checkout 中，将本地 bundle 添加到指定 profile。把 `your-profile` 替换为 CLI 管理的实际 profile，不要对默认 profile 试装或重装。

```sh
dsh plugin --profile your-profile add "$(pwd)/packages/omo-dsh"
```

Desktop 使用其 Plugin Manager 添加同一个目录。安装前备份目标 profile 的配置；已有 `include:mnemon` 时保留官方插件及其配置和顺序，不重复展开 include，也不清空记忆目录。兼容性以同一 profile 中的实际写入、重启读回和模型请求为准，不能用插件列表代替。

如果 DSH Desktop `0.2.2-rc.5` 的「设置 → 内置插件 → 全局插件」把 `include:mnemon` 标为「启动失败」，先检查已安装的 `dsh-mnemon` 版本。隔离 Desktop 上，`0.5.32` 即使未装 OmO，也会在初始化时调用当前宿主不再提供的 `agents.roots()` 而失败；`0.5.50` 已验证可与本分支 OmO 一起启动。备份目标 profile 和记忆后，在插件管理器中原位更新 Mnemon，不要先卸载或重建记忆。重启后在同一位置检查插件状态，再确认已有记忆能读回。

如果用终端管理 `desktop` profile，先退出 DSH Desktop，再原位升级：

```sh
dsh plugin --profile desktop add dsh-mnemon@0.5.50
```

在启用 OmO 的 profile 新开会话，检查 `omo_status`，再发送含 `ulw` 的提示检查 OmO 模式标记。支持预设的 profile 可选择 Sisyphus 或 Atlas。撤回时只删除新增的 OmO 插件项：CLI 使用 `dsh plugin --profile your-profile remove @oh-my-opencode/omo-dsh`，Desktop 从 Plugin Manager 移除 OmO；有手工配置改动时按备份还原。保留其他插件与记忆。

## OpenCode V2

`brew install opencode` 安装的是宿主，不是 OmO。用 `opencode --version` 检查版本；本分支针对 `2.3.2`，不把 Homebrew 后续提供的版本视为已验证。

从 fork 构建本地归档，勿用同名上游 npm 包替代：

```sh
git clone --branch feat/deepseek-harness --recurse-submodules https://github.com/haipop/oh-my-openagent.git
cd oh-my-openagent
bun install --frozen-lockfile
bun pm pack --ignore-scripts --filename omo-opencode-v2.tgz
package_dir="$(mktemp -d)"
tar -xzf omo-opencode-v2.tgz -C "$package_dir"
printf '%s\n' "$package_dir/package"
```

在**目标项目**的 `opencode.json` 中，将下列对象追加到原有 `plugins` 数组。使用上一步输出的包根目录，不要指向 `dist/index.js`；启用期间保留解包目录。若从旧版迁移，先备份相关配置，只移除旧 OmO 的 V1 注册项，不改其它插件。以下是没有其它设置时的完整示例：

```json
{
  "plugins": [{ "package": "/absolute/path/to/unpacked/package" }]
}
```

把 `package_dir` 设为解包时创建的目录。在目标项目根目录安装随包提供的主代理；已有同名文件时保留原文件，先检查差异。

```sh
mkdir -p .opencode/agents
cp -n "$package_dir/package/packages/omo-opencode/.opencode/agents/sisyphus.md" .opencode/agents/sisyphus.md
```

配置 OpenCode 自己的模型提供方后，从目标项目运行：

```sh
opencode run --standalone --format json --agent sisyphus 'ulw 请调用 omo_status 并报告当前轮的 mode'
```

检查 JSON 输出中的 `omo_status` 工具结果：命中轮应为 `ultrawork`。取出输出中的 `sessionID`，在同一个会话验证普通轮回复 `standard`：

```sh
opencode run --standalone --format json --agent sisyphus --session '<sessionID>' '请调用 omo_status 并报告当前轮的 mode'
```

撤回时，从 `plugins` 删除本地包这一项，只移除本次装入的 Sisyphus 文件，然后再删除解包目录或恢复备份。

## 项目与许可

[功能分支需求](packages/omo-dsh/REQUIREMENTS.md) · [许可证](LICENSE.md) · [第三方声明](THIRD-PARTY-NOTICES.md)
