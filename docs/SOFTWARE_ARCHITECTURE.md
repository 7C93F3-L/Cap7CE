# Cap7CE 软件架构

当前源码主线为 Windows x64 / C# / WinUI 3，版本仍为 1.0.4。Electron/Renderer/Preload 源码、React/Vite 和旧构建入口已退役；历史实现与迁移记录可从 Git 历史查看。本轮未发布新版本。

## 运行边界

- `shell/Cap7CE.WinUI`：原生窗口、托盘、设置、预览及交互编排，复用统一窗口/导航动作。
- `shell/Cap7CE.QueryHost`：现有 Core 会话和有界查询接口；WinUI 不直接访问 Catalog SQLite。
- `core/src`：产品 Core、Reader 协议/宿主、Catalog、文件操作、属性任务与安装能力。
- `core/node`：独立固定 Node 运行库的解析、预览、模型及缓存领域。实现只依赖本目录和明确的第三方解析依赖。
- `core/shared`：原生 Node 领域及资源生成共用的类型契约；不含旧界面控制器。SearchState/快捷键类型仅保留资源生成实际使用的声明。
- `native`：Windows 视觉和媒体属性辅助进程。普通查询不授予 Reader 管理或修复权限。
- `resources`：原 SVG 图标和签名载荷；WinUI 输出仍为 Assets/Icons 和 Assets/phase7.dat。

## Core 与数据所有权

Core 独占 Catalog 与属性调度；Reader 负责受限 NTFS 读取，普通 Core 校验身份并消费结果。Catalog 基础索引与详细属性提取保持分离，建库/修复/提取授权仍由现有用户动作触发。目录入口与物理文件身份分开，失败或不完整枚举保留原可用数据。

Catalog v2 保留私有 SQLite 连接缓存和 WAL；前台读取已提交快照，后台写事务不通过 shared-cache 表锁串行化查询。源文件读取、派生图像、缓存发布和数据库写入分别由各自领域持有，不在界面层直接执行。

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

窗口/标签/选择/预览使用现有统一动作与拥有者；独立视图和控件不把业务 IO 堆回顶层窗口。托盘“检查更新”打开设置并定位更新区后检查，下载由会话服务持有，窗口关闭后仍可继续；没有自动检查、下载或安装。

更新只接受专用 WinUI 安装器，下载及安装前保留大小/SHA-256 校验。ShellExecute 成功后走正常退出；失败保持程序运行。安装器身份、目录和快捷方式延续既有 Cap7CE，NSIS 保留用户模型、配置、Catalog 和独立 Core/Reader 的保护逻辑。入口 Cap7CE.exe 同时保留匹配的 Cap7CE.pri 与程序集原 PRI。

## 构建与验证

`npm run build` 先验证原生源码边界和类型，再打包固定 Node 运行库、发布 Core/QueryHost、生成资源并构建 WinUI。`npm run dev` 使用 shell/run.ps1，在正常交互桌面环境启动，避免开发工具的 AppData 重定向；构建保护正在运行的程序。

`npm run pack` 生成自包含多文件目录，`dist:portable` 生成 ZIP，`dist:installer` 使用预打包的原生目录生成 NSIS。保留的 electron-builder 仅是 NSIS 工具，npm 不再安装 Electron 运行时，载荷不包含 app.asar/Chromium。不得把源码构建等同于安装包验收。

`native-source-check` 守护全部原生模块体量、迁移解析器源码基线、九个运行入口的实际依赖闭包和旧目录/依赖禁入；`native-domain-check` 保留缓存发布、只读元数据、预算、取消、后代路径及回环请求关键锚点。WinUI 语言/界面架构检查继续生效。

测试直接加载规范源码，或通过实际固定 Node 的协议在临时目录验证，移除了旧 Shell/Renderer 专用测试。npm test 包含源码边界、WinUI 布局、Core 测试及原生运行测试；交互/视觉仍由用户验收。源码构建、自动测试、交互验收和安装包验证是独立证据，不相互替代。
