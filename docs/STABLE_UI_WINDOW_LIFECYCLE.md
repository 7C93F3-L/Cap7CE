# Cap7CE 稳定 UI 窗口生命周期

> 轮次：U8–U10 Preview 与窗口生命周期收口
>
> 状态：U10 自动验证与人工确认通过
>
> U8–U10 当时通过开发入口验收；D0 后由正式 `stable` 模式使用同一生命周期

## 1. 正式 stable 宿主

正式 `stable` 模式的主窗口、独立 Settings 和 Preview 统一使用 `frame: true`、Window Controls Overlay 和 40 DIP 标题栏。Windows 支持时使用 Acrylic；若 Electron 拒绝该背景材料，立即取消材料并按当前明暗主题使用安全纯色。旧 `cap7ce` 透明自绘窗口和 `compatibility` Mica 宿主的构造策略保持不变。

主窗口首次使用当前工作区宽高的 90% 并居中，不再设置固定最大尺寸。该几何只作为无有效记录时的起点；稳定 UI 使用自己的布局文件且只读写 normal 槽作为单一自由窗口记录，默认恢复并持续记录最后有效 bounds。显示器变化或记录越界时仍按当前工作区安全修正。拖动或缩放不会触发 micro / mini / normal 自动状态转换。

## 2. 主窗口、Settings 与 Preview 并存

稳定 UI 打开 Preview 时不隐藏主窗口；打开 Settings 也不关闭 Preview。三者拥有独立原生窗口生命周期，可以同时存在。普通关闭 Preview 只结束预览会话、卸载当前 Provider 数据并隐藏 Preview，不重复显示或改变主窗口几何，但会把键盘焦点交还主窗口，确保同一缩略图可以立即再次用空格预览。

只有需要回到主界面完成工作的 Preview 动作会显式恢复并聚焦主窗口：编辑关键词、删除文件以及切换 Skim 位置。关闭后的两分钟空 Renderer 复用、Provider 会话授权、最大化 / Snap 保护、边缘收起和内容尺寸计算仍沿用既有链路。

## 3. 入口与预设

- 新版不注册 micro / mini 全局快捷动作，独立 Settings 也不显示这两项；旧偏好值、旧界面设置和旧宿主行为不迁移、不删除。
- 原 normal 快捷动作在新版标记为“恢复默认窗口尺寸”，只在用户按下该全局快捷键时应用一次当前工作区 90% 的预设，不切换 Renderer、业务状态或持续约束后续缩放。托盘、第二实例、Capsule 提交等普通恢复入口只显示并聚焦主窗口，不应用尺寸预设。
- 原 Capsule 快捷动作和 line 单击在新版标记为“显示主窗口并聚焦搜索”，不创建或显示 Capsule。兼容 Capsule 的 BrowserWindow、Renderer、IPC 与旧宿主测试仍保留为迁移回退，不属于新版可达路径。
- standby 只负责安全结束临时交互后隐藏主窗口；line 仍是无业务状态的独立装饰窗口。由 standby 恢复新版主窗口时只恢复可见性、任务栏和焦点，不改变自由 bounds。

## 4. 自动守门与人工验收

`tests/stable-ui-window-lifecycle.integration.cjs` 守护 40 DIP WCO、Acrylic / 纯色回退、90% 初始几何、单一自由布局槽、快捷动作收口、Capsule 替代入口和三窗口并存。兼容与稳定 WCO 标题栏必须共同使用 `WindowTitlebarPortal` 脱离虚拟网格和其他可滚动内容树，防止滚动重算再次覆盖 Windows 原生拖动命中区；对应标题栏测试同时守护共享宿主与两个消费者。旧窗口策略、兼容 Capsule、Preview、line、Snap 和布局测试继续参与完整测试，防止新版分支改变迁移回退。

人工验收应覆盖：自由拖动与缩放不回弹；Alt+3 只执行一次尺寸预设；Capsule 快捷键与 line 点击只聚焦主搜索；standby、原生关闭、托盘和第二实例恢复；主窗口 / Settings / Preview 同时可见及分别关闭；中文 IME、Esc、快速重复唤起、最大化、Snap、双屏和显示器恢复；不得出现 Capsule 残影或重复窗口。

主题、颜色、可访问性、减少动态效果和中英文溢出的 U11 结论见 `docs/STABLE_UI_FINISHING_AUDIT.md`；D0 默认宿主边界见 `docs/STABLE_UI_DEFAULT_HOST.md`。
