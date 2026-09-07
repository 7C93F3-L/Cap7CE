# Cap7CE 软件架构

> 当前版本：0.9.9
> 更新日期：2026-09-06
> 本文用于后续开发对话承接项目结构、边界和稳定约束。它不是更新日志。

0.9.9 兼容窗口专项 C0 至 C9 与新版稳定 UI 的 U0 至 U11 记录均为历史迁移依据。当前产品已完成稳定窗口宿主收口：主窗口、独立 Settings 与 Preview 只装配新版 Renderer、40 DIP Window Controls Overlay 和同一套 Acrylic / Mica 材质运行时，不再保留可执行的 Cap7CE / compatibility 外壳或模式切换。后续界面入口必须复用正式业务动作与状态权威，不能从历史专项恢复平行业务链。

本文中以 C、D、U、A 编号开头的段落记录各阶段当时的边界，不代表当前仍可执行的宿主。当前实现以第 16 节为准：搜索只使用 `StableSearchInput`，搜索结果与 Skim 只使用 `ResponsiveFileContextMenu`，旧搜索胶囊、旧分栏菜单、旧 Results / Skim 适配层及其 CSS、图标和测试均已物理删除。

## 1. 项目定位

Cap7CE 是 Windows 本地视觉文件搜索工具。中文核心概念是“搜索胶囊”，英文可理解为 Capsule Search Core。

它面向本地素材管理：用户添加本地目录后，应用扫描支持文件，并以文件名、路径、人工关键词、高价值嵌入信息和轻量派生事实完成即时搜索；用户按需开启时，再由本地视觉模型对缩小后的候选执行 AI 深度匹配。源文件、索引、缩略图、预览缓存、模型配置和运行时配置均保留在本机。

Cap7CE 的核心能力包括：
- 扫描本地视觉文件目录。
- 为支持格式生成缩略图、模型输入图和预览缓存。
- 通过本地 `llama.cpp` 与 GGUF 视觉模型按需判断搜索候选。
- 将人工、嵌入、派生及历史 AI 证据按独立所有权保存在 SQLite；当前 AI 深度匹配结果只保留在会话中。
- 在单一自由响应式主窗口中搜索、预览、拖拽、打开和管理本地素材。

## 2. 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面容器 | Electron |
| 用户界面 | React |
| 开发语言 | TypeScript |
| 构建工具 | Vite |
| 本地数据库 | SQLite / sql.js |
| AI 运行时 | llama.cpp / llama-server |
| 视觉模型 | 本地 GGUF 视觉模型与 mmproj |
| 图像处理 | sharp / libvips |
| PDF 渲染 | PDF.js / `@napi-rs/canvas` |
| PSD 读取 | ag-psd |
| 文件预览与缩略图 | 自有视觉缓存与 IPC |

0.9.9 使用 Electron 43.2.0、Vite 7.3.6 与 electron-builder 26.15.3。生产与完整依赖审计均保持 0 条漏洞；升级时不得使用 `npm audit fix --force` 强制降级或跨越兼容边界。

Renderer 不直接访问 Node、文件系统、SQLite 或本地进程。系统能力通过 preload 白名单 API 进入主进程。

运行诊断完全保留在本机：`runtimeDiagnostics.ts` 以 2 MB × 5 的 JSONL 轮转上限记录会话、搜索边界、资源快照和异常事件，默认不记录搜索词、文件名、完整路径或嵌入元数据；窗口创建失败只记录窗口类别和已脱敏异常。详细记录仅是本次运行内的临时状态。Electron Crashpad 使用 `uploadToServer: false`，不会自动上传。诊断导出只收集受限数量和体积的日志及最近崩溃报告，文字日志在写入 ZIP 前再次脱敏；应用不提供远程提交入口。

## 3. 主进程架构

`electron/main.ts` 是窗口、系统能力和 IPC 编排中心。当前主进程负责：
- 以唯一稳定策略创建主 `BrowserWindow`、独立 Settings 与 Preview：统一使用 `frame: true`、40 DIP Window Controls Overlay 和用户选择的 Acrylic / Mica，失败时回退主题安全纯色；首次主窗口按工作区宽高的 82%、最大 1600×1000 居中。主窗口只额外装配待机线使用的不可聚焦 `lineWindow`；旧模式偏好即使仍留在历史 JSON 中也会被忽略，不迁移、不执行。所有窗口的 DevTools 能力仅在未打包开发环境开启。
- `dockedShellController.ts` / `dockedShellAutomation.ts` 管理主窗口和预览窗口自身的边缘收起：在非任务栏边缘附近建立会话，鼠标离开后把原生 BrowserWindow 一次性移到显示器外并保留 5 DIP 真实窗口边沿，同时临时使用低于任务栏的 `floating` 层级避免被普通窗口遮挡；鼠标到达对应物理屏幕最外沿后立即恢复完整展开 bounds、撤销临时层级并在不抢焦点的情况下提升至普通窗口前方。边缘收起由设置页与托盘菜单共用同一偏好控制，不再附带拖动结束后的自绘位置吸附。stable 与 compatibility 的贴靠和分屏完全交由 Windows Snap；检测到系统 Snap 几何时暂停边缘收起。两类窗口复用相同控制器，但固定、停靠与 collapsed 状态相互独立；固定窗口继续使用独立的持久置顶语义并暂停自身收起。窗口移动 / resize 与原生文件拖出期间统一抑制自动收展，程序位置变化进入对应 move / resize guard，独立 line 始终隐藏；显示器拔插、分辨率或任务栏工作区变化时统一取消临时层级和收起会话，并把完整窗口夹回当前可见工作区。
- 主窗口内容始终使用单一 normal / 自由响应式布局，拖动与缩放不触发 Capsule、micro 或 mini 形态转换；旧自动 resize settle、阈值回弹、底部居中修正和分形态布局记忆均已删除。standby 只隐藏主窗口并协调独立 line，恢复时只还原可见性、任务栏与焦点；唯一尺寸动作把主窗口恢复为当前工作区 82%、最大 1600×1000 的居中 bounds。
- 主窗口原生关闭与 Alt+1 只向 Renderer 发出同一个安全 standby 请求，不允许主进程先行隐藏窗口；Renderer 统一取消未提交的关键词编辑、确认弹层、右键菜单、边栏和快捷指令确认后再切换状态。已经开始执行的目录添加或删除、文件删除、缓存清理及关键词保存会阻止本次收起，不把进行中的操作隐藏到后台。真正退出时 `isQuitting` 允许原生 close 继续完成，不反向进入隐藏链路。
- 管理窗口显示、隐藏、后台常驻与任务栏隐藏。
- 创建托盘图标和右键菜单；托盘图标单击、第二实例和全局窗口快捷动作复用同一个主窗口恢复入口，冷启动时到达过早的第二实例请求延迟到主窗口 ready 后执行。恢复 normal 时已有 skim 会话保持当前内容视图。
- 通过托盘气泡发送可关闭的 Windows 系统通知，显式使用 Cap7CE 图标并尊重系统安静时间；主界面按钮、全局快捷动作、托盘、通知点击和 Preview 统一复用同一个独立 Settings 打开动作，避免多个 Renderer 同时持有设置事务。
- 控制主窗口、line 与预览窗口共享的 `alwaysOnTop` 置顶状态并持久化。
- `Alt+\`` 和 line 单击复用统一主窗口激活入口：先退出边缘收起、隐藏 line、显示并聚焦主窗口，再聚焦现有搜索框；不创建第二套搜索窗口或草稿交接链。
- 创建独立的冷启动提示窗口；启动提示窗口必须只关闭自己，不能控制主窗口生命周期。
- 首次实际预览时按需创建并复用独立、可缩放的 `previewWindow`。主窗口、Settings 和 Preview 可以同时存在，打开 Preview 不隐藏主窗口，普通关闭只结束预览会话并隐藏自身、不改变主窗口几何，但会把键盘焦点交还主窗口；编辑关键词、删除文件和切换 Skim 位置才显式恢复主窗口内容状态。预览窗口拥有原生最小化与任务栏入口；内容自适应、Snap / 最大化保护、边缘收起和关闭后两分钟空 Renderer 复用保持统一。
- 预览内容切换后根据最新图片尺寸重新计算窗口大小；最大化期间只记录最新目标尺寸，恢复时再应用。
- 主窗口只在自由拖动结束后延迟记录有效布局，不再二次改写用户停放位置；Preview 不再监听拖动结束执行位置吸附。两类窗口继续分别维护程序移动保护和独立边缘收起会话。预览收起期间的内容自适应尺寸更新保存的展开 bounds，并重新计算对应屏外位置，避免以 collapsed bounds 错误锚定或产生展开闪动。
- 注册、暂停、恢复并验证可配置全局快捷动作；运行时只注册显示并聚焦主搜索、隐藏到 line、切换 Skim、打开 Settings 和恢复默认窗口五项全局动作，目录循环继续由 Renderer 处理。旧快捷配置字段留在历史 JSON 时会被忽略；快捷键映射候选只有实际注册成功才允许写入正式稳定配置，运行期临时冲突不改写用户总开关。
- 启动、停止、扫描和记录 `llama.cpp` / `llama-server` 状态。
- 扫描 GGUF 模型目录并保存模型选择。
- 处理文件系统能力：打开文件、打开路径、复制路径、删除到回收站、原生拖拽。
- 处理目录、索引、搜索、缓存、预览、关键词编辑相关 IPC。

主要主进程模块：

