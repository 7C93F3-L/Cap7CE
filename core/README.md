# Cap7CE Core

`core/` 是全盘基础目录方向的独立 .NET 10 工程。P1.0–P3.2 已完成普通 Core、原生 SQLite Catalog、SC/1、CR/2、受限 Reader、真实 NTFS 初建 / 增量 / 断档重建、独立查询纵切，以及测试 / 诊断专用的 Electron 主进程控制器。当前仍不接正式搜索、Skim、Renderer、主界面或安装器，也不进入 Cap7CE 1.0.4 安装包。

## 项目职责

- `Cap7CE.Core.Protocol`：Shell 与 Core 的版本化线协议契约及 4 字节长度前缀 JSON 帧。
- `Cap7CE.Core.Reader.Protocol`：普通 Core 与高权限 Reader 的固定二进制 CR/1–CR/2 契约；不拥有传输、服务或 NTFS 能力。
- `Cap7CE.Core.Reader.Host`：受限 Windows 服务宿主；只从固定受保护配置读取许可 SID 和卷选择，以只读 MFT / USN 返回有界目录元数据，不拥有文件正文、搜索、SQLite、源卷写入或网络能力。
- `Cap7CE.Core.Catalog`：schema v1 验证目录与 schema v2 产品目录、事务、范围查询、保存范围、路径缓存和每卷状态的唯一所有者。
- `Cap7CE.Core.Adapters.Abstractions`：受限元数据来源的抽象边界。
- `Cap7CE.Core.Host`：普通权限 Core 的唯一组合根和进程入口；组合 Reader、Catalog、同步状态机和 SC/1 产品能力，并保留显式合成 / 真实验证入口。
- `Cap7CE.Core.Tests`：协议、进程、原生目录和边界测试宿主。

依赖方向固定为：四个基础项目互不引用；普通 `Host` 组合 SC/1、Reader Protocol、Catalog 和适配器抽象，Reader Host 只依赖 Reader Protocol。任何反向依赖都会被 Core 与 Reader 两组架构守门拒绝。

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

## P3.2 控制器边界

- `electron/core/` 的 SC/1 客户端与 Host 控制器只由测试 / 诊断入口显式创建，`electron/main.ts` 不装配，不注册 preload 或 Renderer IPC。
- 控制器核对 ready、协议、Host PID、版本、帧 / 页上限和能力表；Core 崩溃最多自动恢复一次，退出先请求 `core.shutdown` 并关闭会话，超时才终止自己创建的进程。
- 当前只启动固定 `--catalog-controller-probe`，Catalog 位于随机系统临时目录并随测试清理，不打开正式每用户 Catalog；打包态固定报告 Core 尚未安装。
- 控制器只启动普通 Core Host，不直接启动 Reader；诊断只记录阶段、耗时、重启数与固定状态码。

## 当前明确没有接入

- `electron/main.ts` 产品装配、Core IPC 与正常应用生命周期接入。
- Renderer、“此电脑”入口或正式搜索接入。
- Skim、现有 `sql.js` 或用户深度资料迁移。
- 正式能力安装器、产品升级 / 修复 / 移除与发布打包。

直接运行 `Cap7CE.Core.Host` 只会输出不含本机信息的 `catalog-cli-fixture-ready` 状态，不会启动后台任务或读取真实目录。合成管道、只读 CLI、产品 Catalog Server 和真实 P3.1 验证都必须由显式固定开关启动；不接受客户端任意路径或设备名。`core/NuGet.Config` 只允许 Microsoft.Data.Sqlite 与 SQLitePCLRaw，版本和哈希由各项目 `packages.lock.json` 固定；npm Core 命令同时关闭 .NET CLI 遥测。

## 本地验证

```powershell
npm.cmd run build:core
npm.cmd run test:core-architecture
npm.cmd run test:core
npm.cmd run probe:core-reader-service # 会触发一次 UAC，仅运行临时合成服务实验
npm.cmd run probe:core-p31-initial   # 会触发一次 UAC，仅运行授权卷初建验证
npm.cmd run probe:core-p31           # 会触发一次 UAC，运行授权卷完整 P3.1 验证
```

构建与本地实验汇总统一进入已忽略的 `core/artifacts/`。Electron Builder 使用显式文件白名单，Core、Reader、原生 SQLite 运行库与输出都不会进入 1.0.4 安装包。
