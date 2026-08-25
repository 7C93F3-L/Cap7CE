# Cap7CE

[中文](#中文) · [English](#english)

> **Preview software.** Cap7CE is under active development. Back up important files before using file-management features.

![Cap7CE normal mode in dark theme](docs/assets/screenshots/normal-dark.png)

## 界面预览 / Interface preview

### 窗口形态 / Window forms

![Cap7CE line, capsule, micro, mini, normal, and Settings overview](docs/assets/screenshots/overview-light.png)

### 紧凑模式 / Compact modes

<p align="center">
  <img src="docs/assets/screenshots/compact-modes-light.png" width="442" alt="Cap7CE micro and mini modes in dark theme">
</p>

### 设置界面 / Settings

![Cap7CE Settings in dark theme](docs/assets/screenshots/settings-dark.png)

截图中的演示素材来源见 [截图素材说明](docs/assets/screenshots/ASSET_SOURCES.md)。
See [Screenshot asset sources](docs/assets/screenshots/ASSET_SOURCES.md) for the origin of the demo artwork.

## 中文

Cap7CE 是一款面向 Windows 的本地文件搜索、浏览与预览工具。它扫描用户主动添加的目录，可按文件名、目录路径和手工关键词搜索多种文件，并可选使用本地 `llama.cpp` 视觉模型为受支持图像生成描述与关键词。

源文件、索引、缓存、模型和运行时配置均保留在本机。Cap7CE 不提供模型或 `llama.cpp`，也不会将素材上传到远程识别服务。

### 当前状态

- 当前版本：`0.9.7`
- 发布阶段：Preview
- 支持平台：Windows 10 / 11 x64
- 当前主要测试环境：Windows 11、NVIDIA CUDA 版 `llama.cpp`
- 源码许可证：PolyForm Noncommercial 1.0.0（仅限非商业用途）

Preview 版本仍可能存在兼容性、性能和界面问题。首次公开安装包可能未经代码签名，并可能触发 Windows SmartScreen 提示。

### 主要功能

- 扫描多个本地目录并建立文件索引。
- 通过本地视觉模型生成描述与关键词。
- 新执行的 AI 识别会跟随当前软件语言生成中文或英文描述与关键词。
- 按关键词、文件名、目录、识别状态、格式和排序方式筛选。
- 使用 skim 浏览磁盘和目录中的多种项目文件，通过快速访问边栏或在搜索框粘贴本机文件、目录的完整路径直达对应位置，并预览视觉、文本、文档、归档、字体、音频和视频内容。
- 提供 capsule、micro、mini、normal 和 Settings 窗口形态。
- 支持缩略图、独立预览窗口、多选和关键词编辑。
- 支持打开文件、定位路径、拖拽导出和移入回收站。
- 支持明亮、黑暗、跟随系统主题及中英文界面。
- 支持可配置全局快捷动作和冒号语法快捷指令。
- 管理缩略图、预览图和模型输入图三类本地视觉缓存。

### 支持的文件格式

正式视觉缩略图与 AI 识别支持：`JPG`、`JPEG`、`PNG`、`WEBP`、`AVIF`、`BMP`、`TIF`、`TIFF`、`GIF`、`SVG`、`PDF`、`PSD`、`AI`、`EPS`、`CDR`。

文件名、目录路径和手工关键词搜索还覆盖办公文档、文本与源码、归档、字体、音视频、电子书、设计工程文件等已登记格式；这些格式不因此进入 AI 识别。

部分预览依赖本机已有的系统组件：`HEIC`、`HEIF` 及 `DNG`、`CR2`、`CR3`、`NEF`、`ARW`、`RAF`、`ORF`、`RW2` 等相机格式需要兼容的 Windows 图像扩展或解码器；部分视频缩略图依赖 Windows Shell 中可用的媒体解码能力；`XLS`、`XLSX`、`PPT`、`PPTX` 需要本机安装 Microsoft Excel 或 PowerPoint。系统组件缺失、文件编码不兼容或解码失败时，Cap7CE 会安全回退为格式图标和文件信息，不影响搜索，也不会把这些格式自动送入 AI 识别。

多页或复杂文档当前通常使用第一页、合成图或内置预览图作为代表图。部分旧格式、特殊编码或缺少内置预览的文件可能无法渲染。

### 运行前准备

Cap7CE 本体可以在缺少 AI 运行时的情况下浏览和搜索文件名。执行 AI 识别还需要：

1. 与本机硬件匹配的 Windows 版 `llama.cpp`，其中必须包含 `llama-server.exe`。
2. 支持视觉输入的 GGUF 主模型。
3. 与主模型匹配的 `mmproj` GGUF 文件。

推荐目录结构：

```text
Cap7CE/
├─ Cap7CE.exe
├─ llama.cpp/
│  ├─ bxxxx-cuda/
│  │  ├─ llama-server.exe
│  │  └─ ...
│  └─ other-version/
│     ├─ llama-server.exe
│     └─ ...
└─ models/
   ├─ vision-model.gguf
   └─ mmproj-vision-model.gguf
```

每个 `llama.cpp` 版本使用独立子目录。`models` 可以包含子目录；Cap7CE 会递归扫描 `.gguf` 文件，并尝试将主模型与 `mmproj` 配对。

官方多文件压缩包已预先创建空的 `llama.cpp` 与 `models` 目录；软件仍不内置运行时或模型文件。

运行时和模型必须由用户从其官方或可信来源单独获取，并遵守各自的许可证与使用条款。Cap7CE 项目不为第三方运行时或模型提供再分发授权。

模型速度、内存与显存需求取决于参数规模、量化版本、上下文长度、硬件和所选 `llama.cpp` 构建。请根据本机资源选择合适的模型规格。

#### 已验证的推荐模型

当前推荐使用 [Qwen3-VL](https://huggingface.co/collections/Qwen/qwen3-vl) 系列视觉模型。Cap7CE 已完成 Qwen3-VL 2B 与 4B 的实际使用测试；其他参数规模也可以使用，用户可根据本机硬件、速度和效果需求自行选择。

Qwen 团队提供上游模型；用于 `llama.cpp` 的第三方 GGUF 量化版本可从 [Unsloth Qwen3-VL 模型集合](https://huggingface.co/collections/unsloth/qwen3-vl) 等可信来源获取。

必须同时下载相互匹配的 GGUF 主模型和视觉投影 `mmproj` 文件。只有主模型时，Cap7CE 会将该视觉模型标记为未配对，无法执行图像识别。建议把两个文件放在 `models` 下的同一个目录中，例如：

```text
models/
└─ Qwen3-VL/
   ├─ Qwen3-VL-Instruct.gguf
   └─ mmproj-Qwen3-VL.gguf
```

第三方 GGUF 量化文件并非由 Cap7CE 或 Qwen 团队发布。下载和使用前应阅读所选量化仓库及上游模型卡，确认主模型与 `mmproj` 彼此匹配，并遵守对应许可证；Cap7CE 不镜像、不修改也不随安装包分发这些文件。

### 从源码运行

开发环境需要：

- Windows 10 / 11 x64
- Node.js 20.16 或更新版本
- npm
- Git

```powershell
git clone https://github.com/7C93F3-L/Cap7CE.git
cd Cap7CE
npm ci
npm run dev
```

### 构建与验证

```powershell
npm run build
npm test
npm run pack
npm run dist
```

| 命令              | 用途                         |
| --------------- | -------------------------- |
| `npm run dev`   | 启动 Vite 与 Electron 开发环境    |
| `npm run build` | 构建 Renderer 和 Electron 主进程 |
| `npm test`      | 运行仓库内可独立完成的集成测试            |
| `npm run pack`  | 生成未安装的应用目录，用于打包检查          |
| `npm run dist`  | 生成 Windows x64 portable 构建 |

`npm run build` 通过不代表安装包已经验证。发布前仍需执行打包并进行人工交互测试。

### 本地数据与隐私

- 用户配置、SQLite 索引和视觉缓存默认位于 `%APPDATA%\Cap7CE`。
- Cap7CE 只处理用户主动添加的目录。
- AI 请求发送到本机 `127.0.0.1` 上由 Cap7CE 启动的 `llama-server`。
- 项目当前不包含遥测、分析或云端识别功能。
- 日志和问题报告可能包含本地路径；公开提交前请先移除个人信息。

### 当前限制

- 仅支持 Windows x64。
- 不内置、不自动下载 `llama.cpp` 或视觉模型。
- AI 识别结果取决于模型、量化版本、硬件和提示词，不保证准确。
- 复杂文档格式主要提供代表图预览，不是完整文档编辑器或解析器。
- 部分相机、Office 和媒体格式的预览能力取决于本机已安装的系统扩展、应用组件或解码器。
- 当前未对所有 GPU、CPU-only 运行时和 Windows 版本完成兼容性验证。
- Preview 版本的数据结构和行为仍可能变化。

### 文档

- [变更记录](CHANGELOG.md)
- [软件架构](docs/SOFTWARE_ARCHITECTURE.md)
- [界面文案核对表](docs/UI_TEXT_CATALOG.md)
- [安全政策](SECURITY.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)
- [品牌与命名政策](BRAND.md)
- [截图素材说明](docs/assets/screenshots/ASSET_SOURCES.md)

### 参与和反馈

公开仓库启用后：

- 可通过 GitHub Issues 报告可复现问题或提出功能建议。
- 安全漏洞请按照 [SECURITY.md](SECURITY.md) 私下报告。
- 商业用途不在默认许可证授权范围内；如需商业授权，请先通过 GitHub Discussions 联系维护者并取得单独的书面许可。

### 许可证与署名

Cap7CE 源代码以 [PolyForm Noncommercial 1.0.0](LICENSE) 提供，仅授权协议定义的非商业用途。个人可以在非商业范围内使用、研究、修改和分发；任何商业用途均需事先取得维护者的单独书面授权。第三方组件继续适用其各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

Cap7CE 名称、Logo、图标和其他品牌素材不因源代码可见而自动获得品牌授权。修改版不得暗示其由官方发布，详见 [BRAND.md](BRAND.md)。

Copyright © 2026 7C93F3-L.

Designed and developed by 7C93F3-L with assistance from Echo using OpenAI Codex.

---

## English

Cap7CE is a local file search, browsing, and preview tool for Windows. It scans directories explicitly added by the user, searches many file types by file name, directory path, and manual keywords, and can optionally use a local `llama.cpp` vision model to generate descriptions and keywords for supported images.

Source files, indexes, caches, models, and runtime settings remain on the local machine. Cap7CE does not bundle models or `llama.cpp`, and it does not upload media to a remote recognition service.

### Project status

- Current version: `0.9.7`
- Release stage: Preview
- Supported platform: Windows 10 / 11 x64
- Primary test environment: Windows 11 with a CUDA build of `llama.cpp`
- Source-available license: PolyForm Noncommercial 1.0.0 (noncommercial use only)

Preview releases may still contain compatibility, performance, and UI issues. Early public builds may be unsigned and can trigger a Windows SmartScreen warning.

### Features

- Scan and index multiple local directories.
- Generate descriptions and keywords with a local vision model.
- New AI recognition runs generate Chinese or English descriptions and keywords according to the current app language.
- Filter by keywords, file name, directory, recognition status, format, and sort order.
- Use skim to browse project files across disks and folders, jump to common locations from the Quick Access sidebar or by pasting a full local file or folder path into search, and preview visual, text, document, archive, font, audio, and video content.
- Use capsule, micro, mini, normal, and Settings window forms.
- Browse thumbnails, open an independent preview window, select multiple files, and edit keywords.
- Open files, reveal paths, drag files to other applications, and move files to the Recycle Bin.
- Use light, dark, or system themes with Chinese and English interfaces.
- Configure global quick actions and colon-syntax quick commands.
- Manage thumbnail, preview, and model-input caches locally.

### Supported formats

Formal visual thumbnails and AI recognition support: `JPG`, `JPEG`, `PNG`, `WEBP`, `AVIF`, `BMP`, `TIF`, `TIFF`, `GIF`, `SVG`, `PDF`, `PSD`, `AI`, `EPS`, `CDR`.

File-name, directory-path, and manual-keyword search additionally covers registered office, text and source-code, archive, font, media, ebook, design, and project formats. These formats do not become AI-recognition inputs.

Some previews depend on components already available on the computer. `HEIC`, `HEIF`, and camera formats such as `DNG`, `CR2`, `CR3`, `NEF`, `ARW`, `RAF`, `ORF`, and `RW2` require a compatible Windows imaging extension or codec; some video thumbnails depend on media decoding available through Windows Shell. `XLS`, `XLSX`, `PPT`, and `PPTX` require Microsoft Excel or PowerPoint to be installed. If a component is missing or decoding fails, Cap7CE safely falls back to the format icon and file information; search continues to work, and these files are not automatically sent to AI recognition.

For multi-page or complex documents, Cap7CE generally uses the first page, a composite image, or an embedded preview as the representative image. Some legacy files, unusual encodings, or files without embedded previews may not render.

### Runtime preparation

Cap7CE can browse files and search file names without an AI runtime. AI recognition additionally requires:

1. A Windows build of `llama.cpp` suitable for the local hardware and containing `llama-server.exe`.
2. A vision-capable GGUF main model.
3. A matching `mmproj` GGUF file.

Recommended layout:

```text
Cap7CE/
├─ Cap7CE.exe
├─ llama.cpp/
│  ├─ bxxxx-cuda/
│  │  ├─ llama-server.exe
│  │  └─ ...
│  └─ other-version/
│     ├─ llama-server.exe
│     └─ ...
└─ models/
   ├─ vision-model.gguf
   └─ mmproj-vision-model.gguf
```

Keep each `llama.cpp` version in a separate subdirectory. The `models` directory may contain nested directories; Cap7CE scans `.gguf` files recursively and attempts to pair each main model with its `mmproj`.

The official multi-file archive includes empty `llama.cpp` and `models` directories. Runtime and model files are still not bundled.

Users must obtain runtimes and models separately from official or otherwise trusted sources and comply with their respective licenses and terms. The Cap7CE project does not grant redistribution rights for third-party runtimes or models.

Model speed, memory, and VRAM requirements depend on parameter count, quantization, context length, hardware, and the selected `llama.cpp` build. Choose a model size appropriate for the local system.

#### Verified recommended model

The recommended vision-model family is [Qwen3-VL](https://huggingface.co/collections/Qwen/qwen3-vl). Qwen3-VL 2B and 4B have been tested with Cap7CE. Other parameter sizes may also be used according to the available hardware and the preferred speed-quality balance.

The Qwen team publishes the upstream models. Third-party GGUF quantizations for `llama.cpp` can be obtained from trusted sources such as the [Unsloth Qwen3-VL collection](https://huggingface.co/collections/unsloth/qwen3-vl).

A matching GGUF main model and vision-projector `mmproj` file are both required. With only the main model present, Cap7CE marks the vision model as unpaired and cannot perform image recognition. Place both files in the same directory under `models`, for example:

```text
models/
└─ Qwen3-VL/
   ├─ Qwen3-VL-Instruct.gguf
   └─ mmproj-Qwen3-VL.gguf
```

Third-party GGUF quantizations are not published by Cap7CE or the Qwen team. Review the selected quantization repository and upstream model card, verify that the main model and `mmproj` match, and follow their respective licenses before use. Cap7CE does not mirror, modify, or distribute these files with the application.

### Run from source

Development requirements:

- Windows 10 / 11 x64
- Node.js 20.16 or newer
- npm
- Git

```powershell
git clone https://github.com/7C93F3-L/Cap7CE.git
cd Cap7CE
npm ci
npm run dev
```

### Build and verification

```powershell
npm run build
npm test
npm run pack
npm run dist
```

| Command         | Purpose                                                             |
| --------------- | ------------------------------------------------------------------- |
| `npm run dev`   | Start the Vite and Electron development environment                 |
| `npm run build` | Build the Renderer and Electron main process                        |
| `npm test`      | Run the self-contained integration tests included in the repository |
| `npm run pack`  | Generate an unpacked application directory for packaging checks     |
| `npm run dist`  | Generate a Windows x64 portable build                               |

A successful `npm run build` does not validate the packaged application. Packaging and manual interaction tests are still required before release.

### Local data and privacy

- Preferences, the SQLite index, and visual caches are stored under `%APPDATA%\Cap7CE` by default.
- Cap7CE processes only directories explicitly added by the user.
- AI requests are sent to the local `llama-server` started by Cap7CE on `127.0.0.1`.
- The project currently contains no telemetry, analytics, or cloud-recognition feature.
- Logs and issue reports may contain local paths; remove personal information before posting them publicly.

### Current limitations

- Windows x64 only.
- `llama.cpp` and vision models are neither bundled nor downloaded automatically.
- Recognition quality depends on the model, quantization, hardware, and prompt and is not guaranteed.
- Complex document formats are represented by preview images; Cap7CE is not a full document editor or parser.
- Preview support for some camera, Office, and media formats depends on installed Windows extensions, application components, or codecs.
- Not every GPU, CPU-only runtime, or Windows version has been tested.
- Preview data structures and behavior may still change.

### Documentation

- [Changelog](CHANGELOG.md)
- [Software architecture](docs/SOFTWARE_ARCHITECTURE.md)
- [UI text catalog](docs/UI_TEXT_CATALOG.md)
- [Security policy](SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Brand and naming policy](BRAND.md)
- [Screenshot asset sources](docs/assets/screenshots/ASSET_SOURCES.md)

### Contributing and feedback

After the public repository is enabled:

- Use GitHub Issues for reproducible bugs and feature proposals.
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Commercial use is not covered by the default license. Contact the maintainer through GitHub Discussions and obtain separate written permission before any commercial use.

### License and credits

Cap7CE source code is made available under [PolyForm Noncommercial 1.0.0](LICENSE), which permits only the noncommercial purposes defined by that license. Individuals may use, study, modify, and distribute the software for noncommercial purposes; any commercial use requires separate prior written permission from the maintainer. Third-party components remain under their respective licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The Cap7CE name, logo, icons, and other branding are not automatically licensed as branding merely because the source is available. Modified versions must not imply official endorsement; see [BRAND.md](BRAND.md).

Copyright © 2026 7C93F3-L.

Designed and developed by 7C93F3-L with assistance from Echo using OpenAI Codex.