| 模块 | 职责 |
| --- | --- |
| `stableUiWindowLifecycle.ts` / `stableWindowRuntime.ts` | 主窗口、Preview 与 Settings 唯一稳定外壳的 40 DIP WCO、主题符号色、Acrylic / Mica 运行时应用与主题纯色回退，以及工作区 82%、最大 1600×1000、最小 300×170 的自由主窗口 bounds；布局固定写入 `window-layout-stable-ui.json`，不读取、迁移或删除旧宿主布局文件 |
| `stablePreviewWindowSizing.ts` | Preview 内容尺寸到稳定窗口外框的纯几何适配；固定计入 40 DIP 标题栏、信息栏当前宽度与右/底 5px 边距，保持当前外框中心，并在狭窄工作区内约束最小值、85% 最大内容尺寸和完整外框可见性 |
| `src/renderer/window-presentation/WindowTitlebarPortal.tsx` / `stable-ui/StableTitlebar.tsx` / `preview/StablePreviewTitlebar.tsx` | 主窗口与 Preview 的 WCO 标题栏统一通过共享 Portal 宿主挂载到 `document.body`，不得直接留在会动画、裁剪或滚动的应用内容树中，避免虚拟网格滚动重算后覆盖 Windows 原生拖动命中区。各标题栏使用 `titlebar-area-*` 环境变量限定安全区域，并复用既有置顶图标、状态与统一动作；系统最小化 / 最大化 / 关闭继续由 Windows 绘制 |
| `browserWindowDiagnostics.ts` | 主窗口、Settings、预览、line 与启动提示共用的原生 BrowserWindow 创建失败边界；只记录窗口类别和经运行诊断统一脱敏的异常后原样抛出，不吞掉 Electron 创建失败，也不接触用户搜索或路径 |
| `windowLayoutTypes.ts` / `windowLayoutGeometry.ts` | 窗口布局记忆的版本化稳定类型，以及显示器选择、work area 映射、边缘 / 任务栏方向、四向 line 与完整 bounds 恢复的纯几何能力 |
| `windowLayoutStore.ts` / `windowLayoutManager.ts` | 按单一记忆开关捕获与恢复主窗口最后有效自由 bounds，只保留 normal 槽；不迁移或删除磁盘上的旧记录，显示器缺失时仍按工作区夹回可见范围 |
| `settingsWindowController.ts` / `settingsWindowLayout.ts` / `settingsWindowIpc.ts` / `settingsDataBroadcast.ts` | stable 的独立 Settings 单实例生命周期、受限主 Renderer 打开入口、版本化专属 bounds 及主 / Settings Renderer 状态广播；关闭只隐藏自身，重复打开还原并聚焦，显示器缺失或 work area 变化时复用公共布局几何夹回可见区域，不读写主窗口 normal 记录。诊断与版本更新 IPC 只认可主窗口或 Settings 的当前 WebContents；诊断导出对话框归属实际发送窗口，更新进度返回 Settings |
| `src/renderer/settings-window/SettingsWindowApp.tsx` / `useSettingsWindowController.ts` / `SettingsWindowUpdateControl.tsx` / `SettingsConfirmationDialog.tsx` / `SettingsWindowAccessibility.css` | 独立 Settings 的八分类页面组合、本地条目筛选、正式偏好与领域任务控制器、应用更新状态、共享确认弹窗适配，以及键盘焦点 / 长文案 / 减少动态效果；直接复用 preload 白名单，不持有第二份持久化、目录、缓存、快捷键、诊断、运行时或模型服务。窗口材质通过白名单偏好链选择 Acrylic / Mica，并同步刷新 stable 三窗口或回退安全纯色；字体大小通过正式偏好链在 12–16px 五档间选择并同步 stable 窗口；新版快捷列表只显示五项窗口动作与目录循环并读取 stable 专用快捷配置 |
| `lineWindowController.ts` | 复用同一个透明、不可聚焦的 line BrowserWindow；line 位置只根据当前显示器任务栏占用的 work area 方向推断，无法判断时回退底部，不跟随主窗口停靠记录；按动态 placement 在上下显示横线、左右显示竖线，根据真实窗口尺寸二次校正 bounds / shape，并向专用 Renderer 同步方向 |
| `dockedShellController.ts` / `dockedShellAutomation.ts` / `previewDockedShell.ts` / `windowLayerController.ts` | 主窗口与预览窗口共用的边缘收起控制器、通用生命周期装配、预览专用适配与窗口层级仲裁：仅在距离非任务栏边缘 5 DIP 内判断为停靠、管理各自 dock session、固定暂停、收起态展开 bounds 更新、以原生越界 bounds 保留 5 DIP 真实边沿、以屏幕最外 2 DIP 作为即时恢复区，并独立协调持久固定、收起临时浮动层级与 line 层级；同时负责自适应鼠标轮询、交互抑制、阴影恢复、programmatic move / resize guard 与显示器配置变化后的安全展开夹取；不新增 Renderer IPC，额外调试快捷键仅主窗口开发版注册 |
| `directoryStore.ts` | 已添加目录配置、目录显示名、用户排列顺序与原子持久化；顺序调整只交换配置数组位置，不触碰索引和源文件 |
| `runtimeDiagnostics.ts` / `runtimeDiagnosticsBootstrap.ts` | 低开销 JSONL 轮转、异常退出会话标记、进程资源边界快照、Electron Renderer / 子进程异常监听、窗口创建失败事件，以及只保存在本机的 Crashpad 启动；诊断失败不得阻断应用启动或退出 |
| `runtimeDiagnosticBundle.ts` / `diagnosticsIpc.ts` | 对主 Renderer 开放运行信息读取、会话级详细记录和脱敏 ZIP 导出；导出限制单文件、总体积与崩溃报告数量，不接收 Renderer 任意路径 |
| `searchIpc.ts` | 正式搜索、取消和显式刷新三个 channel 的 sender 校验与任务取消表；调用既有搜索 / 快照服务，并向运行诊断只提交查询长度、范围、排序、结果数及可选的格式聚合，不提交搜索文字或文件路径 |
| `directoryAddService.ts` | Settings、skim、拖入与未来入口共用的目录候选转换、规范化、去重、父子包含检测和结构化添加结果 |
| `formatCapabilities.ts` | 文件扩展名中央能力表，分别声明增强浏览、通用索引、正式搜索、缩略图、预览 Provider、AI 能力和确定性自然类别，并作为未来 skim 精简范围、通用文件扫描白名单、现有视觉格式集合及自然类别查询的唯一扩展名来源；自然类别可同时表达文档 / 文本、Office 子类和设计源文件等稳定集合，不以模糊文件名推断类型；未登记格式仍可在 skim 使用通用能力显示 |
| `skimBrowseService.ts` | skim 的磁盘枚举、当前一级全部普通文件元数据读取、可选格式能力附加、面包屑构建与协作式取消 |
| `skimPreviewService.ts` | skim 文件/文件夹元数据读取、已添加目录范围判断，以及不跟随链接的受控并发后代统计 |
| `skimContentPreviewService.ts` | TXT/MD/INI/HTML 与 CSV/JSON/XML/YAML/YML 限量源码文本读取、DOC/DOCX 正文提取、UTF-8/UTF-16 编码边界，以及 FLAC/M4A/MP3/OGG/WAV 与 MKV/MP4/MOV/WEBM 媒体 MIME 和单段 Range 校验 |
| `imageScanner.ts` | 对已添加目录执行一次支持协作取消的受支持格式递归扫描，排除应用缓存目录，同时产出通用文件记录和视觉文件子集 |
| `searchPathEvidence.ts` | 统一查询拆词、路径规范化、SQL LIKE 转义、相对目录证据和根目录真实名称 / 用户显示名称匹配语义 |
| `searchQueryPlanner.ts` | 在不改变空格分词规则的前提下，把明确的文件类别、Office / 设计格式族、本地日历与受限模糊时间、横竖方图和精确宽高比解释为确定性条件；支持绝对月份 / 日期及今年 / 去年月，严格拒绝无效日期。同词普通文本与条件保持 OR，多词保持 AND，数据库与临时扫描共用同一查询计划 |
| `searchEvidenceMatcher.ts` / `searchEvidenceTypes.ts` | 对每个查询词记录全部现有命中来源、确定性条件证据、最优来源和最弱必要来源；只返回来源枚举与查询词，不复制原始私人元数据文本 |
| `searchRankingPolicy.ts` | 根据每词最优来源向量比较可信度；不读取文件系统、不保存最终分数，同一向量继续交给用户选择的名称 / 修改时间排序 |
| `searchScanSnapshotService.ts` | 按已添加目录维护 15 秒内存扫描快照，合并并发扫描请求，并处理显式扫描注入、目录变更失效和离开内容视图 / 失焦取消 |
| `sqliteImageIndex.ts` | SQLite 初始化、`files` 通用目录层、`images` 视觉事实层、路径证据迁移与备份、统一关联搜索、事务编排和统计 |
| `indexMetadataStore.ts` | `file_user_metadata` 用户元数据与 `image_ai_metadata` AI 元数据的独立 schema、旧混合字段一次性迁移、读写及级联所有权 |
| `embeddedMetadataTypes.ts` / `embeddedMetadataPolicy.ts` | 嵌入搜索证据的稳定类型与“文件类别 × 字段类型”白名单；只把用户可能用于找文件的内容描述、人工描述字段、规范化软件家族、拍摄设备、媒体身份和字体身份转成受限搜索文本 |
| `embeddedMetadataExtractor.ts` | I6a 只读嵌入元数据提取器；受限读取 PNG ComfyUI/A1111 正向内容、MP4 结构化 Prompt、标准 EXIF/XMP/IPTC、PSD/PDF/AI 头尾 XMP 与字体内部名称，不保存负向 Prompt、workflow、模型参数或整块原始元数据 |
| `embeddedMetadataStore.ts` | 稀疏的嵌入元数据处理状态和高价值证据 Store；状态与证据分表、按文件级联、以 source revision / extractor version 失效，并用 savepoint 原子替换单文件结果 |
| `visualPropertyTypes.ts` / `visualPropertyAnalyzer.ts` | I8a 低级视觉事实类型与纯 RGBA 分析器；输入最多 300 x 300，Alpha 独立统计，其他属性忽略不可见 RGB，并把 Alpha、粗颜色族及连续色块、明暗、饱和度和外围背景量化为 0–10000 定点整数；不读取文件、SQLite 或自然语言词典 |
| `visualPropertyStore.ts` | 单行紧凑 `file_visual_properties` Store；固定数值向量与 source revision、analyzer version、成功 / 失败状态共表，按文件级联且不保存关键词、搜索文本、复杂度或图像哈希 |
| `visualPropertyService.ts` / `visualPropertyWorker.ts` / `visualPropertyRuntime.ts` | I8b 视觉属性后台增量链路；监听正式搜索代表图成功与删除事件，自动优化发现的同一既有缓存身份每次进程只通知一次并在大量发现时分批让出前台；候选先批量核对文件 / 源 / 算法版本，再由单个低并发 Worker 解码既有 300px 缓存、批量写库并隔离单项失败；不阻塞缩略图返回，也不接搜索词或结果分类 |
| `embeddedMetadataService.ts` / `embeddedMetadataWorker.ts` | I6b 后台增量队列与可终止 Worker；自动增量在窗口聚焦时限速、失焦时恢复正常速度，Settings 显式补齐保持正常速度；每个候选隔离读取并在完成后回收 Worker，避免异构解析器长期复用造成内存累积；结果小批量原子写入，取消保留已落盘批次，文件级失败不阻断后续候选 |
| `embeddedMetadataPreviewProbe.ts` | Skim 单文件临时嵌入信息探针；仅在正式 Store 缺少当前源版本的处理状态时复用隔离 Worker，预览先显示、结果随后按会话和路径校验补入，不写数据库，切换、关闭或超时立即终止 |
| `embeddedMetadataRuntime.ts` / `embeddedMetadataIpc.ts` | 嵌入元数据运行期装配、扫描后增量入队、目录删除协作、主窗口与独立 Settings sender 校验、显式补齐 / 取消 IPC，以及向两窗口同步任务状态；避免继续把领域编排堆入 `main.ts` |
| `imageDimensionTypes.ts` / `visualSourceDimensions.ts` | 源图尺寸索引的稳定任务类型与受限只读能力；直接读取 JPG、PNG、WEBP、AVIF、TIFF、GIF、SVG、BMP 的元数据或安全文件头，遵循 EXIF 方向，不解码整张像素、不生成缩略图，也不覆盖非视觉格式与依赖 Shell 的可选格式 |
| `imageDimensionService.ts` / `imageDimensionWorker.ts` / `imageDimensionRuntime.ts` | 启动候选发现与扫描后增量补齐 `images.image_width / image_height` 的低优先级单 Worker 链路；独立于自动缓存开关，前台窗口活动时限速推进，按 source revision 去重与拒绝迟到结果，批量写库并在目录删除时丢弃候选 |
| `imageSearchService.ts` | 并行读取统一 SQLite 结果与内存扫描快照，补充尚未持久化的新文件、按完整快照核对存在性并按路径去重；只有视觉结果生成缩略图 URL |
| `fileSourceRevision.ts` | 根据文件大小与修改时间生成轻量源文件版本，并附加到搜索缩略图 URL；主动刷新后只使真实变化文件重新请求派生缩略图，未来元信息提取可复用同一失效依据 |
| `visualCacheService.ts` | 正式与 skim 视觉缓存的路径、按源文件元数据、渲染来源和内部版本生成的键、有效性检查、原子写入，以及分组统计与清理 |
| `skimVisualCacheService.ts` | skim 原生视觉队列与 Shell 缩略图队列的会话协调、预览优先级、目录切换取消、迟到结果保护及安全清理 |
| `searchShellVisualCacheService.ts` | 搜索结果页按当前渲染项请求系统相机格式缩略图与预览，维护独立于 skim 的缓存、串行队列、活动门控和失败抑制 |
| `lineWindowController.ts` | 独立 line 窗口的创建、延迟加载、显示、隐藏、销毁、定位、形状、置顶与发送者归属；主进程只注入当前状态和偏好判断 |
| `shellThumbnailProvider.ts` | 调用 Windows Shell、WIC 或已安装第三方处理器生成文件内容缩略图，并按调用方写入相互隔离的 skim 或搜索系统图像缓存 |
| `shellThumbnailScheduler.ts` | Shell 缩略图的独立串行队列、请求去重、前后台暂停、会话取消、失败抑制和超时熔断 |
| `visualRenderService.ts` | 统一调度各格式代表图、模型图和预览图渲染 |
| `thumbnailService.ts` | 搜索结果缩略图缓存入口；交互式失败按源文件版本在当前进程内抑制，文件变化、目录 / 文件缓存删除或手动清理后解除，最小化及隐藏窗口只丢弃尚未领取的交互式请求，不中断已开始的单文件渲染或后台优化 |
| `thumbnailOptimizationService.ts` | 最低优先级串行预生成搜索缩略图；主窗口、Settings 或预览窗口聚焦时仍保持单任务但显著延长任务间隔，窗口失焦、隐藏或进入后台后恢复正常速度；启动时若开关已启用则复用目录发现链重建内存队列，并以独立 `discovering` 阶段覆盖扫描和候选筛选，再按现有缓存身份跳过已完成项；既有缓存只在本次进程首次发现时通知下游，批量通知定期让出事件循环，避免搜索重复产生视觉属性发现风暴；同时支持排序、显式暂停、取消、进度状态，以及按完整缓存身份进行单次运行失败抑制，文件变化、进程重启或重新开启自动优化后允许重试 |
| `thumbnailOptimizationDiscovery.ts` | 自动优化目录发现队列；串行调用主进程注入的目录扫描能力，把扫描结果转换为候选并维护 `discovering` 生命周期，隔离取消与单次扫描失败，不拥有窗口或缓存生成逻辑 |
| `thumbnailFailurePolicy.ts` / `thumbnailFailureResponse.ts` | 搜索缩略图失败的稳定错误码、短时间诊断限流与协议失败响应；预期取消和已缓存失败不重复写日志，连续不同文件失败只保留少量明细和一次风暴标记，不改变 Renderer 的格式图标回退语义 |
| `pdfRenderService.ts` | PDF 首页渲染 |
| `pdfPreviewService.ts` | PDF 独立预览会话、页面串行渲染、可取消切换、最多 5 页 LRU 内存缓存和渲染安全上限；不写入正式或 skim 缓存 |
| `officePreviewService.ts` | XLS/XLSX 与 PPT/PPTX 通过本机 Microsoft Excel/PowerPoint 只读转换为会话临时 PDF；负责大小上限、30 秒超时、精确终止本轮拥有的转换进程、切换取消和临时目录清理 |
| `archivePreviewService.ts` / `archivePreviewWorker.ts` | ZIP、7Z、RAR 只读条目列表；通过可终止辅助进程中的 7-Zip WebAssembly 执行结构化列表命令，限制源文件大小、输出量、条目数、路径长度和时间，切换或关闭预览即终止进程 |
| `fontPreviewService.ts` / `fontMetadataWorker.ts` | TTF、OTF 会话字体预览；在可终止 Worker 中使用 OpenType.js 读取本地化名称、样式、字重、字符覆盖和可变轴摘要，限制文件大小与时间，不在主进程同步解析字体 |
| `epubPreviewService.ts` / `epubPreviewWorker.ts` | EPUB 会话内容预览；在可终止 Worker 中限制压缩条目数、单条目与展开总量，严格读取容器和 OPF 结构，再以容错 HTML 解析提取书名、作者、封面及连续纯文本章节，不执行书内脚本、CSS 或网络资源 |
| `mobiPreviewService.ts` / `mobiPreviewWorker.ts` | MOBI6 会话内容预览；主进程预检扩展名、文件类型与大小，在可终止 Worker 中严格校验 PalmDB/MOBI 记录边界、加密标记、版本、编码和压缩方式，再提取受限封面及连续纯文本章节 |
| `psdRenderService.ts` | PSD 合成图和多画板代表图处理 |
| `vectorDocumentRenderService.ts` | AI / EPS 兼容预览数据处理 |
| `cdrRenderService.ts` | 现代 CDR 内置预览图读取 |
| `llamaRuntimeStore.ts` | llama.cpp 版本发现与选择配置 |
| `llamaRuntimeManager.ts` / `llamaRuntimeIdleController.ts` | llama-server 进程生命周期、健康检查、手动 / AI 启动所有权与 AI 空闲回收策略 |
| `ggufModelStore.ts` | GGUF 主模型与 mmproj 扫描、配对和选择 |
| `llamaVisionRuntime.ts` | 按需 AI 能力共用的视觉运行时连接入口；复用已就绪服务，否则按现有配置启动并验证视觉模型 |
| `aiSearchCandidateService.ts` / `aiSearchSingleImageModel.ts` / `aiSearchService.ts` | AI 增强搜索 Beta 的候选规划、1024 最低视觉 token、简短单图单条件评分、程序求交集、逐条件短路与用户暂停检查点；确定性条件先缩小范围，基础结果不等待 AI，未暂停的任务持续至完成 |
| `aiSearchImageInput.ts` / `aiSearchIpc.ts` / `aiSearchRuntime.ts` | 300px 单图输入、受限 AI 搜索 IPC 与主进程依赖装配；复用通用视觉运行时，不把实现堆入 `main.ts` |
| `aiQueryEvidenceStore.ts` | 每文件正向查询确认词的紧凑存储、去重上限、源 / 模型 / 提示词版本失效与级联删除；Beta 准确性测试期间持久化关闭，旧查询标签不参与普通搜索 |
| `fileOperationService.ts` | 路径复制与回收站删除 |
| `fileDragService.ts` | Windows 原生单文件 / 多文件拖拽 |
| `staleImageCleanupService.ts` | 源文件缺失后的索引与缓存清理 |
| `staleFileCleanupService.ts` | 通用文件目录层中缺失源文件的记录清理，不触碰视觉缓存 |
| `preferenceStore.ts` | 主题、颜色、快捷键、标签显隐、待机线与边缘收起等偏好；窗口宿主固定为 stable，旧配置中的窗口模式、窗口记忆和已退役快捷动作字段只被安全忽略或映射，不回写也不删除用户文件；高频窗口 bounds 不进入该文件 |
| `localization.ts` | 主进程与 Renderer 共用的界面文案 ID、中文语言表和参数插值入口 |

## 4. Preload / IPC 架构

`electron/preload.ts` 使用 `contextBridge` 统一在 `window.cap7ce` 暴露安全 API。Renderer 只通过这一命名空间调用主进程，不能直接访问 Node；不保留旧 `window.imageEverything` 别名，避免未来 API 继续扩散历史项目名。

当前 IPC 类型大致包括：
- 窗口：主窗口显示 / standby 隐藏、默认几何恢复、Skim 展开切换、独立 Settings 打开，以及最小化、关闭、置顶、最大化状态同步。
- 托盘与后台：显示 / 隐藏待机线、打开设置、真正退出。
- 设置：主题模式、主题色、副色、边缘收起、待机线显示、标签显隐、快捷动作、快捷指令开关。
- 目录：添加目录、删除目录、更新显示名、列出目录。
- 文件操作：打开、定位、复制纯文本路径、通过 Windows PowerShell `Set-Clipboard -LiteralPath` 写入系统文件剪贴板、移入回收站和启动原生多文件拖拽；文件剪贴板路径通过 UTF-8 标准输入传递，不拼接到命令行。
- skim：枚举本机文件系统盘符、校验统一输入提交的完整绝对目录路径、读取当前位置的直接子项、检查项目元数据、启动/取消文件夹后代统计并向预览窗口推送节流进度。
- 应用：退出进程、通过固定主进程链接在系统浏览器中打开 GitHub Releases；用户点击检查更新时，由主进程查询固定 Cap7CE GitHub Releases API、筛选受限命名的 Windows x64 ZIP，并在行内提示更高版本。用户再次点击“立即下载”后，主进程才从检查阶段缓存的受限 URL 下载到系统临时目录并向 Renderer 推送进度；下载完成后启动打包资源中的可见 PowerShell 更新助手并正常退出应用。Renderer 不传入任意外部 URL，也不能指定下载或安装路径。
- 扫描与索引：扫描目录、写入索引、继续识别、全部更新、单目录识别。
- 搜索：关键词搜索、空搜索、目录与格式筛选、可信度分类、排序和按需 AI 增强。
- 缓存：缩略图、预览图、模型输入图，以及三类视觉缓存的统一统计与清理。
- 独立预览：打开、关闭、切图、内容尺寸回报、预览数据同步及受限文件操作请求。
- 文件操作：打开文件、打开路径、复制路径、拖拽、删除。
- llama.cpp：运行时扫描、选择、启动、停止、状态订阅。
- 模型：GGUF 模型目录扫描、模型刷新、模型选择。

新增 IPC 时必须同步 `electron/preload.ts` 与 `src/renderer/vite-env.d.ts`，避免 renderer 使用未声明 API。

`electron/ipcRegistration.ts` 提供领域 IPC 注册的基础边界：同一领域内 channel 必须非空且唯一，invoke 与 event 参数原样交给领域 listener，并允许装配层注入 sender 授权判断；未授权 invoke 明确拒绝，未授权单向 event 不进入业务 listener。该注册器不依赖 `main.ts`，后续文件、目录、偏好与缓存等外围领域迁移时由主进程显式注入 registrar、sender 边界和业务依赖。窗口与 preview 生命周期 IPC 继续保留在 `main.ts`；line 激活入口同样留在装配层，但窗口实例只由 `lineWindowController.ts` 持有。line 单击通过受限 `line:activateMain` 入口复用主窗口显示与搜索聚焦链，不再存在 Capsule 专用 IPC；主窗口自身自动收展仍完全由主进程装配。

