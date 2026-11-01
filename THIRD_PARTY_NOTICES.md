# Third-Party Notices

Cap7CE source code is made available under PolyForm Noncommercial 1.0.0. Third-party software included in the source tree, dependency graph, or packaged runtime remains subject to its own license.

This file is a human-readable inventory for Cap7CE 2.0.0. The installer includes the deterministic Core capability payload and configures the search service during installation; indexing and metadata extraction require user actions. Locked dependency files record exact versions. Packaging regenerates `licenses/components.json` for the WinUI and Node runtimes and copies WinUI NuGet/runtime license texts under `licenses/nuget`; Core and native helper notices remain beside their respective payloads. In an installed copy these paths are inside `app`.

## Primary runtime components

The AI action's Sparkle Regular/Filled vector geometry comes from Microsoft's [Fluent UI System Icons](https://github.com/microsoft/fluentui-system-icons), under the MIT License, copyright (c) 2020 Microsoft Corporation. The complete license is retained in `third_party/fluentui-system-icons/LICENSE` and copied to the WinUI output as `Assets/fluentui-system-icons-LICENSE.txt`.

| Component | License |
| --- | --- |
| .NET runtime | MIT and bundled third-party notices |
| Windows App SDK and WebView2 loader | Microsoft package license terms and accompanying notices |
| Markdig 0.41.3 | BSD-2-Clause; complete upstream notice retained in `third_party/markdig` |
| AngleSharp 1.8.4 | MIT; complete upstream notice retained in `third_party/anglesharp` |
| Node.js 24.15.0, Windows x64 | MIT and included dependency notices; the independently bundled metadata runtime includes the complete upstream `LICENSE-node` |
| Fluent UI System Icons | MIT; selected SVG geometry is adapted for the stable UI, with the bundled license text in `third_party/fluentui-system-icons` |
| `@napi-rs/canvas` and Windows runtime package | MIT |
| `ag-psd` | MIT |
| `7z-wasm` / 7-Zip WebAssembly | LGPL-2.1-or-later with the UnRAR restriction; bundled license texts are in `third_party/7z-wasm` |
| `fflate` | MIT |
| `@lingo-reader/mobi-parser` / `@lingo-reader/shared` | MIT |
| `events` / `path-browserify` | MIT |
| `sax` | BlueOak-1.0.0 |
| `@xmldom/xmldom` | MIT |
| `parse5` | MIT |
| `entities` | BSD-2-Clause |
| `word-extractor`, `xmlchars`, `pend`, `fd-slicer`, `buffer-crc32`, `yauzl` | MIT; bundled into the independent text preview worker with complete license resources |
| `saxes` | ISC; bundled into the independent text preview worker with its license resource |
| `pdfjs-dist` | Apache-2.0 |
| `opentype.js` | MIT; bundled license text is in `third_party/opentype.js` |
| `sharp` | Apache-2.0 |
| `@img/sharp-win32-x64` / bundled libvips components | Apache-2.0 AND LGPL-3.0-or-later |
| `pako` | MIT AND Zlib |
| Microsoft.Data.Sqlite / Microsoft.Data.Sqlite.Core 10.0.12 | MIT; used by the Core catalog capability |
| SQLitePCLRaw 2.1.12 packages | Apache-2.0; used by the opt-in .NET Core catalog capability |
| SQLite native library supplied through SQLitePCLRaw | SQLite is in the public domain; the packaging components remain Apache-2.0 |
| C#/WinRT runtime 2.2.0 | MIT; used by the bounded native video metadata helper |
| Windows SDK for .NET projections 10.0.19041.57 | Microsoft Windows SDK license; the actual media codecs are supplied by Windows |
| .NET 10 NativeAOT runtime | MIT and included third-party notices; statically linked into the media helper |

The installed production dependency graph also contains components under MIT, Apache-2.0, ISC, 0BSD, Zlib, and LGPL-3.0-or-later terms. Their exact versions are locked in `package-lock.json`.

Cap7CE uses the `7z-wasm` component only to list ZIP, 7Z, and RAR archive entries. It does not implement or expose RAR archive creation. Binary packaging copies `License.txt` and `unRarLicense.txt` to `artifacts/metadata-worker/v1/node_modules/7z-wasm`.

Cap7CE uses `opentype.js` only to read bounded TTF / OTF metadata for the active preview session. Binary packaging copies its MIT license to `artifacts/metadata-worker/v1/licenses/opentype.js`.

Cap7CE uses selected Microsoft Fluent UI System Icons as editable SVG geometry in the stable UI. The icons are adapted for Cap7CE state and sizing while remaining subject to the upstream MIT license.

The Core capability uses Microsoft.Data.Sqlite 10.0.12 and SQLitePCLRaw 2.1.12. Binary packaging copies the applicable MIT and Apache-2.0 texts to the delivered Core dependency notices; SQLite itself is in the public domain.

The native video metadata helper is published as a standalone NativeAOT executable. Its Windows SDK, C#/WinRT and .NET runtime license texts and notices are bundled under `native/artifacts/metadata-media/v1/licenses`. Its managed compiler dependencies are recorded in `native/Cap7CE.Media.Metadata/packages.lock.json`; Windows SDK targeting pack version is fixed in the project file.

Cap7CE uses `fflate`, `@xmldom/xmldom`, `parse5`, and `entities` only inside the bounded EPUB preview worker to read the package structure and extract inert text. It does not execute book scripts, styles, or network resources.

Cap7CE uses `@lingo-reader/mobi-parser` and its runtime dependencies only inside the bounded MOBI preview worker, after Cap7CE validates the PalmDB/MOBI6 structure and supported format boundary. It extracts inert text and a bounded cover image; it does not execute book scripts or network resources.

## Build tooling

Installers are compiled directly with [NSIS](https://nsis.sourceforge.io/), with [StdUtils 1.14](https://github.com/lordmulder/stdutils) (LGPL-2.1-or-later and its upstream clarification) for launching as the desktop user and [WinShell 20121005](https://nsis.sourceforge.io/WinShell_plug-in) (freeware by Anders) for shortcut identity. Their notices are included under `app/licenses/installer`. [7-Zip](https://www.7-zip.org/) is used locally to prepare tools and inspect packages; it is not added to the installed application. Build tools retain their original licenses.

## External runtime and models

Cap7CE does not include or redistribute:

- `llama.cpp` or `llama-server`.
- GGUF main models.
- GGUF `mmproj` files.

Users obtain these components separately and are responsible for complying with the licenses and usage conditions of the selected runtime and model.

The currently recommended and tested model combination is based on the upstream `Qwen/Qwen3-VL-4B-Instruct` model and the Apache-2.0 GGUF quantization repository published separately as `unsloth/Qwen3-VL-4B-Instruct-GGUF`. These external model files are linked for user convenience only and are not part of the Cap7CE source tree or binary distribution.

## No relicensing of third-party components

The PolyForm Noncommercial 1.0.0 license for Cap7CE does not replace, remove, or alter third-party copyright notices or license terms. See each dependency's package, source repository, and distributed license files for the complete controlling text.
