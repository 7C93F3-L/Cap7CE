# Third-Party Notices

Cap7CE source code is made available under PolyForm Noncommercial 1.0.0. Third-party software included in the source tree, dependency graph, or packaged runtime remains subject to its own license.

This file is a human-readable inventory for Cap7CE 1.0.4 and its opt-in Core capability. The regular package now carries the dormant, deterministic capability payload; it is installed into protected system locations only after the user explicitly enables or repairs full-disk search. `package-lock.json` and the Core `packages.lock.json` files are the authoritative locked dependency inventories. Before publishing a binary release, the release process must regenerate and verify the complete license report.

## Primary runtime components

| Component | License |
| --- | --- |
| Electron | MIT; the Electron distribution also includes Chromium and other third-party notices |
| Node.js 24.15.0, Windows x64 | MIT and included dependency notices; the independently bundled metadata runtime includes the complete upstream `LICENSE-node` |
| React / React DOM | MIT |
| Fluent UI System Icons | MIT; selected SVG geometry is adapted for the stable UI, with the bundled license text in `third_party/fluentui-system-icons` |
| `react-markdown` / `remark-gfm` and unified ecosystem dependencies | MIT; selected supporting packages also use ISC |
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
| `pdfjs-dist` | Apache-2.0 |
| `opentype.js` | MIT; bundled license text is in `third_party/opentype.js` |
| `sharp` | Apache-2.0 |
| `@img/sharp-win32-x64` / bundled libvips components | Apache-2.0 AND LGPL-3.0-or-later |
| `sql.js` | MIT |
| `pako` | MIT AND Zlib |
| Microsoft.Data.Sqlite / Microsoft.Data.Sqlite.Core 10.0.12 | MIT; used by the opt-in .NET Core catalog capability |
| SQLitePCLRaw 2.1.12 packages | Apache-2.0; used by the opt-in .NET Core catalog capability |
| SQLite native library supplied through SQLitePCLRaw | SQLite is in the public domain; the packaging components remain Apache-2.0 |
| C#/WinRT runtime 2.2.0 | MIT; used by the bounded native video metadata helper |
| Windows SDK for .NET projections 10.0.19041.57 | Microsoft Windows SDK license; the actual media codecs are supplied by Windows |
| .NET 10 NativeAOT runtime | MIT and included third-party notices; statically linked into the media helper |

The installed production dependency graph also contains components under MIT, Apache-2.0, ISC, 0BSD, Zlib, and LGPL-3.0-or-later terms. Their exact versions are locked in `package-lock.json`.

Cap7CE uses the `7z-wasm` component only to list ZIP, 7Z, and RAR archive entries. It does not implement or expose RAR archive creation. Binary packaging copies `License.txt` and `unRarLicense.txt` to `resources/licenses/7z-wasm`.

Cap7CE uses `opentype.js` only to read bounded TTF / OTF metadata for the active preview session. Binary packaging copies its MIT license to `resources/licenses/opentype.js`.

Cap7CE uses selected Microsoft Fluent UI System Icons as editable SVG geometry in the stable UI. The icons are adapted for Cap7CE state and sizing while remaining subject to the upstream MIT license.

The Core capability uses Microsoft.Data.Sqlite 10.0.12 and SQLitePCLRaw 2.1.12. Binary packaging copies the applicable MIT and Apache-2.0 texts to `resources/licenses/core-dependencies`; SQLite itself is in the public domain.

The native video metadata helper is published as a standalone NativeAOT executable. Its Windows SDK, C#/WinRT and .NET runtime license texts and notices are bundled under `resources/licenses/metadata-media`. Its managed compiler dependencies are recorded in `native/Cap7CE.Media.Metadata/packages.lock.json`; Windows SDK targeting pack version is fixed in the project file.

Cap7CE uses `fflate`, `@xmldom/xmldom`, `parse5`, and `entities` only inside the bounded EPUB preview worker to read the package structure and extract inert text. It does not execute book scripts, styles, or network resources.

Cap7CE uses `@lingo-reader/mobi-parser` and its runtime dependencies only inside the bounded MOBI preview worker, after Cap7CE validates the PalmDB/MOBI6 structure and supported format boundary. It extracts inert text and a bounded cover image; it does not execute book scripts or network resources.

Cap7CE uses `react-markdown`, `remark-gfm`, and their unified ecosystem dependencies only to render bounded Markdown text in the preview renderer. Raw HTML, image resource loading, and link navigation remain disabled.

## Electron and Chromium notices

The Electron runtime contains:

- Electron's `LICENSE`.
- Chromium and bundled third-party notices in `LICENSES.chromium.html`.

Binary-release verification must confirm these files remain present in the packaged Electron runtime.

## External runtime and models

Cap7CE does not include or redistribute:

- `llama.cpp` or `llama-server`.
- GGUF main models.
- GGUF `mmproj` files.

Users obtain these components separately and are responsible for complying with the licenses and usage conditions of the selected runtime and model.

The currently recommended and tested model combination is based on the upstream `Qwen/Qwen3-VL-4B-Instruct` model and the Apache-2.0 GGUF quantization repository published separately as `unsloth/Qwen3-VL-4B-Instruct-GGUF`. These external model files are linked for user convenience only and are not part of the Cap7CE source tree or binary distribution.

## No relicensing of third-party components

The PolyForm Noncommercial 1.0.0 license for Cap7CE does not replace, remove, or alter third-party copyright notices or license terms. See each dependency's package, source repository, and distributed license files for the complete controlling text.