目录添加统一接收候选路径集合。文件候选转换为直接所在目录，目录候选保留自身；主进程按 Windows 大小写不敏感规则规范化、去重和归并，过滤磁盘根目录，并分别返回成功、忽略、父子冲突与失败项。新父目录包含已有子目录时，Renderer 必须先显示确认弹层；确认后用父目录替换子目录配置，并在同一添加协调链中把已有 SQLite 图片记录迁移到新目录 ID，保留识别和手动关键词数据。索引迁移失败时回写原目录配置，使本次操作可以重试；如果回写本身失败，则记录告警并继续抛出原始迁移错误。

新增目录与用户主动刷新目录时，必须由同一次扫描同时更新目录配置中的文件数量、SQLite `files` 通用目录层和 `images` 视觉层，再刷新 Renderer 统计；当前开发阶段不为旧数据库另设迁移或补扫分支。建立文件目录层本身不会自动启动 AI 识别。

后台嵌入元数据、视觉属性、尺寸、动画事实或 AI 查询确认词写入后，通过统一索引变化通知刷新已加载的真实结果查询，不导航离开当前页面或重置滚动位置。结果项中的 `caption` / `aiKeywords` 来自 AI 证据，`keywords` 来自用户元数据；关键词编辑只读取并保存人工数据，不得把任何 AI 结果回写为人工关键词。

## 5. Renderer 架构

`src/renderer/App.tsx` 当前承担 0.9.9 的应用级状态和交互编排，产品主窗口的展示结构由 `StableUiRoot` 持有：
- 稳定搜索输入与统一提交流程；快捷指令优先，其次识别盘符或 UNC 开头的完整 Windows 文件或目录路径并在主进程确认真实可读后进入 skim，文件路径取其父目录，其余内容执行正式搜索。路径校验失败时保留原输入并显示临时提示。
- 稳定主窗口接收资源管理器单个或多个文件夹拖入；preload 仅通过 Electron `webUtils.getPathForFile()` 提取拖放文件对象的真实路径，Renderer 先复用全窗口确认层，再把确认后的集合交给统一目录添加服务。
- 左侧栏提供查看范围、目录、排序和 AI 增强控制；正式搜索入口与结果页不再提供识别状态、动态文件格式标签或显隐菜单，扩展名继续作为普通搜索词使用。skim 按“查看范围、排序、面包屑”排列，使排序入口在两种内容视图中均位于第二项。
- 稳定主窗口使用统一响应式结果网格；AI 分类卡只参与布局，不作为滚动锚点。非空普通结果按“快速匹配、可能相似、AI 深度匹配”展示。结果页“AI增强”标签和输入开头的 `7ce/` 进入同一 Beta 控制器：基础搜索始终先返回，AI 对本轮未命中的视觉候选逐图逐词短路判断并渐进追加，未暂停时持续执行至完成。AI 分类卡即使尚无命中也可作为纯布局项显示运行状态，整卡只负责暂停及从安全检查点继续；顶部标签只做总开关，关闭会彻底丢弃本次任务检查点但保留已到达结果。新查询或候选范围变化废弃旧会话，单纯排序保留现有结果。明确确认的原始视觉词可写入版本化查询缓存，模型响应和图片不落盘。业务结果、选择、Shift 范围、预览、复制、拖拽、删除和关键词编辑仍只使用纯文件数组；分类标题卡不进入业务文件数组。通用文件卡片和 skim 条目的长文件名复用右键菜单的中间省略拆分规则，保留名称首尾与扩展名。用户把结果页输入框中的非空关键词清空后立即执行当前筛选范围的空查询并返回默认网格；快捷命令与 skim 的程序化清空不进入该路径。
- skim 作为稳定主 Renderer 内的并排浏览面板，不创建旧主窗口页面状态。主左侧栏与 Skim 右侧栏的用户宽度由 `useStableShellSizeMemory.ts` 在 Renderer 本地记忆，拖动停止后短防抖写入；窄窗口只按现有响应规则临时限制实际显示宽度，不覆盖已保存的原始宽度，存储缺失或损坏时分别回退 176px 与 360px。所有内容视图中的输入提交使用同一语义：快捷指令优先，完整 Windows 绝对目录路径经主进程校验后进入对应 skim 位置，普通关键词与空输入进入统一结果页。从磁盘列表开始，只读取当前一级文件夹和全部普通文件，不递归读取后代；符号链接、特殊项目和读取失败项目继续跳过。通用条目携带路径、扩展名、大小、修改时间、已添加目录归属、可选格式能力及临时状态；已登记格式使用 `format-*` 专用图标和对应 Preview Provider，未知格式及无扩展名文件先使用通用文件图标与文件信息预览。当前视口内不由原生视觉渲染器处理的普通文件可按需尝试 Windows Shell 内容缩略图，失败仍静默保留图标。文件夹与文件支持单选、Ctrl/Shift 多选、活动项、共用右键菜单和多文件原生拖出；普通单击只负责选择，格式、文件名、大小及可选尺寸摘要显示在右键菜单顶部。文件夹统计在菜单打开后延迟启动并随菜单关闭协作取消，常见栅格图片仅读取受限元数据，不触发 RAW 或文档渲染。添加操作复用统一目录服务。全部显示不扩大正式索引、正式搜索缩略图或 AI 边界，未来精简范围与动态格式筛选在独立状态中实现。
- 主窗口与预览窗口发出的 Skim 切换动作统一展开或收起稳定 Skim 边栏；系统位置、星标目录和磁盘入口由稳定 Skim 根页面直接展示。skim 右键“加入边栏”将文件夹本身或文件父目录去重后写入偏好，已全部存在时禁用；星标目录提供“取消快速访问”。
- 缩略图 hover / selected 黑色蒙版、单选、多选、键盘焦点；正式结果长按空格的 350 ms 计时必须跨结果数据及回调刷新保持，只有真实失焦、选择变化、视图切换或其他浮层出现才取消，避免视觉进度完成但动作丢失。搜索结果与 skim 的非盘符选择支持 `Ctrl+C` 写入 Windows 文件剪贴板，单选、多选及文件夹共用同一主进程校验入口，输入框、文本域、下拉框和可编辑内容不拦截原生文字复制。
- 搜索结果、skim 与独立预览窗口共用“查看 / 操作”两级右键菜单；`src/renderer/fileContextActions.ts` 统一构造通用查看 / 操作菜单项、快捷键标注与组合键解析，搜索结果继续负责多选语义，独立预览只处理当前会话单项，不新增 IPC 或合并两套窗口生命周期。一级菜单顶部是无按钮样式的紧凑文件摘要，尺寸、大小及内容统计仅显示结果值，不重复字段名称，预览会话统一携带当前文件大小供专用与通用 Provider 使用，文件夹则显示异步统计的总大小；文件夹内容使用“文件数 文件 / 文件夹数 文件夹”的紧凑格式，并保持两个动作入口。弹出一级菜单时按最终双列宽度约束整体位置，悬停入口后同一外框固定向右扩为双列，一级内容保持原位，第二列切换显示当前组动作并限制在当前窗口内。复制路径通过受限主进程剪贴板入口写入绝对路径，多选时使用 CRLF 逐行写入；正式搜索中的视觉与非视觉文件均可编辑关键词或删除并支持混合多选，独立预览把动作转回当前正式搜索结果并支持相同快捷键，预览菜单打开时 `Esc` 优先关闭菜单，正式搜索预览长按空格后在松键时转入关键词编辑；skim 的“添加目录 / 加入或移出边栏”分别使用 `Ctrl+Shift+D / Ctrl+Shift+B` 并复用当前多选范围，存在未加入项时只添加缺少目录，全部已加入时只移除用户收藏，系统固定位置保持不可移除，临时条目仍不扩大编辑与删除权限。
- 独立预览窗口的打开入口和预览数据协调；正式搜索与 skim 共用同一个 `BrowserWindow`、`PreviewWindowApp.tsx` 和尺寸计算链，后者通过 provider 字段渲染视觉内容、文件/文件夹信息、纯文本、音频、视频或 PDF。Preview Renderer 只装配稳定标题栏、稳定内容壳与 `PreviewInformationSidebar.tsx`；边栏由 `usePreviewSidebarLayout.ts` 记忆展开状态，只提供固定 280px 展开与固定 40px 收起两种宽度，窗口缩放不隐式改变边栏状态或宽度。结果页已有的文件属性、手动元数据和搜索依据随现有 Preview DTO 传入，嵌入信息继续由主进程异步读取并统一在边栏展示，边栏自身滚动不触发文件导航。PDF 使用连续纵向页面流，Renderer 渐进挂载页面占位并只请求视口及邻近页，远离页面释放图片；`usePdfPreviewZoom.ts` 仅通过页面布局尺寸和锚点滚动补偿提供适合宽度、工具栏、Ctrl+滚轮与右键拖动缩放，并在放大后以左键拖动已有滚动视口，不改变主进程渲染和缓存键。普通滚轮、触控板、自绘滚动条及 PageUp/PageDown 滚动文档，左右方向键继续切换文件。XLS/XLSX 与 PPT/PPTX 的 `office` Provider 仅负责在主进程完成临时 PDF 转换，成功后转入同一 `pdf` Provider 并共用文档缩放，不新增 Office 专用 Renderer。页面图片仅能通过绑定原始预览项目与会话的 `cap7ce://pdf-page` 协议读取，主进程串行渲染并保留少量 LRU 内存缓存，快速切换时取消旧会话，解析、转换或渲染失败回退文件信息。skim 的异步检查和内容解析使用视图级请求代次保护，切换预览、关闭预览或卸载 skim 时作废尚未提交到主进程的旧请求，避免迟到结果重新隐藏主窗口；开发版主进程为打开、显现和关闭预览输出来源、会话及窗口可见状态，打包版不输出。文件夹统计只在显式预览后启动，切换项目、关闭预览或退出 skim 时取消；已提交的单次文件系统调用允许返回，但任务停止领取新目录并忽略迟到更新。音视频切换、窗口隐藏或关闭时显式暂停并释放当前媒体源。
- 稳定 UI Preview 的快速交互由 `usePreviewImageTransform.ts`、纯几何模块 `previewImageTransformMath.ts` 和 `previewNavigationTarget.ts` 隔离实现：前两者只管理图片画布的指针中心缩放、右键上下拖动连续缩放、溢出判定、受限平移与容器变化夹紧，不进入 Provider 读取或缓存；后者统一抑制边栏、菜单、输入与媒体控件上的文件导航。文档 Provider 保留各自滚动，普通画布滚轮和左右键继续调用既有 Preview 导航。自由窗口沿用内容尺寸计算，主进程在最大化或 Windows Snap 时拒绝改写 bounds。
- 完整嵌入元数据不附加到搜索结果；主进程只在打开单个空格预览时按文件路径读取稀疏证据并返回专用 DTO。预览请求统一携带文件大小与修改时间，使正式搜索和 skim 都能按同一源版本契约读取当前证据；Preview 统一由信息边栏中的 `PreviewEmbeddedMetadata` 展示，没有证据时不渲染入口。相关组件与样式分别位于 `src/renderer/preview/PreviewEmbeddedMetadata.tsx` 和 `PreviewEmbeddedMetadata.css`，不继续扩大预览主样式入口。
- 单选 / 多选关键词编辑面板与批量结果反馈。
- Settings 页面与配置项展开。
- 基础行为设置中的“系统通知”半宽开关通过 preload 白名单 IPC 持久化，默认开启；line 与边缘收起使用四分之一宽，其他基础行为项保持半宽。
- 主题模式、主题色、副色和 CSS 变量绑定。
- `ColorPickerPopover.tsx` 提供 Renderer 内的主题色 / 副色自绘拾色器；颜色变化先实时更新界面预览，点击浮层外部后才调用原偏好保存入口，`Esc` 关闭时恢复打开前的颜色，不新增 IPC。
- 快捷动作 UI、全局快捷键配置与窗口内快捷键监听；Skim 展开时默认取得键盘归属，随后由最后点击或聚焦的搜索结果 / Skim 内容区独占网格方向键、空格预览、选择取消与文件快捷键，收起后归属自动返回搜索结果，避免并排视图抢占输入。
- 快捷动作录入候选态、内部重复与主进程实际可用性提示。
- 快捷指令解析、执行分流和 y / n 确认态。
- 大型文件预览和批量删除的统一等待反馈。
- 查看范围状态、缩略图、菜单、按钮、弹层、预览换图和 Settings 展开项的统一交互动效与减少动态效果降级。
- 轻提示、菜单、浮层和局部状态管理。
- standby 不保存临时弹层上下文；从后台重新唤起时只恢复原内容视图，不恢复未提交的编辑或确认层。关键词编辑在正常可见窗口内取消时仍保留原有退场动效和结果滚动位置恢复规则。

`src/renderer/styles.css` 是 0.9.9 UI 的全局样式入口，保留统一窗口壳层、共享菜单、主题变量、动态窗口过渡与兼容规则；`src/renderer/typography.css` 只持有新版跨窗口共用的字体族、六级语义字号及对应行高变量，`src/renderer/typography.ts` 将持久化的 12–16px 基准写入文档根变量，使主窗口、Skim、稳定 Preview、独立 Settings、Portal 标题栏、响应式菜单和窗口内弹窗实时消费同一规范；旧 Cap7CE / compatibility 宿主固定使用 13px 基准，文件内容预览继续保留各 Provider 的独立排版。独立页面、设置区块、关键词编辑、预览、滚动条和等待状态样式由对应领域文件持有。Settings 可操作按钮统一提供经过审校的本地化 `title` 悬停说明；状态开关根据当前状态描述下一次点击结果。“版本与更新”行显示当前版本，仅在用户点击时检查更新；发现新版后显示版本号并将按钮切换为“立即下载”，再次点击才在行内显示下载进度。自动替换仅在打包版启用：主进程在本轮下载目录之外生成内容严格为 ASCII 的 VBScript 启动器，将安装目录等可能包含非 ASCII 字符的内部参数放入 UTF-16LE PowerShell 编码命令，再通过 Windows Shell 以隐藏窗口独立运行固定绝对路径的 Windows PowerShell 更新助手，既避免系统代码页破坏中文路径和参数边界，也避开 detached PowerShell 不执行脚本、普通子进程随 Electron 退出终止、助手删除仍在执行的启动器及用户误关命令行四种边界；更新助手先解压并校验 ZIP 内的 `Cap7CE.exe` 与 `resources/app.asar`，写出就绪信号后主进程才退出。助手预检失败会写出 `helper-failed` 信号；启动器无法打开、助手失败或未在时限内就绪时，主进程保持运行、删除本轮临时下载，并将主进程错误及已有助手输出写入系统临时目录中的 `Cap7CE-update-last-failure.log`。助手接管后等待旧进程退出，再备份当前程序目录、复制新版并保留用户自行放置的 `models` 与 `llama.cpp`；新版无法稳定启动时恢复备份并重启旧版，成功后删除备份及临时下载，隐藏启动器由重启后的新版延迟清理。下载流连续 60 秒没有新数据时主动取消本轮下载、删除不完整 ZIP 并在 Settings 行内提示重试，避免网络停滞后无限等待。该流程不后台检查或下载，也不修改 `%APPDATA%\Cap7CE` 用户数据；未来安装包更新策略应继续复用相同的检查、确认与进度状态，只替换主进程执行器。普通界面默认禁止文本选择；`input`、`textarea` 和 `contenteditable` 保留文本选择、复制、剪切、粘贴和 Ctrl+A。

D0 将 U1 的开发隔离根节点提升为正式第三种 presentation：主进程在开发服务与打包 `loadFile` 中都传入实际 `presentation`，`src/renderer/main.tsx` 仅在 `presentation=stable` 时动态装配新版主界面，`PreviewWindowApp.tsx` 使用同一判定装配稳定 Preview；cap7ce 与 compatibility 继续进入旧 Renderer。`stable-ui/StableUiFoundation.css` 独立持有新版间距、圆角、表面透明度、文字层级、标题栏安全区和滚动条变量，`StableUiAccessibility.css` 持有主内容与 Portal 标题栏的焦点及减少动态效果规则，不修改旧全局样式。`WindowPinButton.tsx` 持有兼容主窗口、兼容 Preview 和新版标题栏共用的图标、可访问状态及鼠标失焦行为；Settings 不装配该按钮。stable 使用正式 `window-layout-stable-ui.json` 并按用户偏好持久化置顶；不套用旧 micro / mini 界面状态，在 resize settle 前旁路旧形态推断和 micro 位置修正。缺失或非法偏好默认 stable，已有 cap7ce / compatibility 偏好、旧布局、旧 Renderer 和旧状态机均不迁移、不删除。

