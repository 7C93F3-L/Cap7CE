# Cap7CE 软件架构

当前源码主线为 Windows x64 / C# / WinUI 3，候选版本为 2.0.0。Electron/Renderer/Preload 源码、React/Vite 和旧构建入口已退役；历史实现与迁移记录可从 Git 历史查看。2.0.0正在进行发布准备，正式发布前以最终安装器验证为准。

## 运行边界

- `shell/Cap7CE.WinUI`：原生窗口、托盘、设置、预览及交互编排，复用统一窗口/导航动作。
- `shell/Cap7CE.QueryHost`：隔离测试库使用的只读查询宿主，不随正常安装器分发；正式产品连接独立Core宿主，WinUI不直接访问Catalog SQLite。
- `core/src`：产品 Core、Reader 协议/宿主、Catalog、文件操作、属性任务与安装能力。
- `core/node`：独立固定 Node 运行库的解析、预览、模型及缓存领域。实现只依赖本目录和明确的第三方解析依赖。
- `core/shared`：原生 Node 领域及资源生成共用的类型契约；不含旧界面控制器。SearchState/快捷键类型仅保留资源生成实际使用的声明。
- `native`：Windows 视觉和媒体属性辅助进程。普通查询不授予 Reader 管理或修复权限。
- `resources`：原 SVG 图标和签名载荷；WinUI 输出仍为 Assets/Icons 和 Assets/phase7.dat。

## Core 与数据所有权

Core 独占 Catalog 与属性调度；Reader 负责受限 NTFS 读取，普通 Core 校验身份并消费结果。Catalog 基础索引与详细属性提取保持分离，建库/修复/提取授权仍由现有用户动作触发。普通目录浏览删除不依赖Catalog身份，FileAccessGuard记录实时文件身份并在确认后复核，仍交给既有FileOperations宿主移入回收站；关键词菜单只按Core连接及所选磁盘状态提供预先提示，逐文件存在性、创建版本及修订号仍由Core关键词存储校验。目录入口与物理文件身份分开，失败或不完整枚举保留原可用数据。

Catalog v2 保留私有 SQLite 连接缓存和 WAL；前台读取已提交快照，后台写事务不通过 shared-cache 表锁串行化查询。源文件读取、派生图像、缓存发布和数据库写入分别由各自领域持有，不在界面层直接执行。

磁盘Processed保留已发布索引计数，快照扫描进度由CatalogPreparationProgressOwner单独持有；旧版中断留下的零计数仅在building/needsRebuild状态按有效节点索引只读统计，不写库或将旧快照标为就绪。CatalogJournalMonitor每个新生命周期首次运行会恢复已选needsRebuild磁盘，后续显式停止/重启监视器不重新安排该恢复，不增加失败重试循环或调整系统USN日志。手动关键词在building/needsRebuild期间仍按保留节点、创建时间和独立修订号读写；文件操作端继续核验实时文件身份，未就绪磁盘仍不参与搜索。CoreProcessDiagnostics立即将有界、无路径的catalog-diagnostic-v1事件交给既有轮转会话日志；失败类型为固定异常类型名，不记录文件路径或Reader身份。

快照仍完整读取并在同一事务原子发布；正式节点与路径采用空值安全的差异更新，入口集合按创建版本及完整名称集合比较，未变化集合不删除重建。暂存入口仅复用本事务内预编译命令，不放松完整观察、父目录、源版本和发布所有者校验。入口补充读取与入口暂存分别计时，未单独测量的增量路径保持空值，不以0冒充测量结果。

元数据在原生Core连接后显式恢复已保存授权，目录范围通知也唤醒既有Core协调器；恢复遇到未就绪基库时等待下一次真实变更通知重试，不增加发现轮询。配置未授权或手动暂停不启动内容提取，右键目录完成后仍为一次性任务。提取保留单任务拥有者，以原有时间预算内的串行执行和有界让步替代逐项固定等待；取消、关停和源版本验证不变。

