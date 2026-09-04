# Cap7CE 稳定 UI 收口与切换评估

> 轮次：U11
>
> 状态：自动验证与人工确认通过
>
> 本文记录 U11 当时的候选验收结论；D0 正式切换见 `docs/STABLE_UI_DEFAULT_HOST.md`

## 1. 主题与颜色权威

主窗口、独立 Settings 和 Preview 均以偏好系统解析后的 `light` / `dark` 状态为唯一主题权威。跟随系统只在解析偏好时读取 Windows 主题；用户固定选择明亮或黑暗后，新版局部样式不得再由 `prefers-color-scheme` 覆盖。

两种自定义颜色继续复用现有偏好，不建立新版专属配置：颜色1驱动选择、强调表面和主要状态，颜色2驱动键盘焦点及次级强调。Settings 修改后仍通过现有偏好广播同步到主窗口与 Preview。

## 2. 视觉基线

- 主窗口、Settings 与 Preview 的候选宿主统一使用 Acrylic、40 DIP Window Controls Overlay；不支持 Acrylic 时使用当前明暗主题的安全纯色。
- 主窗口首次外框使用工作区宽高的 90% 且不再封顶固定尺寸；Settings 默认 `860 × 680`，Preview 继续按内容和现有 Snap / 最大化保护计算。
- 主窗口保持 5px 内容边距、8px 小圆角、14px 主表面圆角和 13px / 11px / 12px 文字层级。真实缩略图与 Preview 内容保持不透明，透明度只用于 Acrylic 上的壳层表面、悬停、选择和占位状态。
- 既有 920px、560px 与 360px 高度断点保持不变。Preview 在窄于 640px 时只压缩边栏的渲染宽度，不改写用户保存的 280–420px 偏好。

## 3. 无障碍、动效与溢出

主窗口两处分隔线和 Preview 信息栏分隔线都支持指针、双击复位以及方向键 / Home / End 调整，并公开当前值与范围。Preview 折叠按钮在展开和收起时提供明确名称；Settings 当前分类使用 `aria-current`，确认层使用 `alertdialog` 并把初始焦点放在取消动作。

三个窗口的键盘焦点使用颜色2。主窗口标题栏 Portal、Settings 全页和稳定 Preview 在系统启用减少动态效果时共同关闭非必要动画与平滑滚动。导航名称采用省略，说明、路径和诊断内容允许安全换行，避免中英文长文本撑破布局。

## 4. 正式切换评估边界

U11 本轮当时不切换默认宿主、不删除旧 Cap7CE / compatibility 外壳，也不迁移旧布局记录。后续 D0 已把稳定 UI 提升为独立正式 `stable` 模式；旧外壳和旧布局仍保留，旧代码清理继续是默认宿主人工验收之后的独立工作。

稳定 UI 中原 Capsule 快捷动作与 line 点击只显示主窗口并聚焦搜索，不创建或显示 Capsule。旧 Capsule 的窗口、Renderer、IPC 与测试仅作为旧宿主回退保留，不属于新版可达路径。

## 5. 人工验收矩阵

1. 分别检查明亮、黑暗、跟随系统的两种系统状态，以及两种自定义颜色；主窗口、Settings、Preview 和系统标题栏不应出现互相相反的明暗色。
2. 使用 Tab、Shift+Tab、方向键、Home、End、Enter、Space 与 Esc 检查搜索、侧栏、Skim、Settings、Preview 和确认层；焦点始终可见，分隔线可以不用鼠标调整。
3. 切换中文与英文，检查窄侧栏、Settings 分类、长说明、目录、文件名、路径、诊断和 Preview 元数据；不得出现横向撑破或不可恢复的遮挡。
4. 开启 Windows“减少动画”，检查标题栏、网格、Settings、Preview 换图与边栏；功能不变且无非必要过渡。
5. 回归主窗口 / Settings / Preview 并存、原生关闭、standby、line、托盘、快捷键、贴边收起、最大化、Snap、双屏、显示器移除恢复和受控重启；新版路径不得出现 Capsule 残影或重复窗口。

U11 不制作安装包。D0 只完成默认宿主切换和正式路由，安装包验证、用户偏好迁移以及旧 Renderer / CSS 删除仍需分别授权。