D1 固定 stable 首次内容边界：目录与偏好加载完成且 `useContentViewActivity.ts` 收到主进程的前台内容活动确认后，`App.tsx` 只触发一次空查询、全部目录、全部格式的正式搜索，并保留用户排序偏好；确认链保证实时扫描先恢复再发出搜索，失焦、隐藏及快速焦点切换仍取消或拒绝迟到确认，不恢复冷启动索引写入，也不绕过扫描与缓存的后台节流。`useStableShellLayout.ts` 默认关闭 Skim 且不在挂载时读取位置，只有用户点击左下角 Skim 按钮后才调用唯一的 `useSkimReadController`。stable 空结果使用非交互文案容器，不显示进入 Skim 的引导，也不提供主窗口中央点击热区；旧宿主的空状态行为保持不变。

D2 补齐 stable Preview 的原生窗口边界：`StablePreviewTitlebar.tsx` 通过共用 `WindowTitlebarPortal` 将 40 DIP 拖动区与内容、滚动和动画树隔离，并复用 `WindowPinButton` 与现有 Preview 固定动作；固定按钮自身明确为非拖动区。Preview `BrowserWindow` 只在 stable presentation 下启用 Windows 原生最小化并加入任务栏，避免原生最小化因 `skipTaskbar` 退化成无法从任务栏恢复的隐藏状态；旧 cap7ce / compatibility 继续保持既有能力。`StablePreviewTitlebar.css` 清除旧透明 Preview 根节点的边框与窗口圆角，由 Windows 有框窗口独占外缘；`StablePreviewShell.css` 让 stable 内容区使用自身的 5px 内边距，不再为已经移除的旧控制栏预留右侧宽度。Provider、导航、尺寸计算和边栏数据链均未改变。

D3 开始按稳定空壳收口正式视觉参数，但不改变搜索与 Skim 的数据所有权：左侧栏使用主题感知的正式矢量标志并恢复目录节奏；共享虚拟网格计算接受可选目标尺寸与最小列数，stable 搜索保持约 150px 且窄窗至少两列，stable Skim 独立使用约 120px，旧宿主继续沿用原 150px 规则。两种 stable 网格统一使用 5px 间距、四边等效 10px 页内留白和 8px 卡片圆角，主内容表面使用 12px 圆角；纵向与低高度横向自绘滚动条分别占据网格右侧和底部的独立 8px 区域，其外保留 2px 留白，低高度隐藏侧栏后内容表面在窗口左边缘补齐 5px 外间距，滚动记忆、选择、文件动作与横向布局保持原链路。

D4 对齐 stable Preview 信息栏的视觉组合，不建立第二套预览数据或动作：`PreviewInformationSidebar.tsx` 仍消费 `previewSidebarData.ts` 的文件概况、手动关键词、搜索依据和嵌入信息，并把文件名与基础属性组合为同一信息卡；`PreviewSearchEvidence.tsx` 只把既有逐词 `bestSource` 按来源合并为本地化的命中依据，不读取原始元数据正文或改变搜索分类。独立 `StablePreviewSidebar.css` 持有 40px 折叠轨道、280px 固定展开宽度、22px 信息卡、胶囊标签和单列文件操作，信息栏滚动复用全局自动隐藏自绘滚动条。边栏不再提供指针或键盘调宽，也不保存宽度或参与窄窗连续压缩；展开状态仍随既有内容尺寸消息进入同一窗口几何链，窗口在工作区允许时向外扩展以保持图像区域。文件动作、Provider 与图片变换保持原链路。

D5 只校准 stable Settings 的正式展示参数：独立窗口继续使用 860×680 默认 bounds 和 620×480 最小 bounds，`SettingsWindowApp.css` 将分类栏、搜索框、分类行、内容表面与标题对齐为 176px、34px、36px、12px 和 22px；分类图标由 `SettingsCategoryIcon.tsx` 提供统一 24px 坐标系的线性 SVG，正常分类栏显示 16px 图标加文字，700px 以下切换为 52px 纯图标轨道并显示 17px 图标。滚动区建立最大 1000px、随可用空间收缩且在右侧内容区居中的唯一内容轨道，全部分类只占满该轨道而不再各自决定宽度；共享 `CustomScrollbar.css` 对主界面外宿主使用的热区与滑块变量提供 8px / 4px 默认值，避免滚动框显式网格因变量未定义而退回按内容生成隐式列。普通设置按标题分组共用 22px 圆角背景，内部以连续透明设置行和轻分隔线容纳不同控件，复杂内容仍留在所属组内。`StableSettingsActions.css` 统一独立 Settings 中普通操作按钮的高度、圆角、表面与渐变反馈，但不覆盖开关、选择器、滑块、格式选项或导航语义；`StableQuickActionSettings.css` 将共享快捷动作编辑能力适配为常驻列表与标题行控制，`StableQuickCommandSettings.css` 将共享快捷指令说明适配为无折叠状态的响应式双列参考表，两者均不改变旧 Settings 的展开状态；`StableRuntimeDiagnostics.css` 将 stable Settings 的应用诊断整理为行式操作，并把 llama.cpp 只读状态放回“搜索与 AI”的响应式信息表，旧 Settings 的合并详情结构不变；`StableSettingsSelect` 适配共享 Renderer 自绘选择器及主界面浮层视觉，`AppearanceColorSettingsControl` 复用共享 `ColorPickerPopover` 并只在拖动时更新独立 Settings 的本地偏好预览，点击外部才沿正式偏好 IPC 持久化，`Esc` 恢复打开前状态。`useSettingsWindowController` 仅在首次初始化和显式重试时使用阻塞加载页；窗口聚焦刷新保留当前内容并静默同步，同时复用进行中的刷新 Promise，避免聚焦点击目标被卸载及重复读取。八分类、搜索过滤、领域任务控制器、跨窗口广播、确认事务及旧 Settings 均不改变。

U2 在 `stable-ui/StableMainShell.tsx` 中只组合侧栏、结果占位区与 Skim 占位区，并把各区展示拆分到独立组件；`StableMainShell.css` 持有新版响应式网格和断点，`StableShellResize.css` 持有分隔线命中与焦点，`useStableShellResize.ts` 持有宽度、视口跟踪、指针和键盘调整，不向旧全局样式入口追加规则。侧栏逻辑宽度默认 176px，与独立 Settings 导航栏保持一致并可在 40–320px 内调整；Skim 默认 360px、最小 280px 且最多占左侧栏之外主内容区的一半，双击相应分隔线恢复默认值。普通高度下，视口不超过 920px 时打开的 Skim 替换中央结果区但保留侧栏，不超过 560px 时 Skim 独占内容宽度；高度低于 360px 时隐藏侧栏并将当前占位网格改为横向滚动。U2 不读取 preload 业务 API，不装配真实搜索、目录或 Skim 数据，也不根据 micro / mini / normal 名称选择布局；这些占位区后续只能通过 U0 映射的正式动作逐轮替换。

U3 不在新版模块中创建搜索状态或直接调用搜索、Preview、文件 IPC。`App.tsx` 继续持有唯一的查询、目录偏好、任务取消、结果、选择入口、菜单和编辑事务，并通过 stable presentation 注入的 `StableUiRenderer` 展示适配边界把正式动作交给新版根节点；旧宿主继续走原 Renderer。新版输入组件只处理受控文本、IME composition 和清空查询通知，提交仍回到 `submitSearch` / `runSearch`；目录切换快捷动作在新旧宿主中共同调用 `cycleSearchDirectory`，按唯一 `directoryOptions` 顺序切换并由 `updateResultsSearchOptions` 刷新结果，不在 stable 侧栏建立第二套游标。全局“进入 Skim”动作在 stable 宿主中递增 `toggleRequestId`，由 `useStableShellLayout` 持有的唯一开关响应并复用 `onOpen` 数据入口；旧宿主继续调用原 `openSkim` 页面导航。`ResultsView`、`VirtualImageGrid` 与提取后的 `ResultsContextMenuLayer` 同时服务新旧入口，保持虚拟化、证据分组、选择、Preview、拖出、复制、关键词和删除链唯一。搜索结果与 Skim 共用 `ResponsiveFileContextMenu`：常规高度显示纵向单层菜单，高度低于 360px 时切换为“信息 + 两列动作”的三行横向布局；文件格式、首尾省略的文件名与尺寸 / 大小摘要保持独立信息层，操作项显示既有快捷键说明，菜单通过 Portal 在标题栏下方和视口四周避让，动作 ID 仍交给各自既有 Renderer 动作链执行。菜单不经过主进程 IPC，旧宿主和 Preview 继续使用既有 Renderer 菜单。新版仅向网格传递 `responsiveLayout`：高度低于 360px 时选用既有 horizontal 布局算法，其余尺寸选用 normal 算法，不读取或写入旧 shell state。稳定 UI 模块样式由 `StableSearchResults.css` 持有，共享响应菜单样式由 `components/ResponsiveFileContextMenu.css` 独立持有，不扩大旧全局样式。

U4 由 `stableUiRendererTypes.ts` 和 `stableSidebarTypes.ts` 定义显式展示适配契约，`App.tsx` 继续持有搜索、AI、目录状态和正式事务，只向 `StableShellSidebar.tsx` 传递受控值与动作。侧栏的排序、查看范围、目录筛选、系统选择添加、拖入确认、冲突替换、行内重命名和删除均复用既有搜索与目录链；新版模块不直接读取 preload，也不修改目录服务、SQLite 或 AI 任务逻辑。AI 增强入口由线框 / 实心图标和副文案表达状态，不保留重复滑动开关。`StableSidebar.css` 独立持有控制行、目录滚动、选中 / 悬停胶囊、40px 紧凑栏和底部动作布局，目录列表复用共享自动隐藏自绘滚动条；宽度仍是 `StableMainShell.tsx` 的会话状态。`StableUiIcon.tsx` 只负责从独立 SVG 资产中选择新版线框 / 实心、目录开合和旧版升降序形态并通过共用 `SvgIcon` 内嵌，不读取业务状态。Skim 底部动作在 U5 前只切换占位插槽，Settings 动作在 U6 独立宿主完成前暂时进入现有设置页。该轮抽取共用目录确认层后把 `App.tsx` 自动上限从 3334 行降到 3330 行，并为四个新增侧栏职责模块建立独立体量守门。

U5 继续由 `App.tsx` 中唯一的 `useSkimReadController` 持有路径、目录读取、会话缩略图和错误反馈，稳定 UI 只通过 `stableSkimTypes.ts` 的受控契约组合工具栏与正式 `SkimView`。嵌入模式隐藏旧搜索胶囊，但继续复用既有虚拟网格、Preview、内容预览、右键文件动作、原生拖出、复制、添加目录及边栏收藏；新模块不直接调用 preload，也不通过 `activeView` 建立第二套 Skim。工具栏提供返回、可点击面包屑、双击地址后按字符编辑路径，以及与搜索结果相互独立的 Skim 排序和查看范围。关闭右侧面板只通过 CSS 隐藏并保留组件、路径、选择和滚动状态；`active` 边界阻止隐藏面板继续响应文件快捷键。低于 360px 时 `responsiveLayout` 只把同一个正式虚拟网格切换为横向算法，窄窗隐藏结果区也不卸载搜索结果。`useStableShellLayout.ts` 只持有 Skim 视觉开关并组合 `useStableShellResize.ts` 的会话宽度，`StableSkimToolbar.tsx` 持有工具栏交互，`StableSkimPanel.css` 持有嵌入布局；本轮同时把 `App.tsx` 体量上限降低到 3315 行。

U11 规定稳定 UI 的明暗色只由偏好系统解析后的 `theme-light` / `theme-dark` 类决定，局部 CSS 不再按系统媒体查询覆盖用户手动选择。颜色1进入选择与强调表面，颜色2进入三个窗口的键盘焦点；主窗口标题栏 Portal、独立 Settings 与稳定 Preview 都覆盖 `prefers-reduced-motion`。主窗口可调分隔线继续提供指针与键盘语义；Preview 信息边栏后来收口为固定 280px 展开与固定 40px 收起两种状态，不再保留调宽或窄窗连续压缩入口。稳定 Preview 的焦点 / 减少动态效果由 `StablePreviewAccessibility.css` 持有；Settings 与 Preview 的中英文长内容采用省略或安全换行。D0 已将其提升为正式默认宿主；旧布局迁移和旧 Renderer / CSS 删除仍必须在默认宿主人工作业验证后另行授权。

此前完成的分阶段架构整理继续以体量与依赖守门约束运行时所有权。`scripts/architecture-boundaries-check.cjs` 固定 `App.tsx`、`styles.css` 与 `electron/main.ts` 的当前物理行数上限，禁止 Renderer 引入 Electron / Node、领域模块反向依赖顶层装配文件，以及在 `main.ts` 继续新增非窗口生命周期 IPC。U0 进一步把 `electron/main.ts` 上限收紧到当前 3770 行，并为搜索、目录、Skim、Settings、Preview、文件菜单、拖放、快捷键、窗口固定与隐藏恢复建立正式源码锚点；所有权移动时必须同步迁移映射，不能让旧链悄然消失后在新版组件中复制。检查通过 `test:architecture-boundaries` 接入完整测试；后续每完成一个领域拆分，应同步降低对应体量上限和收缩 legacy main IPC 白名单，守门也会拒绝已经不再对应真实直连 channel 的过期豁免。该机制用于阻止复杂度重新堆回单体入口，不代替构建、集成测试和窗口人工回归。

A5 已把运行时与模型、临时反馈、视口只读指标、系统主题、窗口置顶、skim 目录读取与 stable Skim 浏览历史等具有单一所有权的状态簇迁入 `src/renderer/controllers/`。`useSkimNavigationHistory.ts` 仅在目录读取成功后提交当前位置，按实际访问顺序提供后退与前进，并以请求代次拒绝双击或快速切换产生的迟到历史；面包屑和目录入口仍只负责发起现有读取。stable 壳层的 Skim 快捷指令请求由 `useStableSkimCommands.ts` 产生，显示状态与请求消费由 `useStableSkimVisibility.ts` 持有；目录右键菜单由 `StableDirectoryFlyout.tsx` 独立管理排序、编辑与删除动作，`directoryListActions.ts` 负责受限的目录移动 IPC 与刷新桥接。搜索、应用级页面导航、关键词编辑、目录扫描、缓存确认及窗口恢复仍由 App 顶层编排；其中同时跨越多个 Effect、确认或取消语义的状态簇依据停止条件保留原位，不为减少行数强拆。

A6 首先由 `test:ipc-registration` 固定领域注册器的 channel、参数转发和 sender 授权语义；在任何既有外围 IPC 搬迁前先建立可重复验证的注册边界。文件打开、路径定位、文字/系统文件剪贴板、回收站删除和原生拖拽六个 channel 已迁入 `electron/fileIpc.ts`，其服务、平台状态、文案和允许访问剪贴板的主/预览 sender 均由 `main.ts` 显式注入；对应 `test:file-ipc` 固定注册清单、参数过滤、失败结果和 sender 行为。llama.cpp 运行时与 GGUF 模型的读取、选择、启动和停止七个 channel 迁入 `electron/runtimeModelIpc.ts`，继续复用既有 store/manager，并保持运行时处于 starting/running 时禁止切换版本或模型的规则；`test:runtime-model-ipc` 固定注册清单、调用顺序和禁止切换边界。正式搜索、取消与刷新迁入 `electron/searchIpc.ts`，搜索任务表、取消语义和不含私人内容的运行诊断由同一模块持有。运行信息三个 channel 位于 `electron/diagnosticsIpc.ts`，固定主窗口 sender、会话级详细记录和导出边界。偏好读取、skim 排序、快捷指令、标签显隐、自定义查看、边栏状态，以及主题、语言、搜索排序、界面颜色、边缘收起、line 显隐、登录启动、系统通知和自动缓存等 channel 迁入 `electron/preferenceIpc.ts`；line 外观刷新、语言应用、缩略图优化排序、窗口/托盘同步、登录项写入、通知运行状态以及自动缓存启停与目录调度等副作用继续由 `main.ts` 显式注入。全局快捷键偏好仍由 `main.ts` 编排。缓存统计、优化状态和主 Renderer 内容/网格活动信号五个 channel 迁入 `electron/cacheActivityIpc.ts`；主窗口 sender 边界、实际活动状态及缩略图优化 pause/resume 动作由 `main.ts` 注入。正式缓存与 skim 缓存的清理授权、30 秒单次令牌和执行入口迁入 `electron/cacheClearIpc.ts`，实际暂停队列、关闭自动优化、写入偏好和安全清理动作继续由既有服务及 `main.ts` 注入；两类令牌保持彼此隔离。领域模块不得反向导入 `main.ts`，主进程继续负责依赖注入和生命周期装配。

