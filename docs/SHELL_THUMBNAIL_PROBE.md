# Shell 缩略图可行性探针

这个仅用于开发验证的探针检查 Electron 能否取得文件的 Windows Shell 缩略图。结果不会接入 Cap7CE 界面、格式能力表、缓存、索引、搜索或 AI。

## 运行

先关闭无关的 Cap7CE 开发实例，再运行：

```powershell
npm.cmd run probe:shell-thumbnail -- "C:\path\to\sample.ksp"
```

也可以传入测试目录。目录输入不会递归，默认最多处理当前一级的 50 个文件：

```powershell
npm.cmd run probe:shell-thumbnail -- "C:\path\to\thumbnail-samples" --max-files 20
```

使用 `--output` 指定报告目录，使用 `--timeout-ms` 修改每次调用默认 15 秒的超时：

```powershell
npm.cmd run probe:shell-thumbnail -- "C:\path\to\sample.ksp" --output "C:\path\to\probe-report" --timeout-ms 20000
```

未指定 `--output` 时，报告写入已被 Git 忽略的 `artifacts/shell-thumbnail-probe` 目录。每次运行严格串行；发生超时后会停止，因为 JavaScript 停止等待并不能取消正在执行的 Windows Shell 缩略图处理器。

## 检查结果

输出目录包括：

- `report.json`：路径、扩展名、请求尺寸、空图片状态、返回像素尺寸、首次与二次耗时、错误、超时、环境信息和图片哈希；
- `report.md`：相同结果的表格报告；
- 每个成功的 256 px 与 300 px 请求各一张 PNG。

打开 PNG，与 Windows 资源管理器中的同一文件比较。Electron 不会说明返回的是内容缩略图、普通文件图标还是其他占位图，因此必须人工判断。

为了完成 T1/T2 路线判断，在条件允许时至少加入一个 KeyShot `.ksp` 样本，并补充有代表性的 Office、视频、RAW、CAD/3D、未知扩展名、零字节或损坏副本。故意制造损坏文件时不要使用不可替代的原件。
