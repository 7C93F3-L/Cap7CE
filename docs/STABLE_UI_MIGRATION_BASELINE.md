# Cap7CE 稳定 UI 迁移基线

> 基线版本：0.9.9  
> 基线提交：`e3ef6c0dc387bcf49a82a868be02fd5dccdc8da4`  
> 迁移阶段：U0 基线冻结与迁移映射  
> 行为状态：无用户可见变化

## 1. 回退边界

- U0 的代码回退点是上面的完整提交；分支与远端默认分支在该提交处一致。
- C0 至 C9 的兼容窗口专项视为 0.9.9 历史完成基线，不再从旧专项追加行为。
- U0 不创建提交或标签。只有人工确认本轮结果后，才建立独立的 U0 提交；如需额外标签，另行确认后创建。
- 迁移期继续保留现有 `cap7ce` 与 `compatibility` 宿主、旧 Renderer、旧布局记录和默认模式。U0 不新增窗口、不改变状态机、不写用户偏好。

## 2. 现有能力到新版入口的映射

新版入口只能组合或调用下列现有权威链路。迁移中若所有权发生移动，必须同步更新本表与 `scripts/architecture-boundaries-baseline.json` 的可机读锚点；不能在新组件内建立平行业务状态。

| 能力 | 当前动作与状态权威 | 当前组件 / 服务 | 新版界面入口与轮次 |
| --- | --- | --- | --- |
| 搜索 | `App.tsx` 的 `submitSearch` / `runSearch`；正式查询、IME、路径直达、快捷指令和 AI 按次入口保持同一提交链 | `Cap7CESearchCapsule`、`ResultsView`、`VirtualResultGrids`、`searchIpc.ts` | U3 的新版搜索输入与结果容器只接现有 Props 和动作；不复制查询、排序、证据、虚拟化或缓存逻辑 |
| 目录 | `App.tsx` 继续编排目录加载、添加、重命名、删除、刷新及冲突确认；主进程以目录管理 IPC 和统一添加服务为权威 | `DirectoryAiSettingsRows`、`directoryManagementIpc.ts`、`directoryAddService.ts` | U4 左栏与 U7 Settings 复用同一目录动作；不修改扫描、SQLite 或目录归属语义 |
| Skim | `openSkimAtLocation`、`useSkimReadController`、独立 skim 排序 / 范围 / 导航 / 选择 / 滚动状态保持权威 | `SkimView`、`SkimLocationPicker`、skim 服务与缓存链 | U5 将现有 Skim 控制器装入右侧并排插槽；搜索结果的查询、选择和滚动状态不得因视觉隐藏而销毁 |
| Settings | 旧外壳仍由 `App.tsx` 的 `openSettings` 与同窗 `settings` shell state 打开；稳定 UI 由统一动作恢复独立单实例宿主，两种 Renderer 共享现有偏好、目录和领域任务 IPC | `SettingsWindowController`、`SettingsWindowApp`、`useSettingsWindowController`、旧 `SettingsView` 及其分区组件、`preferenceIpc.ts` | U6 迁移窗口宿主；U7 按新版分类接入正式内容并同步两窗状态，不复制持久化、目录、缓存、更新、快捷键或模型事务。后续已接入 stable 的 Acrylic / Mica 材质偏好与安全纯色回退 |
| Preview | Results / Skim 产生统一预览 DTO；主进程持有单实例窗口、复用、隐藏、两分钟空 Renderer 和主窗协调链 | `PreviewWindowApp`、现有 Provider、`preview:*` 生命周期 | U8 只替换壳层与信息边栏，U9 接快速交互；Provider、会话授权、缓存与复用链保持唯一 |
| 文件菜单 | 选择范围由 Results / Skim / Preview 所有；动作组与快捷键解析由共享构造器所有；系统能力由文件 IPC 校验 | `fileContextActions.ts`、`ImageContextMenu`、`fileIpc.ts` | U3、U5、U8 的新版表面复用同一动作组；不复制打开、定位、复制、关键词或删除权限判断 |
| 拖放 | 结果与 Skim 只提交已选路径到 `files.startDrag`；主窗口目录拖入仍由 `App.tsx` 的确认链处理 | `ResultsView`、`SkimView`、`fileDragService.ts`、目录确认面板 | U3 / U5 保留文件拖出，U4 / U7 保留目录拖入；不得绕过原生拖拽抑制或目录冲突确认 |
| 快捷键 | 主进程负责全局注册、可用性与统一窗口激活；Renderer 负责窗口内取消、目录循环和现有输入命中 | `shortcutActions.ts`、`App.tsx`、`registerConfiguredGlobalShortcuts` | 新版按钮只调用统一动作。尺寸预设、Capsule 和相关快捷动作统一留到 U10 评估；U0 不调整键位、文案或注册规则 |
| 窗口固定 | `useAlwaysOnTopController` 与主进程持久固定状态为权威；固定状态同时抑制自身边缘收起 | `CompatibilityTitlebar`、`WindowControlRail`、`dockedShellController.ts` | U1 抽共享置顶按钮，U8 在 Preview 复用；Settings 不提供置顶入口 |
| 隐藏恢复 | Renderer 的安全 standby 取消临时交互；主进程的统一激活、显示聚焦、line 互斥和 docked shell 会话保持权威 | `enterStandby`、`activateShellModeShortcut`、`showAndFocusMainWindow`、line / docked shell 控制器 | U2 以后新版 Renderer 只响应现有 shell 通知与动作；不得旁路显示恢复、line、贴边收起或预览协调链 |

## 3. 架构体量冻结

自动检查以文件末尾换行计入物理行数。U0 将三个热点入口冻结为当前值：

| 文件 | U0 物理行上限 | 迁移约束 |
| --- | ---: | --- |
| `src/renderer/App.tsx` | 3358 | 只保留应用级状态组合、导航和顶层动作；新版页面与大型区块必须进入领域模块 |
| `electron/main.ts` | 3771 | 只保留窗口 / Preview 生命周期和顶层装配；新增窗口控制器或外围 IPC 必须进入职责模块 |
| `src/renderer/styles.css` | 1090 | 只保留全局变量、壳层和兼容规则；新版独立组件样式进入对应领域 CSS |

`npm run test:architecture-boundaries` 同时检查上述体量、Renderer 权限、反向依赖、主进程 IPC 边界，以及本页十个迁移能力的正式源码锚点。所有权合法移动后应更新映射并降低能够收缩的体量上限，不能通过删除空行或压缩可读性换取新增空间。

## 4. U0 测试基线

在基线提交未修改时，以下检查均已通过：

- `npm run build`
- `npm test`
- `npm run test:architecture-boundaries`（由完整测试包含）

每个后续 U 轮仍须重新运行生产构建、完整测试、独立架构守门和差异检查。未运行 `npm run pack` 时，不得声称安装包已验证。

## 5. 原型隔离

- 本机稳定 UI 原型只提供视觉与交互参考，不属于正式源码或打包输入。
- `.gitignore` 明确排除原型目录；正式实现不得复制原型脚本整体，也不得提交原型包含的本机绝对路径、测试样本、截图或运行记录。
- `package.json` 继续以显式 `build.files` 白名单决定打包范围；U0 不执行打包，也不改变发布内容。