启动不运行全库完整性扫描。CatalogHealthController 按既有七天到期规则，仅在主窗口后台/隐藏/最小化时开始独立检查，开始后完成，退出时取消。检查使用既有库的 ReadWrite 非创建连接，先 query_only 再 quick_check；结果有界保存，不修复或重建数据库。

## Node 职责域

| 目录 | 责任 |
| --- | --- |
| resourceCatalog/domain | 格式、筛选、条件转换、语言及指令参考，生成 WinUI JSON |
| applicationUpdates | 安装器版本筛选、受校验的断点下载、暂停/恢复及安装意图 |
| fileFacts/domain | 文件属性解析、版本、字体/模型解析线程和压缩包只读列表 |
| metadataExecution | 私有工作进程装配、帧传输、视频帧客户端及唯一提取器清单 |
| embeddedMetadata | 内嵌信息读取/筛选与源修订计算 |
| interactiveMetadata / storedMetadata | 有界临时读取、只读旧索引读取及结果校验，不发布持久记录 |
| visualRendering | 解码、工作进程/临时文件生命周期和 Shell 视觉回退 |
| visualCache | 目录/版本/帧契约、签名校验及唯一缓存发布所有权 |
| providerPreview / textPreview / officePreview | 各格式会话、原有读取预算、取消/退出与临时资源释放 |
| directoryBrowse / sourceInformation | 只读枚举、分页/递归与文件/目录信息统计 |
| modelRuntime / modelSettings / localKeywords | 模型进程、版本/配对设置、空闲控制及回环推理请求 |
| transport | 有界私有管道 RPC，不持有业务状态 |

所有领域继续保持既有预算：取消等待实际线程/子进程退出，迟到结果不回写已退役视图，临时资源在持有者关闭时释放。模型手动启动与 AI 临时使用保持不同空闲语义；本地推理使用字面 127.0.0.1，不继承代理或重定向。语言按请求/任务原有边界固定，语言刷新不重启查询或模型。

## WinUI 与更新

公共弹窗入口要求调用方显式传入ContentDialogButton，编译期阻止隐式继承默认动作。普通编辑/建库/服务配置使用Primary；删除、重建、缓存清理及会退出应用的更新安装使用Close；快捷键录入使用None，纯信息弹窗使用Close。Primary/Secondary/Close继续由原生控件排为左/中/右，禁用状态仍由现有输入与任务条件控制。

ContentDialog由ThemeService.Dialog统一创建，LanguageUi.Dialog只补充本地化内容；签名弹窗也复用该入口。创建时使用所属XamlRoot内容的ActualTheme，Opened/Closed管理实际主题变化订阅和解除，避免窗口选择浅色而独立弹窗仍跟随系统深色。DialogAccentResources继续仅提供本地强调色资源，不修改应用全局主题或对话框行为。

ShortcutCatalog统一声明固定通用键位与可编辑的专有快捷键；固定操作忽略历史覆盖且参与冲突检查，设置编辑器只列可编辑项。WorkspaceShortcutInput继续拥有主窗口/结果区、文本输入及弹层阻断规则；新增浏览快捷键仅编排WorkspaceToolbar既有随机/范围动作和FilterBar.Clear，不引入查询或筛选能力。

正式安装布局将完整应用载荷（WinUI及其.NET/Windows App SDK依赖、Core运行库、Node工作进程和第三方清单）集中到app子目录，cap7ce-native.json以layout=installed-app声明该布局。Shell运行根仍是载荷根；NativeContentPaths仅将用户管理的models与llama.cpp解析到安装根，与开发/便携布局区分。安装根保留Cap7CE.lnk和卸载程序；桌面/开始菜单快捷方式及安装完成启动指向app/Cap7CE.exe，进程检测仍使用Cap7CE.exe文件名。DisplayIcon注册到程序EXE的内嵌图标，不保留单独的顶层ICO。NSIS卸载通过app内入口及标识校验目录，搜索能力移除使用app内Setup，模型及独立Core/Reader的保留规则不变。

