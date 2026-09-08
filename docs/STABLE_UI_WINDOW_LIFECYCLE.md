# Cap7CE 稳定 UI 窗口生命周期

> 轮次：U8–U10 Preview 与窗口生命周期收口
>
> 状态：U10 自动验证与人工确认通过
>
> U8–U10 当时通过开发入口验收；当前已完成 stable-only 宿主收口

## 1. 正式 stable 宿主

主窗口、独立 Settings 和 Preview 统一使用 `frame: true`、Window Controls Overlay 和 40 DIP 标题栏。用户可以在 Acrylic 与 Mica 之间持久化选择，运行时切换会同步刷新三个窗口；若 Electron 拒绝所选背景材料，立即取消材料并按当前明暗主题使用安全纯色。旧 `cap7ce` 透明自绘窗口和 `compatibility` Mica 宿主已经退役。

主窗口首次使用当前工作区宽高的 82%、最大 1600×1000 并居中。该几何只作为无有效记录时的起点；稳定 UI 使用自己的布局文件且只读写 normal 槽作为单一自由窗口记录，默认恢复并持续记录最后有效 bounds。显示器变化或记录越界时仍按当前工作区安全修正。拖动或缩放不会触发 micro / mini / normal 自动状态转换。

## 2. 主窗口、Settings 与 Preview 并存

稳定 UI 打开 Preview 时不隐藏主窗口；打开 Settings 也不关闭 Preview。三者拥有独立原生窗口生命周期，可以同时存在。普通关闭 Preview 只结束预览会话、卸载当前 Provider 数据并隐藏 Preview，不重复显示或改变主窗口几何，但会把键盘焦点交还主窗口，确保同一缩略图可以立即再次用空格预览。

只有需要回到主界面完成工作的 Preview 动作会显式恢复并聚焦主窗口：编辑关键词、删除文件以及切换 Skim 位置。关闭后的两分钟空 Renderer 复用、Provider 会话授权、最大化 / Snap 保护、边缘收起和内容尺寸计算仍沿用既有链路。主窗口与 Preview 均不再在拖动结束后执行自绘位置吸附，stable 的贴靠和分屏由 Windows Snap 完整接管。

通用文件与文件夹在 Preview 内容区保留文件名、类型、路径、修改时间、大小和索引范围等基础摘要，确保信息边栏收起时仍可独立阅读；内容区使用既有格式图标、新版半透明卡片与中性字段层级。普通文件、扩展失败信息和文件夹分别按固定摘要结构请求对应内容尺寸，使窗口一次成形且不持续干预自由缩放；长路径或详情超出可用空间时只滚动当前面板，不触发多文件预览导航。

## 3. 入口与预设

- stable 使用独立快捷键配置：`Alt+反引号` 显示并聚焦主窗口且保留几何，`Alt+1` 进入安全 standby 并显示 line，`Alt+2` 显示主窗口并恢复当前工作区 82%、最大 1600×1000 的默认大小和居中位置，`Alt+3` 显示主窗口并展开或收起 Skim，`Alt+4` 打开或聚焦独立 Settings；`Alt+Q` 继续循环目录。micro / mini 不在新版注册或显示。
- `Alt+2` 在应用默认 bounds 前结束旧贴边收起会话并退出最大化，只改变窗口几何；托盘、第二实例与普通唤起只显示并聚焦主窗口，不重置尺寸。快捷动作配置只保留当前六项语义，旧键名读取时映射，micro / mini 字段被安全忽略。
- `Alt+反引号` 和 line 单击复用“显示主窗口并聚焦搜索”入口，不创建或显示 Capsule；对应 BrowserWindow、Renderer、IPC 和测试已经删除。
- standby 只负责安全结束临时交互后隐藏主窗口；line 仍是无业务状态的独立装饰窗口。由 standby 恢复新版主窗口时只恢复可见性、任务栏和焦点，不改变自由 bounds。

## 4. 自动守门与人工验收

`tests/stable-ui-window-lifecycle.integration.cjs` 守护 40 DIP WCO、Acrylic / Mica 选择与纯色回退、82% 且最大 1600×1000 的初始几何、单一自由布局槽、快捷动作收口、搜索聚焦入口和三窗口并存。主窗口与 Preview 的 WCO 标题栏共同使用 `WindowTitlebarPortal` 脱离虚拟网格和其他可滚动内容树，防止滚动重算再次覆盖 Windows 原生拖动命中区；Preview、line、Snap 和布局测试继续参与完整测试。

人工验收应覆盖：自由拖动与缩放不回弹；五项 stable 快捷动作与 `Alt+Q` 使用各自配置；`Alt+2` 只重置几何；主窗口隐藏后 `Alt+反引号` 与 `Alt+3` 能正常恢复；standby、原生关闭、托盘和第二实例恢复；主窗口 / Settings / Preview 同时可见及分别关闭；中文 IME、Esc、快速重复唤起、最大化、Snap、双屏和显示器恢复；不得出现 Capsule 残影或重复窗口。

主题、颜色、可访问性、减少动态效果和中英文溢出的 U11 结论见 `docs/STABLE_UI_FINISHING_AUDIT.md`；D0 默认宿主边界见 `docs/STABLE_UI_DEFAULT_HOST.md`。
