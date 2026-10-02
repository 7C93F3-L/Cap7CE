# Cap7CE Core

`core/` 是全盘基础目录方向的独立 .NET 10 工程。P1.0–P3.8c 已完成普通 Core、原生 SQLite Catalog、SC/1、CR/2、受限 Reader、真实 NTFS 初建 / 增量 / 断档重建、NativeAOT 能力事务、Skim 内独立搜索与只读结果调用，以及恢复、安装生命周期、正式化审计、产品能力接线和常规安装人工矩阵。常规 Cap7CE 1.0.4 包携带休眠的确定性能力载荷，并且只在用户主动点击启用 / 修复时提权；主搜索、主网格与现有 `sql.js` 仍不读取 Core。

## 项目职责

- `Cap7CE.Core.Protocol`：Shell 与 Core 的版本化线协议契约及 4 字节长度前缀 JSON 帧。
- `Cap7CE.Core.Reader.Protocol`：普通 Core 与高权限 Reader 的固定二进制 CR/1–CR/2 契约；不拥有传输、服务或 NTFS 能力。
- `Cap7CE.Core.Reader.Host`：受限 Windows 服务宿主；只从固定受保护配置读取许可 SID 和卷选择，以只读 MFT / USN 返回有界目录元数据，不拥有文件正文、搜索、SQLite、源卷写入或网络能力。
- `Cap7CE.Core.Catalog`：schema v1 验证目录与 schema v2 产品目录、事务、范围查询、保存范围、路径缓存和每卷状态的唯一所有者。
- `Cap7CE.Core.Adapters.Abstractions`：受限元数据来源的抽象边界。
- `Cap7CE.Core.Host`：普通权限 Core 的唯一组合根和进程入口；组合 Reader、Catalog、同步状态机和 SC/1 产品能力，并保留显式合成 / 真实验证入口。
- `Cap7CE.Core.Setup`：零生产项目依赖的部署清单、受限 Setup 入口、认证请求协议和事务后端；以 source-generated JSON 保持 NativeAOT 兼容。它不下载 Runtime，也不接受路径或设备名；启用 / 修复可额外携带严格的大写盘符白名单，移除不得携带卷选择。
- `Cap7CE.Core.Tests`：协议、进程、原生目录和边界测试宿主。

依赖方向固定为：四个基础项目互不引用；普通 `Host` 组合 SC/1、Reader Protocol、Catalog 和适配器抽象，Reader Host 只依赖 Reader Protocol，Setup 保持零生产项目依赖。任何反向依赖都会被 Core、Reader 与 Setup 架构守门拒绝。

## P1.1–P1.4 已实现

- 同一 Windows 用户可连接的本机命名管道；默认运行 Host 不启动管道。
- 通过标准输入传入的一次性 256-bit 会话密钥、固定时间比较、双方进程身份和首帧握手。
- 1 MiB 帧上限、严格 JSON、结构化错误、协议版本与 deadline 校验。
- 每页最多 200 条的分页、绑定查询 / 排序 / 卷范围 / 目录版本且带 HMAC 和有效期的 opaque cursor、跨请求取消。
- 10 万条纯合成元数据的真实跨进程分页，以及 100 万条合成记录的常量内存分页；不包含本机文件名、路径或内容。
- 原生 SQLite schema v1、卷 / 节点 / 任务模型、全局及每卷目录版本和冻结的卷状态机。
- 每批最多 10,000 条记录，记录、检查点、快照号和目录版本同事务提交；约束失败整批回滚，过期批次在写入前拒绝。
- `ready` / `catchingUp` 卷按稳定文件引用执行最多 200 条的 keyset 分页；测试只使用合成记录和随机临时数据库并在结束时清理。
- 保存的 Journal 身份与检查点连续性决定追赶或需重建；离线与降级卷不进入普通查询，重建只清空可重建目录节点，不接触源文件。
- 独立测试子进程在产生未提交 WAL 页后被强制终止；重开只保留已提交的 4,000 条，再从检查点续传到 6,000 条。故障注入代码不进入任何生产项目。
- 显式 `--catalog-readonly` CLI 以原生 SQLite 只读模式校验现有 schema 和完整性，执行文件名包含、扩展名精确匹配及 200 条 keyset 全遍历；输入只走标准输入，输出不包含数据库位置、卷标识、查询词、文件名或路径。
- 10 万条纯合成记录的进程级基线记录首次页、命中 / 未命中 p50 / p95、全遍历吞吐、逻辑数据库字节数和峰值工作集；宽松自动门槛只守护明显退化，不把缓存态合成数字包装成真实磁盘或竞品对比。