C1 当时在同一偏好领域增加窗口外壳模式的规范化读写 channel；该阶段不触发 BrowserWindow 重建，也不显示设置入口，缺失或非法值返回 `cap7ce`。D0 已把稳定枚举扩展为三个模式并将默认规范化结果改为 `stable`；Renderer 仍只能通过既有偏好白名单读取或写入稳定枚举。

旧全目录 / 单目录视觉识别、完成度统计、继续 / 取消入口和 4×4 网格搜索已退役；`main.ts`、preload 与 Renderer 不再暴露对应扫描或识别 IPC。Settings 只保留持久化的全局 AI 能力开关，搜索页的“AI增强”与 `7ce/` 负责按次激活；关闭时停止领取后续请求并保留当前结果及安全检查点。

目录列表、目录名称修改、选择添加、外部候选添加、刷新文件计数和删除目录六个入口迁入 `electron/directoryManagementIpc.ts`；模块固定请求规范化、取消结果、扫描快照与索引写入顺序，以及操作完成后统一补齐 SQLite 索引计数。结果页的显式 F5 刷新共用该持久化入口，新增或移除文件写入正式目录层后再复用本次扫描快照；`electron/webContentsInputPolicy.ts` 在原生输入层阻止 Electron 把 F5 作为页面重载处理，再经受限 preload 事件交给 `useCurrentPageRefreshShortcut.ts` 的统一当前视图刷新入口。普通搜索与冷启动不因该规则额外写入全目录。删除流程固定暂停后台优化和渲染、等待发现队列、失效搜索快照、清理索引与缩略图、删除配置并在 `finally` 恢复队列。目录选择窗口、目录存储、扫描器、索引迁移队列、缓存服务与失败回滚仍由 `main.ts` 注入。

单文件与批量关键词更新两个入口位于 `electron/manualMetadataIpc.ts`；模块负责参数校验、已添加目录归属、可搜索格式判断和关键词规范化，所有格式统一写入用户元数据，不再按视觉 / 非视觉分流或传递 caption。批量入口继续只接受主窗口 sender，目录存储、SQLite 写入函数和本地化文案由 `main.ts` 注入；`test:manual-metadata-ipc` 固定嵌套目录取最深归属、统一写入、批量去重与 sender 拒绝语义。

A6 当前保留 22 条 legacy main IPC：应用更新/退出 4 条、skim 读取与取消 13 条、全局快捷键偏好与捕获 5 条。它们分别共享应用退出与下载控制器、skim 任务/视觉会话/统计取消状态，以及快捷键注册回滚和窗口激活链；继续拆分会跨越既定生命周期所有权或把同一职责分散到装配层两侧。窗口与 preview 生命周期仍按明确边界留在 `main.ts`；line 的状态决策留在装配层，窗口实例生命周期收口到 `lineWindowController.ts`，不以减少直连 channel 数量为目标迁移。U6 新增的 `settingsWindow:open` 由 `settingsWindowIpc.ts` 注册并限制主 Renderer sender，主进程只注入统一打开动作，不扩大 legacy 例外。

A7 按稳定组件边界迁移 CSS，不重命名选择器或调整视觉参数。独立 line 窗口的四向外观、横竖渐变流动和边缘对齐集中在 `src/renderer/LineWindowApp.css`；共享视口框架、自绘横纵滚动条、滑块交互与减少动效覆盖集中在 `src/renderer/CustomScrollbar.css`；搜索胶囊、筛选标签与芯片的兼容组件样式集中在 `src/renderer/search/Cap7CESearchCapsule.css`；预览窗口的图片、文本/Markdown、媒体、PDF、Office 转换结果、压缩包、字体、EPUB/MOBI、通用文件信息、加载状态和减少动效规则集中在 `src/renderer/preview/PreviewWindow.css`；skim 主视图、虚拟网格、条目、缩略图与位置边栏集中在 `src/renderer/skim/SkimView.css`，新版 Skim 根页面的系统位置、星标目录与磁盘分组由 `src/renderer/skim/SkimRootSections.tsx` 和同名 CSS 独立持有；搜索结果的虚拟网格、缩略图、视频标记与格式回退集中在 `src/renderer/results/ResultGrid.css`，可信度分类卡独立集中在 `src/renderer/results/ResultSectionCard.css`，结果页外壳、状态统计、尺寸布局和超宽屏边距集中在 `src/renderer/results/ResultsView.css`；轻量关键词编辑卡片的尺寸、输入框、明暗占位色、错误提示与退出动效集中在 `src/renderer/dialogs/KeywordEditorCard.css`，文件/目录删除、拖入、目录替换和缓存清理确认层集中在 `src/renderer/dialogs/ConfirmationPanels.css`；独立 Settings 的页面框架、分组/行和标题控制区集中在 `src/renderer/settings-window/SettingsWindowApp.css`，自绘下拉选择器及其运行时/模型尺寸变体集中在 `src/renderer/settings/SettingsSelect.css`，快捷操作列表与快捷命令面板集中在 `src/renderer/settings/ShortcutSettingsPanels.css`，【自定义查看】的格式分组、类别选择和格式按钮集中在 `src/renderer/settings/SkimDisplaySettingsRows.css`，稳定 Settings 的常驻展开适配集中在 `src/renderer/settings-window/StableSkimDisplaySettingsRows.css`，页脚签名、发布页链接与来源图层集中在 `src/renderer/settings/SettingsFooter.css`；自绘颜色选择器的色彩面板、色相条、游标与十六进制输入集中在 `src/renderer/ColorPickerPopover.css`。通用 SVG 包装、搜索排序图标、跨搜索与 Settings 共用的胶囊按钮基底、line/capsule 共用占位色、通用详情网格和 Settings/结果项表面规则仍由全局样式提供；原生滚动条基底及其与自绘滚动条共用的明暗主题颜色变量、通用右键菜单基底与菜单动效也继续由全局样式提供。Renderer 入口在全局基础样式之后按固定顺序加载领域样式；主题变量、跨视图壳层、共享文件名省略组件和搜索结果复用的空状态规则继续留在全局样式。

关键词编辑卡片的主题纯色蒙版由 `src/renderer/dialogs/KeywordEditorBackdrop.tsx` 与 `KeywordEditorBackdrop.css` 独立持有；主窗口只显示浮层卡片，不再叠加白色或黑色蒙版。共用卡片在 `KeywordEditorCard.css` 内采用 80% 主题表面、12px 圆角、背景模糊和文件摘要层级，输入与保存语义保持不变，不把这些样式重新计入全局入口。

Settings“运行信息”中的 Cap7CE 诊断行由 `RuntimeDiagnosticsRows.tsx` 独立持有 IPC 状态，样式位于 `RuntimeDiagnosticsRows.css`；独立 `SettingsWindowApp` 直接组合诊断行与 llama.cpp 运行信息，不把诊断状态提升到 `App.tsx`。

主窗口抽屉式收展完全由主进程移动原生 BrowserWindow 实现，不新增 Renderer 宿主或领域样式，也不修改稳定视图组件。

A1 首轮把关键词编辑卡片、文件/目录删除、拖入目录、目录替换和两类缓存清理确认面板迁入 `src/renderer/dialogs/`，并把通用 SVG 包装与缓存尺寸格式化迁入无状态辅助模块。所有弹层打开条件、异步状态、Effect、保存/取消/重试回调和窗口链路仍由 `App.tsx` 持有，原 CSS 选择器与加载顺序未移动；因此这是组件所有权调整，不是交互或视觉重写。完成该轮后 `App.tsx` 的自动行数上限由 9,268 降至 8,863，防止相同实现重新堆回顶层文件。

A2 按可独立回归的切片推进。第一切片仅迁移搜索结果与 skim 共用的文件名中间省略组件、格式图标注册表，以及搜索结果缩略图/格式回退/视频标记展示；图片加载、失败回退、懒加载和叠加标记条件保持原实现。ResultsView 的选择、长按空格、预览生命周期和两套虚拟列表尚未移动，避免一次改变多个交互所有权。第一切片后 `App.tsx` 上限降至 8,752 行。

搜索结果统一由 `src/renderer/results/VirtualResultGrids.tsx` 承担普通虚拟网格；ResizeObserver、requestAnimationFrame 节流、横纵滚动映射、首屏位置恢复、选中项显露和可见项 overscan 保持共用。选择集合、键盘导航、长按空格、右键菜单和预览状态仍由 ResultsView 持有并通过 Props 回调传入，共用网格尺寸与显露计算由 `virtualGridLayout.ts` 提供确定性测试。

A2 第三切片把 ResultsView 及其选择、键盘、长按空格和结果预览局部生命周期整体迁入 Results 领域，没有改变这些状态的组件所有权。共享搜索胶囊仍由 `App.tsx` 创建并作为 React 内容插槽传入，避免提前移动 A3 搜索领域；结果统计展示迁入无状态 `ResultStatus`。skim 与 Results 共用的内容预览分派和可编辑键盘目标判断只移动到通用辅助模块，条件保持不变。第三切片后 `App.tsx` 上限降至 7,418 行。

格式能力必须保持分层：全部 123 种已登记格式都允许写入已添加目录的 `files` 通用目录层，并以文件名、扩展名、目录路径和手工关键词进入正式搜索；其中只有原有 15 种视觉格式生成正式缩略图并进入按需 AI 搜索，其余 108 种已登记格式作为通用文件结果显示专用图标并复用对应内容 Provider 或文件信息预览。3DM、ISO、SWF、GGUF、SAFETENSORS、HEIC、HEIF 与 RAW 等原 browse-only 格式现在可以搜索和编辑手工关键词，但不因此获得正式视觉缩略图、OCR 或 AI 能力；其他未登记格式仍只存在于 skim 的全部浏览结果。所有文件统一进入普通结果范围，有无人工或 AI 关键词只影响证据，不再构成识别状态筛选。AVIF 继续经 sharp/libvips 统一生成搜索缩略图、预览缓存和 JPEG 模型输入。非原生视觉格式在 skim 当前可见范围内可以尝试 Windows Shell 内容缩略图，但失败只回退格式或通用图标，不改变正式视觉能力归属。HEIC、HEIF、DNG、CR2、CR3、NEF、ARW、RAF、ORF 与 RW2 可依赖本机 WIC / Windows 相机图像扩展获得可选显示能力：skim 与搜索结果页分别维护独立的 300 px 缩略图、1200 px 预览缓存和串行队列，避免清理、取消、失败及优先级状态跨视图传播；搜索结果还可为受支持视频按需请求 Windows Shell 缩略图并叠加播放标记，以上请求均不进入自动优化。系统扩展缺失、机型不支持或解码失败时，缩略图保留格式图标，空格预览回退文件信息；这些格式仍属于通用文件，不进入正式视觉、AI 或模型输入边界。`supportedVisualFormats.ts` 必须按 `canAIIndex` 派生正式视觉集合，避免扩展通用文件搜索范围时意外扩大按需 AI 白名单。所有已登记格式使用专用 `format-*` 图标，扩展名别名按能力表映射复用同一资产；未知格式和加载失败继续回退通用文件图标。skim 视觉文件通过独立 `cap7ce://skim-thumbnail` 和 `cap7ce://skim-preview` 协议按需进入专属缓存，支持正式视觉渲染器覆盖的全部视觉格式；GIF、动态 WEBP 及包含多帧 `acTL` 块的 APNG 在独立预览中直接读取当前授权源文件以保留动画，普通 PNG 继续使用受限尺寸的静态缓存。PDF 保留现有视觉索引、首页缩略图和 AI 边界，但独立预览改由 `pdf` Provider 按页渲染，不复用首页代表图。TXT/MD/INI/HTML/CSS/JS/PY 与 CSV/JSON/XML/YAML/YML 以最多 1 MB 的源码文本进入正式搜索和 skim 共用的 `text` Provider；MD 在 Renderer 内使用 `react-markdown` 与 `remark-gfm` 渲染常用 Markdown 和 GFM 排版，禁用原始 HTML、图片资源加载与链接跳转，其他文本、HTML、CSS、JavaScript 与 Python 始终作为纯文本放入 `<pre>`，不解析或执行。DOC/DOCX 复用 `text` Provider，仅提取正文并限制源文件大小，不承诺原版式、图片或复杂对象还原。XLS/XLSX 与 PPT/PPTX 依赖本机已安装的 Microsoft Excel/PowerPoint，在只读、禁用宏及外部链接更新的条件下转换为会话临时 PDF；源文件上限 256 MB、单次转换上限 30 秒。转换结果按源文件路径、大小与修改时间在当前进程内复用，源文件变化或应用退出后失效；切换或关闭预览会取消尚未完成的转换，但不会删除仍有效的会话结果，缓存不进入正式或 skim 视觉缓存统计。缺少对应组件、转换失败或超时均回退文件信息；当前不提供 WPS 兼容、Office 编辑、内容搜索或版式优化。RTF 保持文件信息预览，等待文档 Provider。FLAC/M4A/MP3/OGG/WAV 与 MKV/MP4/MOV/WEBM 通过只允许当前预览项目访问、支持 Range 的 `cap7ce://skim-media` 进入 `audio`/`video` Provider；M4A、WEBM、FLAC、OGG 与 MKV 仅在 Electron 43 / Chromium 150 的用户真实样本完成元数据、首段解码、播放状态及时间轴推进验证后接入，AVI 实测解码失败并继续回退文件信息，其他登记容器不据扩展名推定可播放。编码、文件内容、Office 转换或浏览器媒体解码不支持时回退文件信息。

添加目录后用于刷新目录文件数量的递归扫描同时把全部已登记格式写入 `files` 通用目录层，并把正式视觉文件写入 `images` 层，但不会自动启动 AI。normal 右上角“全部文件”取所有目录行文件数量之和，覆盖全部已登记格式；Settings 不再重复显示识别完成度统计，正式搜索也不按有无关键词拆分文件范围。

当前界面文案通过纯 TypeScript 模块 `electron/localization.ts` 的稳定文案 ID 和 `t()` 入口读取。该模块不依赖 Electron、Node 或 React，因此主进程与 Renderer 可以共用。中文与 `electron/locales/en-US.ts` 英文语言表保持相同键及占位符，语言偏好支持跟随系统、中文和 English，并由主进程持久化后同步到主窗口、独立预览窗口和托盘菜单。Settings 的语言入口在中文界面显示“语言 / Language”，在英文界面显示“Language / 语言”；明确选择语言时显示“中文”或“English”，跟随系统时按当前界面语言显示“跟随系统”或“Use System Setting”而不伪装成当前解析语言，确保偏好状态与实际界面语言能够区分。切换语言时运行期生成界面标签，避免模块初始化阶段缓存旧语言。AI 提示词不属于界面语言表，但识别任务启动时会固定当前已解析语言并选择独立的中文或英文提示词模板，避免运行期间切换语言造成同一批结果中英混杂；错误分类正则、开发日志、用户文件名与第三方原始错误同样不属于界面语言表，不能为消除硬编码扫描结果而修改其语义。

ZIP、7Z 与 RAR 继续属于正式非视觉文件名搜索范围，但其预览 Provider 只在用户打开预览时启动独立 `7z-wasm` 辅助进程，固定执行 `l -slt` 条目列表并显示路径、目录标记和大小；不解压、不打开内部条目、不输入或保存密码、不建立归档内容索引，也不写入源目录或预览缓存。单次列表最多向界面返回 2,000 项，输出、路径、源文件体积和执行时间均有硬上限；加密、损坏、算法不支持、超时或进程异常使用本地化原因回退文件信息。7-Zip 与 UnRAR 许可文本随打包资源分发。

