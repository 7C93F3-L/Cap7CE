# Cap7CE WinUI 主线

当前开发入口为 Windows x64 / C# / WinUI 3。Electron 代码保留为迁移参考与显式 legacy 入口，默认开发、构建和可携带目录不启动或打包 Electron。

## 开发

- `npm ci`：安装构建工具及既有独立工作进程依赖。
- 关闭本项目正在运行的原生窗口，再执行 `npm run build`。
- `npm run dev` 或 `& ./shell/run.ps1`：启动 WinUI。
- `npm run test:native:smoke`：一次短烟测，60秒进程超时，无自动重试；仅使用临时Catalog/图片/缓存，不扫描真实磁盘。
- `npm run build:legacy`、`npm run dev:legacy`：显式保留的Electron入口。

构建会复用现有Core产品宿主、配置/文件操作宿主、原生视觉适配器和独立Node工作进程，生成所需格式/筛选/指令资源。资源暂仍来源于旧源码目录；不能直接删除electron/src共享文件。

## 索引与属性

默认连接现有产品Core Host，使用同用户私有管道、随机握手secret及服务端PID核验。Core独占Catalog、负责Reader增量维护；WinUI不直接操作SQLite。

设置 → 缓存与索引 → 管理元数据提取：

1. 索引服务缺失/权限错误时，点击安装/修复；复用原Core Setup的UAC、身份验证和事务回滚，始终保留Catalog。Reader需要.NET 10 x64运行时。不要将整个WinUI界面提升为管理员。
2. 发现磁盘并选择范围，明确确认后建立/更新索引；重建和停止有独立入口。
3. 属性按指定目录或全部已索引磁盘明确确认后执行，支持暂停、继续、取消目录队列和查看状态。不会在启动或打开设置时自动恢复旧提取任务。
4. 右键获取/刷新元数据打开同一任务窗口；单文件会预填所在目录，页面会说明并要求确认目录范围。

任务状态仅在任务执行且页面可见时刷新；关闭页面停止UI监视，不取消Core任务。目录变更使用Core的服务端等待通知，不做UI定时全量刷新。

`CAP7CE_PHASEF_CATALOG`显式覆盖时继续使用原隔离只读QueryHost，不能维护索引或提取属性；这是烟测和诊断入口，不是产品默认运行方式。

## 原生系统功能

- 单实例由Windows App SDK AppInstance接收重复启动并唤起现有主窗口。
- 登录启动仅在用户切换设置时写入当前用户Run项，不修改旧Electron启动项。
- 四个已有原生动作可注册固定全局快捷键：Alt+`聚焦搜索、Alt+2恢复窗口尺寸、Alt+5设置、Alt+Q收藏轮换；冲突明确报告，不查询其他进程。快捷键录制、待机线及旧窗口模式动作尚未接通。
- 通知按用户开关注册；清理缓存和页面观察到的任务完成可发送通知。
- 缓存清理通过Core缓存所有者完成，仅清理WinUI隔离缓存，保留源文件、索引、关键词和旧界面缓存。
- 诊断可打开本机日志目录、导出已知原生日志及基础运行信息；不导出素材、数据库或配置。
- 更新检查仅响应主动点击，筛选WinUI ZIP发布；不下载或安装现有Electron发布。

## 可携带交付

`npm run pack`生成原生可运行目录；`npm run dist:portable`额外生成ZIP。目录带有自包含.NET/Windows App SDK的WinUI与Core宿主、独立工作进程、Core Setup载荷和空models/llama.cpp目录，不包含Electron、用户配置、数据库、素材或模型。

运行`Start-Cap7CE.cmd`，保持所有目录一起移动。索引仍需安装本机Reader服务及其.NET运行时；可携带界面不意味着不需要系统索引组件。程序保留现有Catalog和配置，两个产品Core Host不能同时持有同一Catalog。

默认`dist:installer`明确提示使用原生ZIP；旧安装器只能通过`dist:installer:legacy`执行。当前未替换远程Release、标签或正式更新通道。

## 数据与保留边界

Catalog及Core配置仍使用现有LocalAppData/Cap7CE目录；WinUI外观/布局和视觉缓存暂保留原Cap7CE-PhaseF位置，避免无授权迁移丢失现有设置。不清理旧缓存、不自动重建全盘、不自动运行AI。

主窗口、设置、预览使用现有Mica/Mica Alt及统一用户颜色；菜单/浮层使用亚克力。虚拟网格、缩略图、列表、原比例布局、收藏排序、文件拖出和手动关键词沿原动作链。

尚未达到Electron完整功能对等：micro/mini等旧窗口形态、托盘/关闭后台、快捷键录制和快捷指令执行、完整语言切换、自动AI关键词/批量编辑，以及部分专用预览交互仍保留明确不可用状态。源码主线切换不代表这些功能已验收或已正式发布。