## P2.0–P3.1 已实现

- CR/1 固定二进制帧与八项操作负载、严格上限、固定错误状态和随机 nonce / 双方 PID 握手。
- Reader Host 显式窄 DACL、首实例、远程拒绝、客户端令牌核验和 Restricted Service SID 自检。
- 普通 Core 反向核验 SCM PID、固定二进制路径、LocalSystem、Demand Start、Restricted SID 和唯一必需权限。
- 临时服务的安装、启动、普通客户端断连、完整分页 / Journal、受控停止、删除及两个专用目录清理验证。
- CR/2 多固定 NTFS 卷发现、显式选择、大小 / 创建时间 / 修改时间 / 属性等基本事实和稳定文件身份。
- Catalog v2 多卷状态、全部卷 / 指定卷 / 目录后代 / 直接子项 / 保存范围查询、稳定分页及路径缓存。
- Reader → Catalog 的初建、关闭期间 Journal 追赶、重命名 / 移动 / 删除、断档判定和原子重建。
- 全量初建使用可丢弃的 SQLite staging 库，完成后在正式 Catalog 单事务发布；取消和下次初始化会清理合法临时构建文件。
- 授权 E 盘完成 407,332 条记录的受控真实验证；只保留聚合耗时、体积、内存和布尔结果，不保留真实名称、路径、卷身份或 SID。

## P3.2–P3.6 控制器、搜索与只读结果调用

- `electron/core/` 的 SC/1 客户端与 Host 控制器由独立 `computerSearch:*` 主进程域按需使用；Renderer 只能通过该窄 IPC 进入 Skim 内只读搜索，不直接接触 Core、Reader 或 SQLite。
- 控制器核对 ready、协议、Host PID、版本、帧 / 页上限和能力表；Core 崩溃最多自动恢复一次，退出先请求 `core.shutdown` 并关闭会话，超时才终止自己创建的进程。
- P3.2 探针继续使用随机系统临时 Catalog；P3.5 产品模式只启动固定已安装 Core 路径并打开每用户正式 Catalog，能力缺失时返回结构化 `not-enabled`，不会自动安装或提权。
- 控制器只启动普通 Core Host，不直接启动 Reader；诊断只记录阶段、耗时、重启数与固定状态码。
- P3.6 为每个实际返回项签发会话级 opaque 授权；打开、定位、复制路径、拖出、信息、Preview 和可见项视觉请求只按主进程保存的授权解析，改词、退出或关闭应用即撤销，不接受 Renderer 自由传入路径。

## P3.3a–P3.3c 部署与安装事务

- Core 与 Reader 使用 framework-dependent `win-x64` 部署，外部前置条件固定为 `Microsoft.NETCore.App 10.0.12`；微软运行时是系统共享依赖，Cap7CE 修复或移除都不取得其所有权。
- 缺少运行时时规划前台运行微软官方安装器 `/install /norestart`，损坏时使用 `/repair /norestart`；返回后必须重新探测 Core，不能仅凭安装器退出码宣布可用，重启决定保留给用户。
- 运行时就绪后才规划单独的 Cap7CE 能力提权，用于固定 Program Files / ProgramData 布局；能力归当前启用账户，其他账户不得静默接管，Catalog 保留或删除是独立选择。
- 当前 Setup 默认返回 `setup-contract-only`；`--dry-run-plan` 只接受严格 JSON，`--verify-payload` 只验证与 Setup 相邻的固定载荷，均报告 `systemChangesPerformed: false`。P3.3b2 另有严格参数、同映像认证的事务入口，已用于完整启用 / 修复 / 移除 / 回滚验证；P3.8 之后仍需由正式产品生命周期以固定资源位置调用，不能暴露任意命令或路径。

## P3.3b2 NativeAOT 执行层形状