IndexOnboardingController在偏好成功加载、Core连接可用和主窗口可交互后检查未建库状态，每次运行最多展示一次原生对话框。纯IndexOnboardingPolicy按卷/任务状态拒绝已有索引、已发布计数、正在执行或不确定状态；已成功建库和永久退出提醒分别保存在ShellPreferences.IndexSetupCompleted、DismissIndexSetupPrompt，成功记录复用现有IndexStatusChanged通知，不新增轮询。连接或快照失败不触发首次引导，背景启动不激活窗口。IndexOnboardingDialog只拥有展示与选择；立即开始经共享IndexBuildActions重新核对任务、发现全部磁盘并调用既有VolumeSelection/CatalogBuild，设置页也复用同一动作。自定义范围经SettingsWindow.ShowIndex定位、展开并滚动到原目录索引卡片，不复制建库界面。

NativeCoreSetup在依赖与服务配置前枚举已就绪的固定NTFS盘符，通过既有--volumes参数明确授权Reader运行范围；不传空范围，避免Setup进入保留给探针的disconnect模式。该范围供磁盘发现及后续用户显式操作使用，不等同于Catalog建库选择或提取授权。安装和设置页修复共享这一入口，配置始终保留Catalog；索引操作错误进入现有Core诊断。

正常NSIS安装和覆盖更新默认配置搜索服务，不提供跳过选项。customInstall在本体落盘后ExecWait调用Cap7CE.exe的--install-search-service模式；该模式在窗口、应用身份与单实例初始化之前分流，复用CoreRuntimePrerequisite及NativeCoreSetup，不启动普通Core会话或索引扫描。独立只读--verify-search-setup-entry只验证嵌入策略和包内Setup入口，交付检查在无系统.NET路径条件下运行它。安装配置核对桌面与当前进程的实际SID，避免替另一个管理员账户绑定搜索授权；不符则明确失败。成功才完成安装，失败支持重试并保留诊断，需重启返回3010且不自动重启。索引页在正常Core连接后自动发现磁盘，由用户选择和开始建库。

安装或修复搜索服务的显式动作先由独立CoreRuntimePrerequisite服务补齐.NET依赖，CoreRuntimePolicy从嵌入的Core部署清单读取版本、微软URL、摘要和前台安装参数，CoreRuntimeInstaller独占有界下载、SHA-512验证与临时文件清理；校验到安装结束持有禁止写入/删除的文件句柄。已有兼容.NET 10 x64不联网；缺失时打开微软安装器，不静默安装、不自动重启、不删除共享运行时。依赖复检通过后NativeCoreSetup才断开Core并调用既有NativeAOT提升协调器；失败或需要重启不继续，设置页保留或尝试恢复连接。卸载及Setup的只读验证不依赖此流程，Core Setup不新增网络责任。Browse.Tests链接相同前置服务源码，以隔离响应和安装器验证缺失/取消/失败/重启边界。

窗口/标签/选择/预览使用现有统一动作与拥有者；独立视图和控件不把业务 IO 堆回顶层窗口。托盘“检查更新”打开设置并定位更新区后检查，下载由会话服务持有，窗口关闭后仍可继续；没有自动检查、下载或安装。

对外安装包统一命名为Cap7CE-Setup-<版本>-x64.exe，不附加技术栈名称；更新只接受对应版本的正式安装器，下载及安装前保留大小/SHA-256 校验。ShellExecute 成功后走正常退出；失败保持程序运行。安装器身份、目录和快捷方式延续既有 Cap7CE，NSIS 保留用户模型、配置、Catalog 和独立 Core/Reader 的保护逻辑。入口 Cap7CE.exe 同时保留匹配的 Cap7CE.pri 与程序集原 PRI。卸载“删除用户数据”在正式能力移除成功后清理当前用户的Cap7CE完整数据根、Cap7CE-PhaseF原生配置/日志和旧更新目录；未勾选仍保留，安装目录内模型/llama.cpp由独立选项控制。

## 构建与验证