TTF 与 OTF 继续属于正式非视觉文件名搜索范围，只有内容预览改用独立 `font` Provider。主进程先在可终止 Worker 中以 OpenType.js 的低内存模式读取受限元数据；预览 Renderer 再通过只授权当前会话和当前路径、并与其他本地资源隔离的 `cap7cefont://preview` 协议取得最多 64 MiB 字体字节，以随机会话别名创建临时 FontFace。界面只显示本地化家族名、样式、字形数量、可变轴摘要及固定中英文示例；不安装字体、不使用字体内部名称注册系统或进程级字体、不提供编辑或轴控制、不建立缓存。切换或关闭时中止读取并从 `document.fonts` 删除临时字体；损坏、超限、超时或加载失败使用本地化原因回退文件信息。OpenType.js 的 MIT 许可文本随打包资源分发。

EPUB 属于正式非视觉文件名搜索范围，内容预览使用独立 `epub` Provider。主进程只在用户打开预览时启动可终止 Worker，并限制源文件大小、压缩条目数、单条目大小、展开总量、正文字数和执行时间；容器与 OPF 使用 XML 结构读取，章节 XHTML 使用容错 HTML 解析后仅提取纯文本，封面转换为受限尺寸 PNG。预览不执行书内脚本、CSS 或网络请求，不读取加密内容，不建立正文索引或持久缓存；切换或关闭立即终止旧任务。无正文、损坏、加密、超限或超时均以本地化原因回退文件信息。

MOBI 属于正式非视觉文件名搜索范围，内容预览使用独立 `mobi` Provider。主进程仅在用户打开预览时读取源文件并启动可终止 Worker；Worker 在交给解析器前严格检查 PalmDB 记录表、MOBI6 类型、未加密标记、UTF-8 或 Windows-1252 编码，以及无压缩或 PalmDOC 压缩边界。正文以容错 HTML 解析后只提取纯文本，封面转换为受限尺寸 PNG，临时资源随切换、关闭、失败或超时清理；不执行脚本、样式或网络资源，不建立正文索引或持久缓存。DRM、KF8、联合格式、AZW/AZW3、HUFF/CDIC、损坏、超限及超时均以本地化原因回退文件信息。

## 6. UI 状态系统

Cap7CE 0.9.9 的正式窗口状态已收口为主窗口显示与隐藏生命周期：

- `standby`：主窗口隐藏状态；待机线偏好开启且主窗口与预览窗口均不可见时显示独立 `lineWindow`，偏好关闭时不保留该窗口及 Renderer。托盘在后台开启 line 时不改写保留的窗口形态，但可立即显示 line；Settings 等主窗口可见状态下开启时则等待窗口收起。`Alt+3` 不会主动改变该偏好。
- `normal`：完整搜索结果窗口。
- Settings：独立单实例 BrowserWindow，与主窗口显示状态正交。

主窗口冷启动时按自由 bounds 完成初始化但保持隐藏；standby 不修改主窗口 bounds、shape 或鼠标穿透，只负责隐藏主窗口并按偏好显示独立 line。拖动与缩放始终由同一响应式页面承接，不再执行形态阈值判断、resize settle 或尺寸回弹。显示 / 隐藏、bounds、minSize 和 line 生命周期集中在主进程，不要新增旁路逻辑。

收起到 standby 时，Renderer 保留搜索结果元数据、筛选条件和滚动位置记录，但卸载 `ResultsView` 网格及其图片 DOM；重新展开后使用内存中的结果直接重建视图，不主动重新扫描磁盘。该边界用于释放解码图片和网格组件占用，同时避免通过清空结果换取内存后又产生新的磁盘扫描。

独立 `lineWindow` 使用 180 px 宽透明窗口承载底部 4 px 连续渐变线；若 Windows 抬高透明窗口的原生高度，只在该独立窗口内按实际高度重新贴底，并将 shape 限制为底部 15 px 有效区域。line 不复用主窗口 Renderer，也不参与主窗口 shape、bounds 或鼠标穿透恢复；单击 line 只显示主窗口并聚焦已有搜索框。主进程监听显示器 `workArea` / `bounds` 变化并重新贴合可见 line，独立 Settings 在隐藏后重开或下次启动时按自己的版本化记录执行显示恢复。

主窗口按整窗 `300 × 170` 设置自由缩放下限，低矮布局让结果或 Skim 独占可用宽度并把横向滚动条固定在内容底部；只有恢复默认窗口动作会主动应用当前工作区 82%、最大 1600×1000 的居中 bounds。

产品主窗口的 Renderer 入口只装配 `App` 与 `StableUiRoot`；旧 Home、同窗 Settings、micro/mini/normal 页面树及其右侧控制栏已退出 Renderer。`App` 继续作为搜索、目录、Skim、快捷动作和弹层的应用级状态编排层，稳定 UI 只消费其现有动作与 Props。Settings 由 `src/renderer/main.tsx` 按 `window=settings` 分流到独立单实例 `SettingsWindowApp`，不再存在旧完整 Settings 页面。Preview 也只装配 `StablePreviewTitlebar`、稳定内容壳和信息边栏，旧兼容标题栏、右侧控制栏及内容内嵌元数据分支已删除；所有 Provider、导航、窗口尺寸与文件动作仍复用原有链路。独立 Capsule Renderer、桥接 Hook、专用 preload/IPC 及主进程控制器均已删除；line 继续由独立 Renderer 绘制待机线，点击时通过受限 IPC 复用主窗口激活与搜索聚焦动作。

## 7. 0.9.9 UI 结构

当前 UI 结构包括：
- 统一搜索胶囊：目录、识别状态、排序、格式标签进入同一胶囊系统；全部标签默认显示，显隐偏好分别持久化，排序默认递减。
- 搜索输入去除传统 input 边框、背景和 focus 线。
- 标签显隐：目录与排序等现有标签可右键隐藏，并可在胶囊菜单恢复；AI增强标签始终用于本次按需搜索，不承担文件完成度筛选。
- 待机线渐变：使用主题色、副色和明暗模式中间色的连续循环渐变。
- 冷启动提示动画：独立一次性提示窗口，不控制主窗口生命周期。
- 新图标系统：窗口线状、展开、置顶、设置、排序和签名图标统一 SVG。
- 明亮 / 黑暗 / 跟随系统三态主题。
- 主题色 / 副色配置与持久化。
- 主题色 / 副色使用自绘拾色浮层，包含明度 / 饱和度、色相和 HEX 三项控制；HEX 文本支持带或不带 `#` 的逐字符输入，输入与滑块实时同步。浮层复用右键菜单的主题、圆角和动效，点击外部保存，`Esc` 取消并恢复原值。
- 标签和缩略图共用新版右键菜单视觉、最大圆角 hover 与窗口内定位约束。
- 缩略图 Hover 使用 40% 黑色蒙版；Selected / 多选使用 60% 黑色蒙版；Selected + Hover 保持 60%。蒙版在缩略图容器内独立渐变，内部图片在 Hover / 键盘焦点时轻微放大、Selected 后固定保持放大；缩略图容器本身不缩放或位移，透明图片不增加黑色防漏底。
- 图片预览使用独立且可缩放的 `BrowserWindow`，跟随主题、使用 Windows 原生窗口控制按钮，并可切换最大化与共享置顶状态。
- 同一预览会话切换图片时不叠加前后图片；旧图随目标切换清除，新图加载完成后自然渐显。等待提示延迟 180ms 出现，已缓存或快速就绪的图片不会短暂显示等待状态；关闭预览后结果网格定位到最后浏览项目。
- 主窗口、预览窗口、缩略图和搜索结果滚动区域复用统一圆角变量。
- 主窗口外壳不使用 CSS 阴影，避免透明窗口圆角出现合成残影；Windows 透明无边框窗口的原生阴影可能不可见，当前不额外模拟外部阴影。
- 关键词编辑窗口使用响应式胶囊面板，micro 为左右布局，mini / normal 为纵向布局。
- 独立 Settings 按八个新版分类组合现有偏好、目录和任务能力，并由偏好 / 目录变更广播保持主窗口与 Preview 的正式状态同步；窗口材质可在 Acrylic / Mica 间选择并实时同步三窗口，纯色只作为失败回退；12–16px 字体大小作用于稳定宿主与共享浮层，文件内容排版不随之缩放。
- Settings 的 llama.cpp 版本与视觉模型选择使用 Renderer 自绘列表：触发按钮与同排按钮等高，不显示描边或展开箭头，并沿用原有宽度和禁用条件；列表通过 Portal 复用右键菜单视觉并按视口上下定位，鼠标仅对实际 hover 项显示主题色，键盘导航项保留背景反馈。组件支持点击外部、滚动、失焦或 `Esc` 关闭，以及方向键、Home / End、Enter / Space 选择；首项空值会清除并持久化当前选择，非空值继续由 Store 验证实际版本或模型。成功切换或取消后，主进程仅在服务闲置时同步当前配置到进程状态，避免旧启动失败提示残留；服务运行期间仍由 Renderer 和主进程双重禁止切换。
- 大型文件预览和批量删除复用 `WaitingIndicator`；等待图标使用主题渐变并围绕中心轴旋转。
- 文件夹拖入、删除及缓存清理等确认层复用全窗口背景与居中内容动效；normal 的通用编辑面板宽度不得覆盖这些全窗口确认层，背景从首帧覆盖完整内容区域，提示内容再独立淡入。
- 目录与识别状态标签展开时，同类候选项统一使用主题色，选择完成后恢复默认胶囊颜色。
- 搜索结果与 skim 的内部滚动视口继承同一外框圆角并使用绘制裁切，边缘条目按统一圆角收口；共享自绘滚动条使用与全局原生滚动条相同的主题半透明颜色且不附加描边或阴影，stable 搜索与 skim 在四边保留等效 10px 页内留白并把 8px 纵向交互槽放在网格右侧，其他普通视口继续按各自壳层决定交互槽是否叠加，仅控制 thumb 的显示透明度，滚动、拖动或悬停时显示，结束后自动淡出。skim 成功切换到不同路径时同步归零真实滚动容器与虚拟列表偏移，避免子目录位置泄漏到父级；同一路径刷新不重置当前位置。
- 快捷指令及目录、查看范围、排序操作的临时反馈显示在输入框内部，不写入或清除真实搜索内容；危险操作统一输入 `y / n` 后回车确认。触发结果刷新时先启动刷新、再写入反馈，避免搜索入口的旧状态清理覆盖本次操作结果。
- 搜索框在复制、刷新、快捷指令等操作完成后通过独立文字层显示临时反馈，随后恢复原关键词。
- 副色按钮沿用通用按钮交互规则，并由当前 `--accent-color` 驱动 hover 与 focus-visible 颜色。
- 缩略图不可用、解析失败或加载失败时，普通结果网格在相同容器中显示对应格式图标或主题回退，不另建完成度专用列表。
- 主内容仍由真实 `overflow` 容器负责滚轮、触控板、键盘和实际滚动；共享 `CustomScrollbar` 只同步位置并提供 thumb 拖动与轨道点击，micro 使用横向形态，其余结果页和 Settings 使用纵向形态。
- 交互动效限定在 Renderer 局部组件：标签、缩略图、滚动条、菜单、按钮、弹层、预览内容和 Settings 展开项分别复用当前统一节奏；优先使用 `transform`、透明度或隔离裁剪，并在 `prefers-reduced-motion` 下关闭非必要动画。动效不得控制 BrowserWindow 生命周期、窗口状态机或业务数据。

## 8. 文件索引与缓存架构

I6a 已建立嵌入元数据的提取与 Store 边界，I6b 接入后台增量调度和旧文件显式补齐，I6c 再把高价值证据加入正式搜索。`file_embedded_metadata_state` 只记录 source revision、提取器版本、成功 / 空 / 失败状态、可选原始拍摄时间及短错误码；`file_embedded_search_evidence` 只为确有价值的字段建立稀疏行，没有证据的文件不写入空字段集合。证据选择由文件类别决定：图像 / 视频可接收正向画面内容，文档可接收人工标题 / 主题 / 描述 / 关键词，创作软件只保留 Photoshop 等用户可理解的规范化家族，音频与字体分别保留媒体身份和字体家族；同名字段不会跨格式一概而论。

原始 ComfyUI Prompt graph、负向 Prompt、workflow、model / LoRA、steps / sampler / seed、整份 XMP 和大块容器元数据不复制进 sql.js。源文件仍是完整事实来源，数据库只保存可重建的最小搜索证据。标准 EXIF / XMP / IPTC 由 `exifr@7.1.3` 读取；损坏或某一来源失败与其他来源隔离。目录扫描写库完成后只查询对应目录中尚无状态、源版本变化或提取器版本失效的受支持文件，并送入独立 Worker 串行提取；每个候选完成后立即回收 Worker，避免异构解析器长期复用造成 RSS 累积，每 24 项小批量写库。旧索引只可从 Settings 显式启动补齐，运行中可取消，冷启动和搜索请求绝不触发全量源文件读取。目录删除前先撤销相关队列，避免后台继续读取已删除来源。

正式搜索对每个空格词继续执行跨来源 OR，并在词之间执行 AND；嵌入证据通过按 `file_id` 关联的 `EXISTS` substring 条件参与召回，不改变文件名、路径、人工词、自然条件或 AI 来源的语义。证据排序把 `embeddedMetadata` 放在直接目录证据之后、现有 AI 证据之前；同一词命中多个来源时仍完整保留来源集合。完整嵌入文本只在主进程内用于归因，每个查询词最多向 Renderer 返回一段、每条最长 180 字符且整条结果最多 8 段的命中片段；空查询不读取或发送嵌入文本，也不显示分类卡。

I8a 建立视觉属性的分析与 Store，I8b 接入后台增量调度，I8c 再进入正式搜索。`file_visual_properties` 每个文件最多一行，比例和值统一保存为 0–10000 定点整数，不为单项属性建立索引；源文件变化或分析器版本升级后重新分析。透明 RGB 不参与亮度、颜色或背景判断，透明外围独立记录。I8b 只复用已成功生成的正式 300px 搜索代表图：前台缩略图先完成返回，再异步通知分析服务；自动优化在本次进程首次发现既有有效缓存时也会通知，因此不重新读取源文件生成第二份输入，同一缓存身份不会因后续搜索重复广播。大量既有缓存按固定小批次让出事件循环，关闭或重新开启自动优化会使旧批次停止。候选先按当前文件目录与 source revision 核对，未变化且算法版本一致的成功或失败记录均跳过；独立 Worker 固定单并发 Sharp 解码，分析结果批量保存，删除中的文件 / 目录从待处理队列丢弃且数据库记录继续由外键级联清理。代表图渲染规则若实质改变并影响测量，应与分析算法一起升级 analyzer version。

I8c 的独立语义词典把可调整的口语、书面语和技术用语映射到稳定事实与阈值，数据库与分析器仍不知道搜索词。同一事实增加别名或调整阈值不重算文件，只有新增底层测量或影响测量的代表图规则变化才升级分析器版本。查询只在包含视觉条件时关联属性表，并在返回证据前再次核对 indexed 状态、分析器版本和当前文件 source revision；缺少、失败或失效属性不作为反证。透明 / 无背景进入确定性自然条件，白底、黑底、暗图、灰色 / 灰色调及红、橙、黄、绿、青、蓝、紫、粉等粗颜色只作为低可信度视觉相似证据，排在既有 AI 证据之前；颜色只表示画面含有该色，不推断主体或物体归属。灰色语义由低饱和覆盖率、平均饱和度、亮度中位数 / 均值和外围白黑比例共同约束，只表示整体中性灰阶，单字“灰”仍作为普通文本。橙色与肤色、米色、木色和暖光高度重叠，保留常用搜索词但明确接受较高误召回；“暖色”需要红、橙、黄等多颜色族的独立组合判断，不作为橙色同义词。夜晚、极简及服装 / 物体颜色等复杂语义也不由低级属性扩展。