- Setup 以锁定的 Microsoft ILCompiler 10.0.12 发布成 `win-x64` NativeAOT 原生单文件；P3.8 复建产物为 5,345,792 bytes。它不依赖机器上的 `Microsoft.NETCore.App`，而 Core / Reader 继续保持体积更小的 framework-dependent 形状。
- `CapabilitySetupJsonContext` 在编译期生成所有 JSON 元数据，泛型枚举转换器保持既有 camelCase 契约；AOT 分析、未知字段拒绝和普通 .NET 测试使用同一代码路径。
- `npm run publish:core-capability` 保留 P3.3c 隔离开发身份，`npm run publish:core-product-capability` 另以正式服务 / 管道身份生成产品 bundle；两者都是固定双层能力包，顶层只有 Setup 和 `payload`。18 个 Core / Reader 文件只保留 win-x64 原生 SQLite 资产且不带符号；嵌入清单逐文件固定长度与 SHA-256，并拒绝 traversal、重复目标、缺失、多余、篡改和 reparse point。
- 固定事务计划把载荷暂存与哈希验证放在替换前，把安装 / 移除验证放在所有权提交 / 清除前；Windows 后端还会在执行前绑定动作与完整计划，外部不能重排、删减或把另一动作的后端混用。任一步失败都会把可能部分完成的失败步骤与此前步骤倒序补偿，单个补偿失败不会中止其余回滚，并以 `rollbackIncomplete` 结构化报告而不伪装成功。
- 一次性高熵命名管道使用显式 ACL；客户端核对服务端 PID，服务端核对真实客户端 PID、同一 Setup 映像哈希，并从客户端令牌取得 SID 与 LocalAppData。固定请求不含 SID、路径或服务名，只含 schema、动作、Catalog 选择和最多 26 个无重复大写盘符；盘符为空时保留开发断连探针模式。
- Windows 后端固定当前能力服务身份、Program Files / ProgramData / token-derived LocalAppData 位置、受保护 ACL、Demand Start、LocalSystem、Restricted Service SID、仅 `SeChangeNotifyPrivilege`、请求账户最小服务 DACL、备份、复核和倒序恢复。带盘符的启用 / 修复会写入 30 分钟的 `volume` 会话配置，只授权所选本地卷；未读文件正文、未写源卷、未联网。
- `npm run test:core-setup-native` 执行锁定发布，并在隔离 `DOTNET_ROOT_X64` 后验证原生 EXE 默认拒绝、前台微软 Runtime 规划和零系统变更；`npm run test:core-capability-payload` 另验证完整能力包、篡改 / 多余文件拒绝及包内 SQLite 原生加载。

## P3.3c 隔离开发安装包

- `npm run dist:core-capability-installer` 使用独立 appId、程序名和 `release/core-capability-dev` 目录构建开发 NSIS；不创建快捷方式、不安装后启动、不自动启用能力，也不修改常规 `build` 打包白名单。
- Setup 的 `--activation-coordinator` 只接受启用 / 修复 / 移除、Catalog 保留 / 删除，以及启用 / 修复时可选的严格大写盘符列表，使用当前映像和既有认证管道完成按需 `runas`；它不接受路径、SID、服务名或外部程序，也不负责下载微软 Runtime。
- 开发卸载器在删除应用文件前调用同一能力事务；索引删除是独立且默认勾选的选项，Runtime 永不卸载。包内烟测会解出能力目录、核对 18 个载荷，并在隔离 `DOTNET_ROOT_X64` 下运行 NativeAOT Setup。
- P3.8 复建的 136,432,946 bytes 开发包通过包内烟测；此前真实矩阵已通过独立安装、一次 UAC 启用、普通账户 Demand Start、一次 UAC 卸载和零残留验证。包内烟测要求解出的 Setup 与当前能力 bundle 哈希一致。该包没有发布，也不是常规产品安装包。

## P3.5 本机产品链验收

- 使用固定 Coordinator 经一次 UAC 启用只授权 E 盘的能力后，产品 Core 通过 Demand Start Reader 完成 407,334 条正式 Catalog 初建，约 42 秒进入 `ready`；Catalog 为 156,835,840 bytes。
- P3.5 `computerSearchRuntime` 随后报告 `searchAvailable: true`，并通过正式 SC/1 链连续返回两页各 100 条结果；验收输出没有文件名、路径、卷身份或 SID，结束后 Core 与 Reader 均已停止。
- 磁盘根由 `catalog.resolveScope` 返回稳定卷身份和空目录身份，主进程据此使用“全卷范围 + 单卷筛选”；普通目录仍解析为稳定目录身份。未建库 / 离线错误优先显示，不会冒充零结果，且该修正不改变 Catalog schema 或既有数据。

## P3.7–P3.8 恢复与正式化审计

