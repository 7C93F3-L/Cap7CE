# Cap7CE WinUI 主线

当前开发入口为 Windows x64 / C# / WinUI 3。Electron 代码保留为迁移参考与显式 legacy 入口，默认开发、构建和可携带目录不启动或打包 Electron。

## 开发

- `npm ci`：安装构建工具及既有独立工作进程依赖。
- 关闭本项目正在运行的原生窗口，再执行 `npm run build`。
- `npm run dev` 或 `& ./shell/run.ps1`：启动 WinUI。
- 已完成构建后可用 `& ./shell/run.ps1 -NoBuild` 直接启动；隔离测试库必须显式传 `-Catalog <路径>`，正常启动不继承外部测试库覆盖。
- `npm run test:native:smoke`：一次短烟测，60秒进程超时，无自动重试；仅使用临时Catalog/图片/缓存，不扫描真实磁盘。
- `npm run build:legacy`、`npm run dev:legacy`：显式保留的Electron入口。

构建会复用现有Core产品宿主、配置/文件操作宿主、原生视觉适配器和独立Node工作进程，生成所需格式/筛选/指令资源。资源暂仍来源于旧源码目录；不能直接删除electron/src共享文件。

开发启动统一使用run.ps1。DesktopProcess.cs通过Windows的PROC_THREAD_ATTRIBUTE_PARENT_PROCESS，以当前交互桌面Shell为父进程创建WinUI，使其继承正常桌面的token/job环境，避免从带MSIX文件重定向的开发工具直接启动时读取另一份AppData配置。环境变量仍由启动脚本传入，原配置路径规则和所有数据保持原位；不提权、不拷贝或合并配置。无交互桌面或无权创建进程时明确失败，不回退到已知会读错配置的直接启动。不要再从工具中用普通Start-Process启动开发EXE。

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/winui-desktop-launch.ps1`执行有界原生启动检查：验证环境变量穿过普通子进程，并在已有偏好文件存在时只读校验实际文件句柄路径。测试仅写入并删除自己的临时结果文件，不修改偏好或启动UI/Core。

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

自动添加关键词已接通收藏目录菜单、结果右键及右侧关键词卡片：点击直接执行，底部窄条显示识别状态和进度，尾部按钮可取消，不弹独立窗口。目录包含已入库的子目录文件，单文件/多选同样只处理主线格式表支持的视觉文件。运行库与视觉GGUF在设置中选择，任务按需启动本地模型。生成结果合并到Core现有关键词，保留手动词与并发修改，不会修改源素材。源文件未入库时明确失败，不自动建库。退出程序取消未完成工作，新任务不恢复上次工作。

Catalog及Core配置仍使用现有LocalAppData/Cap7CE目录；WinUI外观/布局和视觉缓存暂保留原Cap7CE-PhaseF位置，避免无授权迁移丢失现有设置。不清理旧缓存、不自动重建全盘、不自动运行AI。

主窗口、设置、预览使用现有Mica/Mica Alt及统一用户颜色；菜单/浮层使用亚克力。虚拟网格、缩略图、列表、原比例布局、收藏排序、文件拖出和手动关键词沿原动作链。

尚未达到Electron完整功能对等：micro/mini等旧窗口形态、托盘/关闭后台、快捷键录制和快捷指令执行、完整语言切换、批量手动关键词编辑，以及部分专用预览交互仍保留明确不可用状态。源码主线切换不代表这些功能已验收或已正式发布。