I9 的方向与宽高比条件只读取 `images` 既有数值列，搜索查询本身不得临时打开源文件。应用启动时发现既有缺失项，扫描写入后再增量发现新项；尺寸服务仅为宽高为空且属于轻量安全集合的正式视觉文件入队。单 Worker 在所有 Cap7CE 窗口处于前台活动时以较长任务间隔读取源元数据，失焦后恢复正常后台间隔并小批量写库，因此不依赖“自动缓存”偏好，也不阻塞文件扫描、缩略图返回或基础搜索。源文件大小或修改时间改变时，扫描事务先把该文件宽高恢复为空，新任务再以相同 source revision 契约补齐；未变化文件保留原值，迟到旧结果被数据库拒绝。读取失败写入 `0 / 0` 作为当前源版本的已处理哨兵，避免每次扫描重复失败；零值和空值都不满足方向 / 比例条件，但不排除同一文件由文件名、路径、人工关键词、嵌入元数据或 AI 证据命中。当前不从 300px 缩略图反推尺寸，避免裁剪、旋转或代表图策略制造伪事实；PSD、PDF、AI、EPS、CDR 等复杂视觉格式等待各自可验证的原生事实来源，而不是扩大本轮 Worker。

词表收尾 Q1 继续把自然表达限制在可验证事实：图片 / 图像只覆盖普通栅格和相机图像，SVG 与 AI/EPS/CDR 保持矢量，PSD/PSB 保持设计源文件；照片不再按扩展名假定，仍可由真实文本来源命中。文档是文档 / 电子书与文本类的日常上位词，文本保持纯文本、标记和源码的窄范围；Word、Excel、PowerPoint、幻灯片、表格与 ps文件分别映射明确扩展名集合。今日 / 刚刚 / 刚才按当天，本周 / 上周 / 本月增加日常同义词；前不久 / 不久前覆盖最近 30 个本地日历日，前段时间覆盖最近 180 日，很久前 / 很久以前表示早于 365 日。`YYYY年M月D日`、`YYYY年M月`、`YYYY/M/D`、`YYYY/M`及对应连字符形式、`今年M月`和`去年M月`严格校验本地日历，非法日期不产生条件。单字图、表、灰、暗、ps以及正方形不绑定固定事实，避免覆盖其普通内容语义。

Q3 的动画事实由独立 Worker 增量补齐，前台活动时限速、失焦后恢复正常后台速度，候选仅限 GIF、WebP 与 PNG；探测器顺序读取 GIF 块、WebP RIFF 块或 PNG chunk，跳过压缩帧正文并在确认第二帧后结束，不生成缩略图或解码动画。`file_animation_facts`只保存源版本、探测器版本、状态和布尔值；查询“动图”仅接受当前源版本的已确认动态事实，静态、失败与尚未探测均不命中该条件，但同词的文件名、路径和其他文本证据仍然有效。AVIF 因缺少可靠动态对照暂不进入该链路，SVG 明确排除。

后台嵌入元数据、源尺寸、视觉属性和动画事实的成功写入通过统一 `search:indexChanged` 事件使当前非空结果查询重新执行；主进程先合并相邻数据库批次，Renderer 的独立 Hook 再短暂防抖并复用既有 `runSearch`，不导航、不改变查询条件。该事件只负责结果新鲜度，不携带索引内容，也不旁路正式搜索 IPC；因此新事实完成后无需重启应用，同时避免每个文件触发一次查询。

`sql.js` 的数据库实例仍以整库导出方式持久化，所有通过 `sqliteImageIndex.ts` 加载的读写操作因此共享同一进程内访问队列；数据库实例关闭后才释放下一项。该串行边界避免后台元数据批次与人工关键词、扫描或 AI 写入基于不同快照交错保存而丢失更新。元数据每批最多 24 项，不能把整轮源文件提取包在数据库锁内。

按需 AI 搜索链路：

```text
查询与基础搜索结果
-> aiSearchCandidateService 应用确定性条件并排除已显示路径
-> aiSearchImageInput 准备单张 300px JPEG
-> aiSearchSingleImageModel 对一个视觉词返回严格 0 / 1 / 2
-> aiSearchService 按用户词序短路并渐进追加结果
-> 结果分类卡从零命中阶段开始显示运行状态，并只负责暂停 / 继续当前检查点
-> 顶部 AI增强 标签只做总开关；关闭会丢弃任务检查点但保留已显示结果
-> Beta 测试阶段仅在当前会话展示结果，不持久化查询标签
-> 准确性验证通过后才允许 aiQueryEvidenceStore 保存完整查询确认词
```

三类缓存策略：
- `capmo1536`：模型识别输入图，最长边约 1536，缓存扩展名为 `.capmo`。
- `cappr2560`：仅为无法由 Chromium 直接显示，或最长边超过 4096、总像素超过 1600 万、文件体积超过 20 MiB 的静态视觉文件按需生成，最长边约 2560，缓存扩展名为 `.cappr`；普通 JPG / JPEG / PNG / WEBP 直接读取源文件。
- `capth300`：缩略图缓存，最大约 300 x 300，缓存扩展名为 `.capth`。

自动缓存优化只预生成 `capth300` 搜索缩略图，不批量生成预览图或模型输入图。开关在启动时已启用或由用户重新开启后，通过最低优先级目录发现恢复缺失及源版本变化的候选；目录扫描与候选筛选期间状态为 `discovering`，随后才进入实际队列处理，主窗口与独立 Settings 接收同一实时状态。正常搜索、目录扫描和索引刷新产生的扫描结果也会继续补充候选，新增或替换目录成功后仅额外扫描本次新增目录一次，不依赖当前搜索范围。候选以源路径、文件大小、精确修改时间及内部缓存/渲染版本计算目标缓存键；缓存目录文件名清单只在首次需要筛选候选时读取并在内存中维护，缓存数量与大小也延后到用户打开 Settings 时统计。仅将缺少完整图片与元数据文件的新增、修改或版本失效项目加入队列；已有缓存只为本次进程首次发现的身份通知一次视觉属性链，通知按小批次让出事件循环，后续搜索不重复广播。内部缓存或渲染版本变化后，后续目录发现会渐进补齐新版本缓存。任务按当前排序偏好保持单并发；主窗口、Settings 或预览窗口可见且聚焦时使用较长任务间隔低速推进，失焦、最小化、隐藏或进入 line 后恢复正常后台间隔。嵌入元数据自动增量、源尺寸、动画事实和视觉属性同样采用前台限速、后台正常速度，避免持续聚焦造成派生事实永久缺失；Settings 中用户主动发起的嵌入元数据补齐保持正常速度。显式暂停、用户关闭自动优化、AI 冲突或缓存清理仍会真正停止领取新任务，等待当前单文件结束后再恢复或清理。

系统通知采用“宁可少提示”的策略：首次后台运行提示按用户数据只请求一次，并使用当前实际可用的搜索快捷键；自动缓存优化按实际工作时长判断，仅对处理过内容且超过 1 分钟的完整批次提示，并设置 30 分钟冷却。按需 AI 搜索以搜索胶囊状态和临时提示反馈，不发送旧全目录任务完成通知。系统通知关闭、短任务、空任务、前台完成和重复完成状态均不提示。

skim 缓存位于独立的 `skim-cache/thumbnails`、`skim-cache/previews` 和 `skim-cache/metadata`，不计入正式视觉缓存统计、清理或自动优化。原生视觉缩略图与 Shell 内容缩略图使用不同的缓存类型、扩展名和渲染来源；Shell 缓存键同时包含源文件大小、精确修改时间及 Shell 策略版本，避免与原生结果混用。Renderer 使用可见性观察只请求当前视口及邻近区域的缩略图；每次进入目录建立新的生成会话，离开时取消未领取任务，已开始的单文件生成允许完成但迟到响应不再交付。显式预览插入原生视觉高优先级队列；Shell 请求使用独立串行通道，只在主窗口聚焦且处于内容视图时领取任务，单会话内抑制重复失败，并在连续超时后停止该会话继续领取。Settings 单独展示全部 skim 缓存数量和大小，并通过独立确认、授权和安全清理入口暂停两条队列、等待正在写入的任务结束后清理。

历史 `.capmo` 模型输入图仍属于可重建缓存，自动缓存优化可清理既有通用 AI 元数据已完成项目的遗留输入；按需 AI 搜索直接从受限视觉输入准备 300px 单图，不创建新的全目录模型输入队列。清理不扫描源目录、不删除缩略图或预览缓存，失败也不影响搜索或查询确认词。

Electron 在任何数据路径读取前将 `userData` 固定为 `%APPDATA%\Cap7CE`。数据库、配置、预览缓存和缩略图缓存均只写入 Cap7CE 当前目录；数据库文件固定为 `index/cap7ce-index.db`。当前开发阶段没有旧用户数据兼容要求，不读取或迁移旧 `%APPDATA%\Image Everything`、`index/image-everything.db`、旧缓存目录或历史备份文件。

SQLite 在同一个数据库中保持相互分离的职责：`files` 保存全部白名单文件的路径、名称、扩展名、大小、时间、目录 ID、相对目录与存在状态；`images` 只保存视觉文件事实和尺寸；`file_user_metadata` 以文件路径保存所有格式统一的人工描述、关键词与更新时间；`image_ai_metadata` 以视觉记录 ID 保存可重建的 AI caption、关键词、识别时间与失败状态；`file_embedded_metadata_state` / `file_embedded_search_evidence` 保存稀疏嵌入元数据；`file_visual_properties` 只保存可重建的低级视觉数值及处理状态。人工、AI、嵌入信息和派生视觉事实不能修改彼此所有权。数据库启动时直接确保当前表与索引存在，不识别或改写历史列；正常目录扫描直接写入当前文件目录与路径证据。目录替换保留元数据，目录删除和缺失清理通过事务及外键级联清理，不留下孤立记录。

正式搜索以 `files` 为主表，关联 `images`、`file_user_metadata`、`image_ai_metadata` 与有效的 `image_ai_query_cache` 统一读取视觉与非视觉结果。每个空白拆分的查询词都可跨文件名、扩展名、相对目录、已添加根目录真实名称、用户显示名称、人工描述 / 关键词和 AI caption / 关键词命中，查询词之间保持 AND；`%`、`_` 和转义符按字面量处理。人工与 AI 关键词均采用逗号边界精确匹配，非视觉记录不进入 `images` 或 AI 表。根目录真实名称与用户显示名称仍只保存在目录配置中，查询前转换为匹配目录 ID，不逐文件复制。非空查询在召回与扫描覆盖层合并后为每个词附加全部命中来源和最优来源，并按“人工关键词、人工描述、文件名、扩展名、相对目录、根目录真实名称、目录显示名称、AI 关键词、AI caption”的可调整顺序建立每词证据向量；先比较结果最弱的必要来源，再逐项比较其余词的最优来源。同一向量内继续采用用户选择的名称 / 修改时间及方向作为稳定次级排序，额外重复命中不加分；空查询完全保持普通排序。显示分类取最弱必要来源所属类别，因此多词结果不会因其中一个人工词而掩盖另一个只能由 AI 命中的词。证据摘要不写入 SQLite，也不新增原始元数据暴露。搜索同时请求按目录的 15 秒可取消内存扫描快照：首次搜索或快照过期后递归扫描，连续查询及并发请求复用快照，显式索引扫描可直接注入结果，目录添加 / 替换 / 删除使对应快照失效；离开内容视图、主窗口失焦或应用停用时取消扫描并释放快照。快照不写 SQLite，只补充尚未持久化的新文件，并在完整扫描成功时作为当前会话的文件存在性依据；失败或部分扫描不得删除既有结果，内容视图激活竞态或正常生命周期取消同样只降级为已有 SQLite 结果，不得使整次搜索失败。同一路径以视觉结果优先。查询确认词仅在源版本、模型身份和提示词版本一致时合并为 AI 关键词证据；失效记录不命中，也不作为反证。全部文件统计仍读取 `files`，不会让非视觉文件进入按需 AI 候选。

## 9. 文件格式支持

当前支持方向：
- JPG / JPEG
- PNG
- WEBP
- AVIF
- GIF
- PSD
- PDF
- AI
- CDR
- EPS
- SVG
- TIF / TIFF
- BMP

处理原则：
- 多页文件当前主要取第一页作为代表图。
- GIF、动态 WEBP 和 APNG 保留动态源文件预览，模型输入与缩略图使用静态代表帧；APNG 通过 PNG `acTL` 块识别。普通 JPG / JPEG / PNG / WEBP 同时满足最长边不超过 4096、总像素不超过 1600 万且文件体积不超过 20 MiB 时直接读取源文件，任一项超限才生成 2560px PNG 预览缓存。
- PDF / AI 主要使用第一页渲染。
- PSD 可读取合成图和可靠的首个画板代表图。
- EPS 读取内嵌 TIFF 预览，不执行 PostScript。
- CDR 读取现代 ZIP 型文档中的内置预览图，不解析页面对象。
- 可视化文件统一转为代表图后再用于缩略图和模型识别；预览仅在源文件无法安全轻量直读时生成代表图。

## 10. 模型架构

当前路线是集成 `llama.cpp`，使用本地 GGUF 视觉模型，不再依赖 Ollama 作为主路线。

`electron/aiContentPaths.ts` 是运行时与模型目录的单一解析边界。打包态只使用当前 `Cap7CE.exe` 所在目录内的 `llama.cpp` 与 `models`，不读取 `PORTABLE_EXECUTABLE_DIR`、父目录或 `resources` 相邻候选；开发态只使用 `app.getAppPath()` 对应的仓库目录。路径解析不创建、迁移、复制或删除目录，缺失时 Store 返回既有安全状态。多个程序副本各自读取本目录 AI 内容，但继续共享 `%APPDATA%\Cap7CE` 中的选择配置；用户切换程序副本后，若已保存的版本或模型在该副本中不存在，会按现有状态明确提示重新选择。

模型系统包括：
- llama.cpp 目录扫描。
- `llama-server.exe` 选择、启动、停止和状态检查。
- AI 搜索自动启动的 llama-server 在最后一个任务完成、暂停、取消或失败后保温 10 分钟；期间新任务取消回收并复用已加载模型，超时后停止进程以释放内存与显存。Settings 或快捷指令手动启动的服务不进入该空闲回收，由用户显式停止或随软件退出。
- llama-server 启动前使用 Node `net.Server` 从 `127.0.0.1:18080` 开始顺序探测最多 100 个端口，自动跳过进程占用、Windows 排除端口和权限禁止端口。
- 实际端口保存在 `llamaRuntimeManager` 当前运行时状态中；健康检查、模型请求和视觉识别统一读取该端口，不依赖固定 8080，也不提供用户端口配置。
- GGUF 主模型与 mmproj 模型扫描、配对和选择。
- 默认方向为 `Qwen3-VL-4B-Instruct-Q4_K_M`。
- 面向 8GB / 16GB 显存环境做配置适配。

当前 AI 深度匹配只让模型返回 `0/1/2` 评分，不生成、展示或持久化模型标签；内部中文判分提示词属于经 0.8B 模型实验确认的固定协议，不等同于面向用户的输出语言。查询证据保留用户输入的原始词，不根据界面语言翻译。若未来恢复由模型生成并保存或展示标签的能力，任务必须先固定当前已解析的软件语言，中文界面输出中文标签、英文界面输出英文标签；两种语言的提示模板和解析验证必须同步维护，且 AI 标签仍不得覆盖人工关键词。

## 11. 搜索与交互

搜索交互包括：
- 空搜索显示当前范围内全部文件。
- 文件扫描完成后即可按文件名、扩展名、已添加根目录真实名称、用户显示名称和相对目录命中结果，不要求先执行 AI 识别；服务层将统一索引查询与扫描快照合并并按路径去重。
- 非视觉文件不匹配视觉 caption，但可匹配自身 `file_user_metadata.keywords`，并继续使用上述文件和目录路径证据，支持目录/格式筛选及名称/修改时间排序。
- 非视觉结果卡片使用对应格式图标，支持系统打开、打开路径、原生拖出、文件信息预览、关键词编辑和删除；视觉与非视觉文件可混合多选编辑关键词或删除。
- 中文关键词搜索。
- 与 / 或逻辑。
- 目录标签筛选。
- AI增强总开关、状态卡暂停 / 同范围继续、关闭后丢弃任务检查点并保留已显示结果。
- 排序标签支持按名称 / 按修改时间及递增 / 递减组合；非空正式搜索先按逐词证据向量排列，再把该设置作为同证据向量内的稳定次级排序，空查询仍完全按该设置排序。正式搜索与 skim 分别持久化字段和方向，正式搜索偏好继续供自动缓存优化使用，skim 缺少旧配置时默认按名称递增，两种内容视图互不覆盖。
- 方向键移动焦点。
- Enter 打开当前项。
- 空格打开 / 关闭独立预览窗口，方向键可在当前结果内切换。
- 两级右键菜单：“查看”包含预览、打开和打开路径；“操作”包含复制路径，以及符合现有权限时的编辑关键词、删除或添加目录。
- 拖拽到资源管理器、桌面或外部应用。
- Ctrl 多选、Shift 范围多选、多选删除。
- 单文件关键词编辑以当前输入作为完整关键词结果。
- 多选关键词编辑显示所选文件关键词交集；删除共同词会从全部所选文件删除，新增词会追加到全部文件，各文件独立关键词保留。
- 多选关键词更新在单个 SQLite 事务内全部提交或全部回滚，失败后可在新版结果弹层中重试。
- 未模型识别文件可创建最小手动索引记录并立即搜索，不伪造模型 caption。
- 手动关键词保存后刷新当前结果；退出编辑时恢复原结果滚动位置。
- 新增目录后，在空搜索、所有目录和全部识别状态范围内自动刷新全部支持文件，不要求先完成模型识别。
- 删除当前筛选目录后自动恢复所有目录范围；删除最后一个目录时 Settings 保持正常空状态。