应用文件替换阶段保留Core、NtfsReader和CapabilitySetup归属/恢复状态，不删除独立能力的管理记录；随后由正式Setup事务更新搜索组件。组件卸载失败时NSIS保留退出码与返回结果到当前用户临时目录的cap7ce-uninstall-core.log，并中止后续应用及用户数据清理；不自动接管缺失归属记录的组件。用户数据选项只提供选择，实际清理统一由customRemoveFiles在组件移除后、应用本体及登记删除前调用；明确切换到当前用户路径，逐项验证目标已不存在。cap7ce-uninstall-data.log追加记录全部实际路径、删除后属性和Win32错误；失败中止并保留卸载入口供重试，更新模式跳过此步骤。应用清理末尾只以非递归删除清除空容器，不移除仍有模型或组件的目录。

`npm run build` 先验证原生源码边界和类型，再打包固定 Node 运行库、发布 Core/QueryHost、生成资源并构建 WinUI。`npm run dev` 使用 shell/run.ps1，在正常交互桌面环境启动，避免开发工具的 AppData 重定向；构建保护正在运行的程序。

`npm run pack` 生成自包含多文件目录，`dist:portable` 生成 ZIP，`dist:installer` 使用预打包的原生目录生成 NSIS。保留的 electron-builder 仅是 NSIS 工具；其预打包API要求的框架版本显式写在安装器工具配置中，不引入Electron依赖或下载。npm不再安装Electron运行时，载荷不包含app.asar/Chromium。不得把源码构建等同于安装包验收。

`native-source-check` 守护全部原生模块体量、迁移解析器源码基线、九个运行入口的实际依赖闭包和旧目录/依赖禁入；`native-domain-check` 保留缓存发布、只读元数据、预算、取消、后代路径及回环请求关键锚点。Core的十项源码审计由core-architecture-suite统一执行，约束项目依赖、源IO/数据库归属、Reader/Setup权限与生命周期、原生客户端和预打包边界；构建及test:source均运行这些检查，不执行系统探针。WinUI语言/界面架构检查继续生效。

测试直接加载规范源码，或通过实际固定 Node 的协议在临时目录验证，移除了旧 Shell/Renderer 专用测试。npm test 包含源码边界、WinUI 布局、Core 测试及原生运行测试；交互/视觉仍由用户验收。源码构建、自动测试、交互验收和安装包验证是独立证据，不相互替代。

`npm run test:core`先验证支持配置的锁文件稳定性，再运行Core完整回归；纯协议项目不声明平台运行时，锁文件仅保留实际net10.0图。取消快照会先收敛到needsRebuild，诊断测试区分主动清理后的重试与未回收的building状态。`npm run test:delivery`独立检查NativeAOT Setup、产品载荷完整性/篡改拒绝和从NSIS提取的实际Setup；仅验证，不安装服务、删除Catalog或修改系统配置。安装向导、快捷方式与启动仍需实际人工验收。

界面文案以shell/Cap7CE.WinUI/Localization/messages.json为唯一来源；资源生成不再导出旧设置文案副本。winui-language-usage按原生源码、帮助清单及实际生成的筛选身份收集静态/动态键，语言检查拒绝缺失键和无引用键；测试复用在用文案，不以测试引用保留已退役提示。

KeywordEditDialog仅承载右键关键词编辑会话，复用DetailsKeywordEditor的弹窗模式及KeywordSelectionService，不另建草稿或存储链路。弹窗约束正文可用宽高并保留原生底部按钮；详情栏默认模式不变。标题清空动作复用编辑器ClearDraft；DialogTextActionResources统一建库提醒和关键词弹窗标题文字操作的普通/悬停状态。

WorkspaceNotice统一主窗口底部普通提示、查询、AI、索引、元数据和命令确认/执行的展示，使用固定高度及独立全宽进度行。各领域控制器继续拥有任务观察和取消；浮层只拥有提示显示优先级及隐藏计时，提示实际展示且鼠标未悬停时计时，任务遮挡或卸载时停止，移出后重新计时，不改变任务执行。

2.0.0发布准备保持当前安装与数据所有者边界，不新增旧版本兼容迁移。发布目录携带LICENSE、NOTICE和THIRD_PARTY_NOTICES；sharp更新到0.35.5，所有运行库仍由锁文件和现有复制脚本生成。截图资源本轮保留历史版本，不能作为当前交互实现的依据。
