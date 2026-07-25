# Third-Party Notices

Cap7CE source code is licensed under GPL-3.0-only. Third-party software included in the source tree, dependency graph, or packaged runtime remains subject to its own license.

This file is a human-readable inventory for Cap7CE 0.7.8. `package-lock.json` is the authoritative locked npm dependency inventory. Before publishing a binary release, the release process must regenerate and verify the complete license report and ship the applicable license texts and notices with the release.

## Primary runtime components

| Component | License |
| --- | --- |
| Electron | MIT; the Electron distribution also includes Chromium and other third-party notices |
| React / React DOM | MIT |
| `@napi-rs/canvas` and Windows runtime package | MIT |
| `ag-psd` | MIT |
| `pdfjs-dist` | Apache-2.0 |
| `sharp` | Apache-2.0 |
| `@img/sharp-win32-x64` / bundled libvips components | Apache-2.0 AND LGPL-3.0-or-later |
| `sql.js` | MIT |
| `pako` | MIT AND Zlib |

The installed production dependency graph also contains components under MIT, Apache-2.0, ISC, 0BSD, Zlib, and LGPL-3.0-or-later compatible terms. Their exact versions are locked in `package-lock.json`.

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

The GPL-3.0-only license for Cap7CE does not replace, remove, or alter third-party copyright notices or license terms. See each dependency's package, source repository, and distributed license files for the complete controlling text.
