# Cap7CE stable 唯一宿主

> 当前状态：1.0.4 stable-only
>
> 历史说明：本文最初记录 D0 将 stable 提升为默认宿主；旧 `cap7ce` / `compatibility` 回退链现已退役。

## 1. 正式窗口表面

主窗口、独立 Settings 与 Preview 均使用 `frame: true`、40 DIP Window Controls Overlay，以及同一套 Acrylic / Mica 材质运行时；系统不支持所选材质时回退当前主题的安全纯色。line 保持独立、无业务状态的轻量窗口。

产品与开发入口不再接受 presentation 模式选择，不再装配旧 Renderer、兼容标题栏、独立或同窗 Capsule，也不再提供 `dev:cap7ce`、`dev:compatibility` 或模式切换事务。历史偏好 JSON 中的模式、窗口记忆和旧快捷动作字段会被安全忽略或映射；磁盘上的旧布局文件与用户数据不会被主动删除。

## 2. 当前入口与布局

- 普通启动直接装配 stable 主界面；目录和偏好就绪后执行一次“全部目录”空查询，Skim 默认收起。
- 主窗口使用 `window-layout-stable-ui.json` 的单一自由 bounds 并默认记忆；无有效记录时按工作区 82%、最大 1600×1000 居中。
- Settings 使用独立单实例窗口；Preview 使用独立单实例窗口并保留 Provider 会话与内容尺寸链；三者可以同时存在。
- `Alt+反引号` 显示并聚焦主窗口搜索，`Alt+1` 隐藏主窗口并按偏好显示 line，`Alt+2` 恢复默认大小和位置，`Alt+3` 展开 / 收起 Skim，`Alt+4` 打开 Settings，`Alt+Q` 循环目录。

## 3. 守门与验收

自动检查必须证明生产 Renderer 与 Electron 输出不含旧主宿主、兼容标题栏或 Capsule 入口；Electron 编译前会清理限定的输出目录和对应增量缓存，避免已删除文件以陈旧产物继续存在。其余检查继续覆盖主窗口 / Settings / Preview 生命周期、搜索、目录、Skim、文件动作、置顶、line、边缘收起、最大化、Snap 与布局记忆。

真实 Windows 验收至少覆盖：冷启动与退出重启、托盘和第二实例恢复、五项窗口快捷动作与 `Alt+Q`、主窗口自由拖动 / 缩放 / 最大化 / Snap、Settings 与 Preview 并存及分别关闭、Preview 固定按钮、Skim 展开收起、中文输入和快速重复操作。未运行 `npm run pack` 时不得声称安装包已经验证。