- P3.7 已覆盖 Core / Reader 强杀、闭窗期增量、卷离线 / 上线、Journal 更换重建、损坏 Catalog 拒绝、同版本修复、升级回滚、保留 / 删除 Catalog 卸载及真实 Windows 重启；隔离服务保持 Demand Start，开机不自启、不弹 UAC，最终零残留。
- P3.8a 完整 `npm test`、`npm run build`、隔离能力 NSIS 构建和包内检查均通过；正式化决策为继续进入产品生命周期，而不是撤回或长期停留为实验入口。
- P3.8b 已把确定性 bundle 接入常规资源目录，并在 Skim 搜索的 `not-enabled` / `repair-required` 状态提供用户主动启用 / 修复。缺少 .NET 10.0.12 时只下载清单固定的微软安装器、校验 SHA-512，并以前台 `/install /norestart` 运行；返回 3010 时明确停在需要重启，不自动控制 Windows 重启。
- 常规卸载链让 Catalog 跟随现有“用户数据”选项，并用同一固定 Setup 移除受保护 Core / Reader；不勾选时保留 Catalog，勾选时与 `%APPDATA%\Cap7CE` 一并删除，不增加第三个卸载选项。未启用能力的用户不会因此看到多余 UAC。
- P3.8c 常规 NSIS、真实安装、启用、查询、修复、覆盖安装以及保留 / 删除用户数据两种卸载矩阵均已通过。最终 `Cap7CE-Setup-1.0.4-x64.exe` 为 136,445,737 bytes，SHA-256 为 `27F22F674D0FC219CA52610D58C5509EE7394596EF892A9BADDB25D38E8C59BE`；19 个能力文件、18 个载荷、正式服务身份的 NativeAOT Setup、摘要与两份许可文本均通过，最终重装恢复的 Catalog 和用户数据与测试前一致。
- 已添加目录与主搜索的基础查询收拢仍是 P3 之后的独立轮次，不在 P3.8 偷跑；非 NTFS、网络位置、未索引位置和 Core 故障继续保留普通扫描 / 直接浏览回退。

## 当前明确没有接入

- 主搜索、主结果网格、现有 `search:images` 与 `sql.js` 仍不读取 Core。
- 不增加“此电脑”侧栏入口；Core 结果只在 Skim 的独立搜索模式呈现。
- 已添加目录与主搜索对 Core 的复用；这属于 P3 之后的独立收拢轮次。

直接运行 `Cap7CE.Core.Host` 只会输出不含本机信息的 `catalog-cli-fixture-ready` 状态，不会启动后台任务或读取真实目录；直接运行 `Cap7CE.Core.Setup` 只会拒绝并报告 `setup-contract-only`。合成管道、只读 CLI、产品 Catalog Server、真实 P3.1 验证、Setup 干运行和相邻载荷验证都必须由显式固定开关启动；不接受客户端任意路径或设备名。`core/NuGet.Config` 只映射 Microsoft.Data.Sqlite、SQLitePCLRaw 与官方 NativeAOT 编译包，版本和哈希由各项目 `packages.lock.json` 固定；npm Core 命令同时关闭 .NET CLI 遥测。

## 本地验证

```powershell
npm.cmd run build:core
npm.cmd run test:core-architecture
npm.cmd run test:core
npm.cmd run test:core-setup-native
npm.cmd run test:core-capability-payload
npm.cmd run test:core-formalization
npm.cmd run dist:core-capability-installer # 构建并只读检查隔离 P3.3c 开发 NSIS，不发布
npm.cmd run probe:core-capability-setup # 会触发一次 UAC，运行 P3.3b2 固定开发事务矩阵
npm.cmd run probe:core-reader-service # 会触发一次 UAC，仅运行临时合成服务实验
npm.cmd run probe:core-p31-initial   # 会触发一次 UAC，仅运行授权卷初建验证
npm.cmd run probe:core-p31           # 会触发一次 UAC，运行授权卷完整 P3.1 验证
```

构建与本地实验汇总统一进入已忽略的 `core/artifacts/`。P3.8b 只把 `core/artifacts/product-capability/v1/bundle` 的正式身份确定性产物作为一个显式 `extraResources` 入口放入常规包；P3.3c 的 `core/artifacts/capability/v1/bundle` 继续只供隔离开发安装器，其他 Core 构建输出仍不进入包内。能力载荷默认休眠，不在安装、开机或普通搜索时自动提权或启用。