文件删除资格不依赖模型识别状态、人工 / AI 元数据、`indexed_at` 或索引中的 `exists` 状态。允许删除的文件必须满足：
- 是真实存在的普通文件。
- 位于当前已添加目录内。
- 属于正式搜索支持的文件格式，或已有通用文件 / 视觉索引记录。
- 不属于 Cap7CE 缓存、数据库、模型或运行时目录。

数据库中存在记录时，可按规范化后的 `file_path` 删除对应索引；数据库中不存在记录时，也允许删除源文件，后续数据库清理允许零命中。Windows 路径比较统一使用 `resolve`、`normalize`、清理尾部分隔符和大小写不敏感比较。

关键词规范化规则：
- 中文逗号和英文逗号均可输入，保存时统一输出英文逗号。
- 只有逗号作为关键词分隔符；空格、换行和 Tab 不拆分关键词。
- 清理首尾空白，内部连续空白压缩为一个普通空格。
- 忽略空关键词并按首次出现位置去重，不新增大小写归一化。
- 关键词搜索使用逗号边界精确匹配；人工关键词不要求人工描述或 AI caption 非空。
- 所有格式的人工关键词只保存在 `file_user_metadata`；AI 输出只保存在 `image_ai_metadata`，文档正文、OCR 和其他派生证据未来也必须使用独立所有权，不得覆盖人工数据。

普通搜索不能被快捷指令污染。只有白名单领域加冒号的输入才进入快捷指令解析。

## 12. 设置系统

查看范围通过现有偏好系统保存为 `skim`、`all`、`custom` 三种模式：搜索结果与 skim 分别持久化当前模式，同时共享一份自定义扩展名集合。默认精简范围包含 55 种常见成品、办公、媒体和创作项目格式；全部范围覆盖 123 种已登记格式，skim 的全部浏览仍可额外显示未登记普通文件。搜索服务在数据库结果和可取消扫描快照两层同时应用范围过滤，切换模式不改变正式视觉、AI 或缩略图边界。Settings 统一命名为“自定义查看”，格式配置以“圆点 + 类别文字”的完整按钮切换整类，扩展名按钮选中后使用副色背景并根据亮度自动选择文字颜色。Windows 隐藏文件开关保持只作用于自定义 skim，搜索结果不读取或应用隐藏属性。目录读取仍只发生在用户明确浏览时，skim 模式切换在 Renderer 对当前一级目录结果进行过滤，不启动额外递归扫描；Windows 端使用 `fsutil` 枚举盘符、单次 `cmd vol` 读取卷标，并通过 Unicode `dir /a:h` 按当前目录批量读取隐藏属性，不在导航热路径启动 PowerShell，也不逐文件启动外部进程。

Settings 当前覆盖：
- 语言、登录启动、系统通知、后台 line 与边缘收起。
- 主题模式、窗口材质、主题色、副色与界面字号。
- 自定义查看范围及 Skim 隐藏文件显示。
- 缓存统计、清理、自动优化、目录与索引任务管理。
- 快捷动作：显示并聚焦主窗口、隐藏到 line、展开或收起 Skim、恢复主窗口、窗口内目录切换与打开 Settings。
- 全局快捷键开关。
- 快捷指令查看列表和解析开关。
- llama.cpp 版本配置。
- 视觉模型配置。
- 缓存统计与清理。
- 配置目录管理。
- AI 深度匹配、自动缓存优化与嵌入元数据补齐。
- 运行信息展开；静态展示应用诊断、运行时与模型文件状态、目录、路径、大小和修改时间，服务运行时补充地址、PID 与启动时间。可加载模型组合数与 GGUF 文件数分开统计，详情值允许选中复制以便排查。
- 目录服务异常在“配置目录”行内显示“暂不可用”，不再弹出旧 Modal。
- 扫描 / 识别任务在“索引”区域内展开，展示进度、成功 / 失败数、当前文件、完成、取消、失败和重试状态。
- 缓存清理成功使用行内反馈；缓存失败与文件删除失败复用当前新版确认弹层和重试流程。

默认全局窗口快捷动作依次为 Alt + 反引号、`Alt+1`、`Alt+2`、`Alt+3`、`Alt+4`，分别显示并聚焦主窗口、隐藏主窗口并显示 line、展开或收起 Skim、以默认大小和位置显示主窗口、打开 Settings。配置只保存当前稳定快捷映射；另有默认 `Alt+Q` 的“目录切换”在主窗口搜索结果界面生效，按“所有已添加目录 → 各已添加目录 → 所有已添加目录”稳定循环，保留其他搜索条件并复用手动目录标签的刷新与输入框临时反馈；所有目录选择入口把新目录作为独立浏览上下文并从结果顶部开始，单纯排序继续保留当前滚动位置，按键自动重复不触发连续切换。快捷指令继续独立生效，不与快捷动作互相替代。

全局快捷动作的可用性以主进程 `globalShortcut.register` 的真实结果为准。主窗口显示、隐藏到 line、Skim、主窗口复位和 Settings 的全局组合在启动、开关和修改时检查；注册失败的快捷键映射候选不写入偏好。“目录切换”只参与 Renderer 内部重复检查，不参与系统级可用性探测。开发版、打包版或其他程序造成的运行期临时占用只记入本次运行的不可用项，不得自动关闭或改写用户保存的全局快捷动作总开关；未冲突的组合继续注册，下次启动时重新尝试全部组合。进入录入状态时，原快捷键胶囊就地显示等待按键状态，并临时暂停 Cap7CE 全部全局快捷键，避免旧动作抢先触发；有效组合键立即保存，`Esc`、点击其他位置或离开配置页取消录入，随后恢复最后一次有效配置。

`Esc` 是固定的窗口内取消键，不属于可配置快捷动作，也不能分配给其他快捷动作。它只按当前交互层级取消快捷键录入、快捷指令确认、菜单、标签展开、编辑、确认弹层或结果选择；没有可取消内容时不切换页面、不收起窗口，也不退出软件。正在执行且不能安全中断的删除、缓存清理或保存任务不会被 `Esc` 隐藏。

旧版通用 Modal 组件及其专用遮罩样式已经移除。Settings 内容结构已经进入 0.9.9 稳定状态，后续不要按旧设计稿重排页面。

## 13. 快捷指令架构

快捷指令采用冒号语法，不是自然语言助手。

基本规则：
- 只有白名单领域加半角或全角冒号开头才解析。
- 非白名单、无冒号或普通关键词继续走搜索。
- 解析器输出 domain、action、args、raw。
- 命令表记录有效命令、参数要求和是否需要二次确认。
- 执行器负责将命令分流到现有 UI / 设置 / 文件能力。
- 危险命令进入输入框内 `y / n` 确认态。

白名单领域包括 `see:`、`win:`、`dir:`、`cache:`、`ai:`、`skim:`、`set:`、`ui:`、`line:`、`edge:`、`key:`、`cmd:`、`lang:`、`llama:`、`model:`、`app:`。`see:` 统一控制主窗口左侧栏的目录、查看范围和排序，其中 `default` 在指令层映射内部 `skim` 范围值；`skim:` 除进入和返回根目录外，还控制其独立查看范围、排序及 Windows 隐藏文件偏好。独立 skim 缓存归入缓存领域，通过 `cache:skim` 确认后清理。

已接入方向包括设置 / 外观 / 开关类、查看 / 窗口 / 目录与排序类、运行时 / 模型类，以及二次确认类命令。旧 Settings 子页跳转、`win:normal`、`see:all`、`ai:deep` 和整个 `tag:` 领域已随对应界面能力退役，不保留无效果、概念重复或语义过时的兼容入口。目录路径添加复用 `directories:addCandidates`；`see:dir`、`see:scope` 与 `see:sort` 复用主窗口左侧栏的正式搜索入口，并保留未被本次指令修改的其他搜索条件。`ui:acrylic|mica`、`ui:font`、`win:reset` 及新增 Skim 指令分别复用正式偏好和窗口动作；`ai:on|off` 控制全局 AI 能力，`ai:search on|off` 只控制当前搜索。贴边收起、系统通知和自动缓存优化继续复用现有 Settings 偏好入口。`cache:clear`、`cache:thumb` 与 `cache:skim` 均保持二次确认，其中 `cache:thumb` 只清理正式搜索的普通与 Shell 缩略图缓存，并在清理前停用自动缓存优化。帮助清单与命令表由集成测试逐项核对，危险命令不得绕过确认态。

## 14. 风险和开发约束

高风险区域：
- 不要轻易改主窗口 normal / standby、line 与 Settings 生命周期。
- 不要轻易改 `BrowserWindow` bounds、minSize、resize 阈值。
- 不要轻易改主窗口 show / hide 生命周期。
- 启动动画必须保持独立窗口，不能控制主窗口。
- `previewWindow` 必须保持独立且可复用，不得并入主窗口 shellState、任务栏或 resize 阈值。
- 透明无边框窗口不要通过占满 BrowserWindow 的 CSS box-shadow 模拟外部阴影；这会在圆角透明区产生合成残影。
- 双击最大化交互当前作为小范围 UI 入口处理，不应引入并行窗口逻辑。
- 原生 textarea 滚动条在 Windows / Electron 下可控性有限，优先通过高度策略减少滚动条出现。
- UI 修改优先小步局部调整，避免大规模重构。
- 禁止随手改搜索 SQL、SQLite 数据结构、llama.cpp 流程、缓存写入和文件扫描业务。

如果一个问题表现为 UI 异常，先定位真实触发路径和 DOM / CSS 层级，不要用扩大排除区、魔法 margin、固定 top offset 等方式掩盖。

## 15. 目录结构

主要目录：

| 路径 | 说明 |
| --- | --- |
| `electron/` | 主进程、IPC、窗口、索引、缓存、文件系统、llama.cpp、模型管理；`aiContentPaths.ts` 固定开发态与当前程序副本的 AI 内容路径边界 |
| `electron/preload.ts` | Renderer 安全 API 暴露 |
| `src/renderer/` | stable React UI、搜索与 Skim 编排、Settings、Preview、样式和快捷指令 |
| `src/renderer/dialogs/` | 关键词编辑与确认面板的纯 UI、局部类型和纯计算模型；确认类内容共用 `DialogShell` 浮层表面与按钮边界，业务状态仍由顶层编排持有 |
| `src/renderer/components/` | 无业务状态的 Renderer 通用展示组件 |
| `src/renderer/results/` | 搜索结果缩略图、格式回退、证据分类标题卡及文件索引 / 布局索引映射；分类卡不进入业务文件数组，跨视图能力仍通过通用辅助模块复用 |
| `src/renderer/keywords/` | 可复用的关键词标签编辑控件；单文件或多文件保存编排仍由各宿主持有 |
| `src/renderer/assets/icons/` | 文件格式、stable 导航、排序、设置、签名和警告 SVG 图标 |
| `src/renderer/assets/startup/` | 冷启动提示动画素材 |
| `src/shared/` | 共享类型与常量 |
| `docs/` | 当前架构、UI 规划和方案文档 |
| `scripts/architecture-boundaries-*` | 架构体量、Renderer 权限边界、顶层反向依赖和 main IPC 新增位置的自动守门 |
| `build/` | 应用图标等构建资源 |
| `dist/` | Vite 构建输出 |
| `dist-electron/` | Electron 主进程构建输出 |
| `release/` | 打包输出目录 |

用户配置、索引和缓存位于 `%APPDATA%\Cap7CE`。每个程序副本的模型与运行时分别位于其 `models` 和 `llama.cpp` 子目录，应用不主动创建或迁移。当前开发阶段不迁移旧 `%APPDATA%\Image Everything`，也不要自动删除旧目录。

## 16. 0.9.9 当前稳定状态

Cap7CE 0.9.9 的产品 Renderer 与原生窗口宿主均已统一为新版 stable：主窗口、独立 Settings 与 Preview 使用 40 DIP Window Controls Overlay 和可实时切换的 Acrylic / Mica，系统拒绝所选材质时回退安全纯色；采用连续响应式布局并允许三窗口并存。旧主 Renderer、旧 Preview 展示分支、独立与同窗 Capsule、micro/mini 自动形态转换、分形态布局记忆、旧 presentation 策略、兼容最大化控制器、模式切换 IPC 和对应偏好字段均已删除；磁盘上的旧布局和已有用户数据不主动清理，历史偏好 JSON 中多余字段由当前读取器安全忽略。当前稳定边界还包括虚拟化搜索与 skim 网格、带桌面与用户星标目录的快速访问边栏、完整 Windows 文件与目录路径直达、123 种已登记格式的确定性文件名 / 根目录 / 相对路径 / 手工关键词搜索、逐词证据可信度排序、15 秒可取消扫描快照、失败抑制后的原生视觉缓存，以及相互隔离的 skim 与搜索系统图像缓存。普通 JPG / JPEG / PNG / WEBP 仅在尺寸、像素量或文件体积超过受限阈值时生成 2560px 预览缓存，轻量源文件直接读取。视觉 / 文件信息 / 文本 / Markdown / 字体 / 归档 / EPUB / MOBI / 音频 / 视频 / PDF / Office 共用预览窗口；Preview 的单文件手动关键词在信息边栏内以标签方式编辑，经受限 Preview 保存链复用统一规范化与索引写入，并通知主窗口刷新当前结果；多选编辑继续使用共享浮动编辑卡片。HEIC、HEIF、常见相机 RAW 与受支持视频可在本机 Windows 扩展或 Shell 解码能力可用时获得可选缩略图，失败时回退格式图标与文件信息。Office 转换结果在当前进程内按源文件身份复用。目录拖入添加、文件/文件夹原生拖出及系统剪贴板复制、共享查看范围、自绘滚动条、主题感知图标与拾色器、输入框内快捷指令和查看条件切换反馈、窗口内目录循环切换、中英文运行时语言，以及具备真实注册检测的可配置全局快捷动作均保持稳定。只有 15 种正式视觉格式进入按需 AI 搜索，系统解码能力不会扩大 AI、自动优化或模型输入边界；OCR 与不可见的全目录 AI 深度索引未接入。

L6 最终审计补充：中间省略文件名的单行与双行布局由 `src/renderer/components/MiddleEllipsisFileName.css` 随共享组件持有，等待指示器的 SVG 尺寸、主题渐变与旋转关键帧由 `src/renderer/WaitingIndicator.css` 持有；二者均不属于全局样式入口。搜索结果与 Skim 只使用 `ResponsiveFileContextMenu`，菜单主题变量、动作类型与文件名拆分工具位于 `fileContextMenuShared.ts`；旧分栏菜单组件、旧 Results / Skim 适配层、旧搜索胶囊、占位网格、专用 CSS 和零调用图标均已删除。`scripts/architecture-boundaries-baseline.json` 直接守护当前 stable 搜索、菜单、Skim 与窗口入口；`build:electron` 在编译前只清理 `dist-electron` 和对应的 TypeScript 增量缓存，完整 `build` 随后扫描 Renderer 与 Electron 生产输出，不得发现旧宿主、兼容标题栏或 Capsule 入口标识。

后续阶段应进入小修小补和稳定性打磨：
- 优先修复真实使用中可复现的问题。
- 新功能谨慎加入，先确认不会破坏 stable 窗口生命周期、搜索入口、托盘后台和索引缓存链路。
- UI 调整尽量限定在目标组件和相关 CSS，避免牵动主进程窗口生命周期。
- 搜索、识别、缓存和 SQLite 是业务核心，除明确任务外不要顺手修改。
