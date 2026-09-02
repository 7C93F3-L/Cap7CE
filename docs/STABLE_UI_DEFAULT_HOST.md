# 新版稳定 UI 默认宿主

> 当前轮次：D0
> 更新日期：2026-09-02
> 状态：代码与自动守门接入，等待真实 Windows 窗口人工确认

## 1. 正式模式

窗口宿主现在使用三个稳定枚举：

| 模式 | Renderer 与原生外壳 | 布局记录 |
| --- | --- | --- |
| `stable` | 新版稳定 UI；40 DIP Window Controls Overlay；Acrylic，失败时回退主题安全纯色 | `window-layout-stable-ui.json` |
| `cap7ce` | 旧透明自绘外壳与旧 Renderer | `window-layout.json` |
| `compatibility` | 旧不透明 Mica / 36 DIP WCO 外壳与旧 Renderer | `window-layout-compatibility.json` |

缺失或非法的窗口模式偏好规范化为 `stable`。已有用户明确保存的 `cap7ce` 或 `compatibility` 继续按原值启动，本轮不改写用户配置，也不把旧布局复制到新版布局。Settings 中的既有受控重启事务按“stable → compatibility → cap7ce → stable”循环，使三个宿主都可实际进入并在启动失败时回滚。

## 2. 加载边界

主进程在开发服务与打包文件加载中都向主窗口和 Preview 传入实际 `presentation`。Renderer 只在 `presentation=stable` 时装配新版主界面与新版 Preview；另两种模式继续装配旧 Renderer。独立 Settings 仍由窗口类别分流，并与本次正式 stable 模式共用真实偏好和领域动作。

`npm run dev:stable-ui` 显式启动 stable，`npm run dev:cap7ce` 与 `npm run dev:compatibility` 分别用于两个旧宿主回归。普通 `npm run dev` 读取已保存偏好；新配置按默认规则进入 stable。

## 3. 本轮边界

- stable 的正式窗口表面只有主窗口、独立 Settings、Preview 和原有 line；Capsule 不属于新版能力，新版后续不为其增加界面、交互或专项维护。旧 Capsule 只随本轮保留的旧宿主暂存，待旧宿主退役轮次一并处理。
- 不删除旧 Renderer、旧样式、旧 Capsule、旧窗口状态机或旧布局。
- 不迁移、覆盖或删除用户偏好、索引、缓存与窗口记录。
- 不借默认宿主切换调整新版 UI 的尺寸、文案或视觉细节。
- 不制作安装包，也不把构建成功表述为打包验证。

## 4. 守门与人工确认

自动守门覆盖正式模式规范化、三份布局隔离、受控重启与回滚、开发和生产 Renderer 路由、stable 主窗口 / Settings / Preview 生命周期，以及旧宿主回退链。

人工确认至少检查：首次或无有效偏好时进入新版稳定 UI；目录与偏好就绪后中央自动显示“全部目录”空查询结果，Skim 默认收起且只由明确按钮展开，空结果中央没有进入 Skim 的点击热区；主窗口可自由缩放与拖动；Settings 和 Preview 可与主窗口并存并正常关闭；同一缩略图可重复按空格预览；置顶、line、搜索、目录、Skim 和文件动作无明显回归；三次受控切换可依次进入 compatibility、cap7ce 并回到 stable。人工确认前不提交本轮。
