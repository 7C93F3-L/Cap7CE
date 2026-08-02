# Cap7CE 界面文案核对表

> 来源：Cap7CE 0.8.1 当前代码（2026-08-03）
> 用途：核对中文术语，并作为运行时语言表的人工审校来源。本文档不是运行时语言文件。
> 当前运行时中文表：`electron/localization.ts`；英文表：`electron/locales/en-US.ts`。界面通过稳定文案 ID 和 `t()` 读取。

## 使用说明

- 请主要修改“确认中文”列；留空表示沿用“当前中文”。
- “英文”列仅用于人工审校记录；运行时英文以 `electron/locales/en-US.ts` 为准。
- 请不要修改“文案 ID”；它将作为后续代码中的稳定翻译键。
- `{count}`、`{name}`、`{path}`、`{command}` 等是动态占位符，请保留。
- `ui:light`、`lang:en` 等快捷指令语法不是界面文案，请不要翻译或改写。
- 相同文字在含义相同时合并为公共文案；含义不同时保留为不同文案 ID。

## 本次收录范围

- 主搜索界面、筛选标签、结果状态和空状态
- 窗口控制、预览窗口与图片右键菜单
- Settings 全部可见标签、按钮、状态、提示与详情字段
- 快捷指令查看页、执行反馈、失败提示与二次确认
- 文件删除、目录删除、关键词编辑、缓存清理等弹层
- 系统托盘菜单
- `title`、`placeholder`、`aria-label` 等用户可感知文字

暂不收录开发日志、代码注释、AI 提示词、索引内容、用户文件名、目录名、模型名及第三方工具原始报错。

---

## 1. 公共操作与状态

| 文案 ID                   | 当前中文      | 确认中文 | 英文  | 使用位置 / 备注   |
| ----------------------- | --------- | ---- | --- | ----------- |
| `common.add`            | 添加        |      |     | Settings、目录 |
| `common.open`           | 打开        |      |     | 右键菜单、开关动作   |
| `common.close`          | 关闭        |      |     | 通用按钮        |
| `common.cancel`         | 取消        |      |     | 弹层、操作取消     |
| `common.confirmYes`     | 是         |      |     | 二次确认        |
| `common.confirmNo`      | 否         |      |     | 二次确认        |
| `common.save`           | 保存        |      |     | 关键词编辑       |
| `common.saving`         | 保存中       |      |     | 关键词编辑       |
| `common.delete`         | 删除        |      |     | 文件、目录       |
| `common.retry`          | 重试        |      |     | 失败状态        |
| `common.done`           | 完成        |      |     | 操作完成        |
| `common.refresh`        | 刷新        |      |     | 运行时、模型      |
| `common.refreshing`     | 刷新中       |      |     | 模型          |
| `common.restoreDefault` | 恢复默认      |      |     | 外观、快捷动作     |
| `common.view`           | 查看        |      |     | 搜索标签、快捷指令   |
| `common.manage`         | 管理        |      |     | Settings、目录 |
| `common.collapse`       | 收起        |      |     | Settings 详情 |
| `common.start`          | 启动        |      |     | llama.cpp   |
| `common.starting`       | 启动中       |      |     | llama.cpp   |
| `common.stop`           | 停止        |      |     | llama.cpp   |
| `common.running`        | 运行中       |      |     | 运行状态        |
| `common.stopped`        | 已停止       |      |     | 运行状态        |
| `common.available`      | 可用        |      |     | 运行时状态       |
| `common.unavailable`    | 暂不可用      |      |     | 服务状态        |
| `common.unselected`     | 未选择       |      |     | 模型、运行时      |
| `common.notDetected`    | 未检测到      |      |     | 路径状态        |
| `common.notCreated`     | 尚未创建      |      |     | 日志状态        |
| `common.idle`           | 空闲        |      |     | 索引状态        |
| `common.loading`        | 加载中       |      |     | 模型状态        |
| `common.loaded`         | 已加载       |      |     | 模型状态        |
| `common.loadFailed`     | 加载失败      |      |     | 模型状态        |
| `common.completed`      | 已完成       |      |     | 索引、操作状态     |
| `common.cancelled`      | 已取消       |      |     | 索引、指令状态     |
| `common.failed`         | 失败        |      |     | 通用状态        |
| `common.abnormal`       | 异常        |      |     | 目录状态        |
| `common.countItems`     | {count} 个 |      |     | 通用数量模板      |

## 2. 主题、排序与筛选术语

| 文案 ID                        | 当前中文    | 确认中文 | 英文  | 使用位置 / 备注          |
| ---------------------------- | ------- | ---- | --- | ------------------ |
| `theme.system`               | 跟随系统    |      |     | Settings 当前主题模式    |
| `theme.lightLegacy`          | 浅色      | 明亮   |     | 旧主题标签，需与“明亮”统一     |
| `theme.darkLegacy`           | 深色      | 黑暗   |     | 旧主题标签，需与“黑暗”统一     |
| `theme.light`                | 明亮      |      |     | Settings 模式按钮      |
| `theme.dark`                 | 黑暗      |      |     | Settings 模式按钮      |
| `theme.lightCommand`         | 亮色模式    | 明亮模式 |     | 快捷指令反馈，需统一         |
| `theme.darkCommand`          | 暗色模式    | 黑暗模式 |     | 快捷指令反馈，需统一         |
| `appearance.themeModeLabel`  | 模式切换    | 外观切换 |     | Settings；可能与窗口模式混淆 |
| `appearance.configureLabel`  | 配置外观    |      |     | Settings           |
| `appearance.themeColor`      | 主题色     | 颜色1  |     | Settings、快捷指令      |
| `appearance.accentColor`     | 副色      | 颜色2  |     | Settings、快捷指令      |
| `sort.parent`                | 排序      |      |     | 排序父标签              |
| `sort.field.name`            | 按名称     |      |     | 排序字段               |
| `sort.field.modifiedAt`      | 按时间     |      |     | 排序字段（文件修改时间）       |
| `sort.direction.asc`         | 递增      | 升序   |     | 当前排序标签             |
| `sort.direction.desc`        | 递减      | 降序   |     | 当前排序标签             |
| `filter.allFiles`            | 全部文件    |      |     | 识别状态筛选             |
| `filter.recognized`          | 已识别     |      |     | 识别状态筛选             |
| `filter.unrecognized`        | 未识别     |      |     | 识别状态筛选             |
| `filter.allImages`           | 全部图片    | 全部文件 |     | 统计 / Settings      |
| `filter.fileFormat`          | 文件格式    |      |     | 搜索标签               |
| `filter.allDirectories`      | 所有目录    |      |     | 目录筛选兜底             |
| `filter.addedDirectories`    | 已添加     |      |     | “所有已添加目录”的短标签      |
| `filter.allAddedDirectories` | 所有已添加目录 |      |     | 内部目录选项的可见名称        |

## 3. 主搜索界面

| 文案 ID                          | 当前中文                                           | 确认中文                                   | 英文  | 使用位置 / 备注          |
| ------------------------------ | ---------------------------------------------- | -------------------------------------- | --- | ------------------ |
| `search.expandCapsule`         | 展开搜索胶囊                                         |                                        |     | aria-label         |
| `search.inputLabel`            | 搜索关键词                                          |                                        |     | 输入框 aria-label     |
| `search.action`                | 搜索                                             |                                        |     | 旧搜索按钮 / aria-label |
| `search.directorySelect`       | 目录选择                                           |                                        |     | 图标提示               |
| `search.settings`              | 设置                                             |                                        |     | 图标提示               |
| `search.colorScheme`           | 配色方案                                           |                                        |     | 图标提示               |
| `search.hideLabelHint`         | 右键单击隐藏标签                                       |                                        |     | 标签 title           |
| `search.showAllLabels`         | 显示所有标签                                         |                                        |     | 标签菜单               |
| `search.hideAllLabels`         | 隐藏所有标签                                         |                                        |     | 标签菜单               |
| `search.filterTitle`           | 筛选：{status}                                    |                                        |     | 识别状态 title         |
| `search.searching`             | 正在搜索...                                        |                                        |     | 搜索状态               |
| `search.resultCount`           | 搜索结果 {count} 张                                 | 搜索结果：{count}                            |     | 结果统计               |
| `search.recognizedCount`       | 已识别图片 {count} 张                                | 已识别文件：{count}                           |     | 结果统计               |
| `search.allImageCount`         | 全部图片：{count}                                   | 全部文件：{count}                            |     | 结果统计               |
| `search.unrecognizedCount`     | 未识别：{count}                                    |                                        |     | 结果统计               |
| `search.parseFailureCount`     | 解析失败：{count}                                   |                                        |     | 未识别结果统计            |
| `search.fileFailureCount`      | 文件错误：{count}                                   |                                        |     | 未识别结果统计            |
| `search.skippedUnrecognized`   | 搜索结果 {count} 张 · {skippedCount} 张未识别图片未参与关键词搜索 | 搜索结果：{count} · {skippedCount} 个未识别文件未参与内容搜索 |     | 动态结果说明             |
| `search.resultGridLabel`       | 搜索结果缩略图                                        | 搜索结果                                   |     | aria-label         |
| `search.unrecognizedGridLabel` | 未识别图片列表                                        | 未识别文件列表                                |     | aria-label         |
| `search.emptyResult`           | 没有匹配的真实图片                                      | 没有匹配的文件                                |     | 空结果                |
| `search.emptyUnrecognized`     | 没有未识别图片                                        | 没有未识别文件                                |     | 空结果                |
| `search.failed`                | 搜索失败。                                          |                                        |     | 搜索失败兜底             |
| `search.fileMissing`           | 文件已不存在                                         |                                        |     | 预览 / 操作反馈          |
| `search.guide.search`          | 在此键入关键词进行搜索。                                  |                                        |     | 首次操作提示            |
| `search.guide.showCurrent`     | 搜索框留空并按下回车键，可浏览当前范围内的内容。                       |                                        |     | 随机操作提示            |
| `search.guide.activateCapsule` | 按下 {shortcut}，随时唤起快速搜索。                         |                                        |     | 动态快捷键提示           |
| `search.guide.activateMicro`   | 按下 {shortcut}，切换至 micro 模式。                      |                                        |     | 动态快捷键提示           |
| `search.guide.activateMini`    | 按下 {shortcut}，切换至 mini 模式。                       |                                        |     | 动态快捷键提示           |
| `search.guide.activateNormal`  | 按下 {shortcut}，使用 normal 模式浏览大量文件。              |                                        |     | 动态快捷键提示           |
| `search.guide.activateLine`    | 按下 {shortcut}，将窗口收起为 line。                       |                                        |     | 动态快捷键提示           |
| `search.guide.openSettings`    | 按下 {shortcut}，快速打开设置界面。                         |                                        |     | 动态快捷键提示           |
| `search.guide.preview`         | 选中一个搜索结果，按下空格键即可快速预览。                         |                                        |     | 随机操作提示            |
| `search.guide.previewNavigate` | 快速预览时，可使用鼠标滚轮或方向键切换文件。                        |                                        |     | 随机操作提示            |
| `search.guide.previewContextMenu` | 快速预览窗口也支持右键菜单。                              |                                        |     | 随机操作提示            |
| `search.guide.multiSelect`     | 按住 Ctrl 或 Shift 点击缩略图，可以选择多个文件。                 |                                        |     | 随机操作提示            |
| `search.guide.batchActions`    | 选择多个文件后，可以批量修改关键词或删除文件。                       |                                        |     | 随机操作提示            |
| `search.guide.dragResult`      | 搜索结果可以直接拖至其他应用。                                |                                        |     | 随机操作提示            |
| `search.guide.labels`          | 点击顶部标签，可以切换目录、状态、排序或文件格式。                      |                                        |     | 随机操作提示            |
| `search.guide.hideLabel`       | 右键单击顶部标签，可以隐藏对应标签。                              |                                        |     | 随机操作提示            |
| `search.guide.labelMenu`       | 右键单击搜索区域，可以统一隐藏或显示标签。                           |                                        |     | 随机操作提示            |
| `search.guide.commandDark`     | 键入 ui:dark 并按下回车键，可切换至黑暗模式。                     |                                        |     | 快捷指令开启时显示        |
| `search.guide.viewCommands`    | 在设置页中可以查看所有快捷指令。                                |                                        |     | 随机操作提示            |
| `search.guide.editShortcuts`   | 在设置页中可以修改快捷动作。                                  |                                        |     | 随机操作提示            |
| `search.guide.trayNormal`      | 双击系统托盘图标，可以快速打开 normal 模式。                      |                                        |     | 随机操作提示            |
| `search.guide.focusSearch`     | 按下 Ctrl+`，可以快速将焦点移回搜索框。                         |                                        |     | 随机操作提示            |
| `search.guide.resultContextMenu` | 右键单击搜索结果，可以查看更多文件操作。                         |                                        |     | 随机操作提示            |

## 4. 窗口控制、预览与右键菜单

| 文案 ID                         | 当前中文              | 确认中文    | 英文  | 使用位置 / 备注       |
| ----------------------------- | ----------------- | ------- | --- | --------------- |
| `window.minimize`             | 最小化               |         |     | 窗口按钮 aria-label |
| `window.maximize`             | 最大化               |         |     | 窗口按钮 aria-label |
| `window.close`                | 关闭                |         |     | 窗口按钮 aria-label |
| `window.restore`              | 还原窗口              |         |     | 主窗口控制栏          |
| `window.maximizeWindow`       | 最大化窗口             |         |     | 主窗口控制栏          |
| `window.changeExpansion`      | 切换窗口展开程度          | 切换窗口模式  |     | 主窗口控制栏          |
| `window.returnStandby`        | 回到待机线条            | 收缩      |     | 主窗口控制栏          |
| `window.pin`                  | 固定/置顶             | 置顶/取消置顶 |     | 主窗口控制栏          |
| `window.openSettings`         | 打开设置              |         |     | 控制栏             |
| `window.returnSearch`         | 返回搜索页             |         |     | Settings 控制栏    |
| `preview.close`               | 关闭预览              |         |     | 预览按钮            |
| `preview.restoreWindow`       | 还原预览窗口            |         |     | 预览控制栏           |
| `preview.maximizeWindow`      | 最大化预览窗口           |         |     | 预览控制栏           |
| `preview.pin`                 | 置顶预览              | 置顶      |     | 预览控制栏           |
| `preview.unpin`               | 取消置顶预览            | 取消置顶    |     | 预览控制栏           |
| `preview.loading`             | 正在加载预览…           |         |     | 等待状态            |
| `preview.action`              | 预览                |         |     | 图片右键菜单          |
| `context.open`                | 打开                |         |     | 图片右键菜单          |
| `context.showInFolder`        | 打开路径              |         |     | 图片右键菜单          |
| `context.editKeywords`        | 编辑关键词             |         |     | 图片右键菜单          |
| `context.deleteFile`          | 删除文件              |         |     | 图片右键菜单          |
| `context.deleteSelectedFiles` | 删除选中的 {count} 个文件 |         |     | 多选右键菜单          |

## 5. Settings：目录、索引与缓存

| 文案 ID                             | 当前中文               | 确认中文 | 英文  | 使用位置 / 备注     |
| --------------------------------- | ------------------ | ---- | --- | ------------- |
| `settings.recognitionStatus`      | 识别状态               |      |     | 统计区           |
| `settings.directoryConfig`        | 配置目录               |      |     | 目录区标题         |
| `settings.directoryUnavailable`   | 暂不可用               |      |     | 目录服务状态        |
| `settings.directoryLoading`       | 正在读取目录...          |      |     | 目录服务状态        |
| `settings.directoryEmpty`         | 尚未添加目录             |      |     | 目录服务状态        |
| `settings.directoryCount`         | {count} 个目录        |      |     | 目录统计          |
| `settings.addDirectory`           | 添加目录               |      |     | 按钮 title      |
| `settings.index`                  | 索引                 |      |     | 索引操作区         |
| `settings.cancelRecognition`      | 取消                 |      |     | 索引操作          |
| `settings.cancellingRecognition`  | 正在取消               |      |     | 索引操作          |
| `settings.retryRecognition`       | 重试                 |      |     | 索引操作          |
| `settings.continueRecognition`    | 继续识别               |      |     | 索引操作          |
| `settings.updateAll`              | 全部更新               |      |     | 索引操作          |
| `settings.recognizing`            | 识别中                |      |     | 索引操作          |
| `settings.scanning`               | 扫描中                |      |     | 索引操作          |
| `settings.indexStatus`            | 索引状态               |      |     | 索引详情          |
| `settings.indexStage`             | 当前阶段               |      |     | 索引详情          |
| `settings.indexProgress`          | 当前进度               |      |     | 索引详情          |
| `settings.indexSuccessCount`      | 成功数量               |      |     | 索引详情          |
| `settings.indexFailureCount`      | 失败数量               |      |     | 索引详情          |
| `settings.indexCurrentFile`       | 当前文件               |      |     | 索引详情          |
| `settings.indexErrorSummary`      | 错误摘要               |      |     | 索引详情          |
| `settings.renameDirectoryHint`    | 双击重命名              |      |     | 目录名 title     |
| `settings.recognizeDirectory`     | 识别                 |      |     | 单目录按钮         |
| `settings.recognizeDirectoryHint` | 仅识别该目录             |      |     | 单目录 title     |
| `settings.deleteDirectoryHint`    | 删除目录               |      |     | 单目录 title     |
| `settings.clearCache`             | 清理缓存               |      |     | 缓存区标题 / title |
| `settings.cacheManagement`        | 缓存管理               |      |     | 缓存设置项标题      |
| `settings.readingCache`           | 读取中                |      |     | 缓存统计          |
| `settings.cacheStats`             | {count} 个 / {size} |      |     | 缓存统计          |
| `settings.cacheOptimizationReady` | {count}个 / {size} 自动优化已开启。 |      |     | 自动缓存状态       |
| `settings.cacheOptimizationRunning` | {count}个 / {size} 正在自动优化缓存，如遇电脑卡顿可手动关闭。 |      |     | 自动缓存状态       |
| `settings.cacheOptimizationCompleted` | {count}个 / {size} 自动优化已完成。 |      |     | 自动缓存状态       |
| `settings.cacheOptimizationDisabled` | {count}个 / {size} 自动优化已关闭，开启可提升浏览体验。 |      |     | 自动缓存状态       |
| `settings.cacheOptimizationOn`    | 自动优化               |      |     | 自动缓存按钮       |
| `settings.cacheOptimizationOff`   | 无优化                |      |     | 自动缓存按钮       |
| `settings.cacheOptimizationOnHint` | 已开启自动生成缓存         |      |     | 自动缓存按钮 title |
| `settings.cacheOptimizationOffHint` | 开启后自动生成缓存         |      |     | 自动缓存按钮 title |
| `settings.clearingCache`          | 清理中                |      |     | 缓存按钮          |
| `settings.clearAllCache`          | 清理全部               |      |     | 缓存按钮          |
| `settings.cacheCleared`           | 清理完成               |      |     | 行内反馈          |

## 6. Settings：偏好、外观与快捷动作

| 文案 ID                              | 当前中文                          | 确认中文                      | 英文  | 使用位置 / 备注       |
| ---------------------------------- | ----------------------------- | ------------------------- | --- | --------------- |
| `settings.language`                | 语言 / Language                 |                           | Language / 语言 | Settings 双语语言入口 |
| `settings.languageSystem`          | 跟随系统 / System                 |                           | 跟随系统 / System | Settings 系统语言值 |
| `settings.themeMode`               | 模式切换                          | 外观切换                      |     | 建议核对名称          |
| `settings.appearance`              | 配置外观                          |                           |     | 外观区             |
| `settings.editColorHint`           | 单击修改                          |                           |     | 颜色按钮 title      |
| `settings.themeColor`              | 主题色                           | 颜色1                       |     | 外观颜色            |
| `settings.accentColor`             | 副色                            | 颜色2                       |     | 外观颜色            |
| `settings.standbyLine`             | 线状胶囊                          | line                      |     | 与“待机线”命名需核对     |
| `settings.visible`                 | 显示                            |                           |     | 待机线状态           |
| `settings.hidden`                  | 不显示                           |                           |     | 待机线状态           |
| `settings.edgeSnap`                | 边缘吸附                          |                           |     | 开关项             |
| `settings.enabled`                 | 打开                            |                           |     | 开关状态            |
| `settings.disabled`                | 关闭                            |                           |     | 开关状态            |
| `settings.launchAtLogin`           | 开机运行                          |                           |     | Windows 登录启动     |
| `settings.launchAtLoginOn`         | 启动                            |                           |     | 开机运行状态          |
| `settings.launchAtLoginOff`        | 关闭                            |                           |     | 开机运行状态          |
| `settings.operationHints`          | 操作提示                          |                           |     | 搜索框操作提示设置       |
| `settings.operationHintsOn`        | 显示                            |                           |     | 操作提示开启状态        |
| `settings.operationHintsOff`       | 关闭                            |                           |     | 操作提示关闭状态        |
| `settings.quickActions`            | 快捷动作                          |                           |     | 配置区             |
| `settings.finishConfiguration`     | 完成配置                          |                           |     | 快捷动作            |
| `settings.configure`               | 配置                            |                           |     | 快捷动作            |
| `settings.shortcutUnavailable`     | 当前设置不可用，需重新设置                 |                           |     | 快捷键冲突提示         |
| `settings.captureShortcut`         | 按下快捷键                         |                           |     | 快捷键录入           |
| `settings.editShortcutHint`        | 单击修改                          |                           |     | 快捷键 title       |
| `settings.quickCommands`           | 快捷指令                          |                           |     | 查看区             |
| `settings.viewQuickCommands`       | 查看                            |                           |     | 快捷指令            |
| `settings.closeQuickCommands`      | 关闭查看                          |                           |     | 快捷指令            |
| `settings.confirmationCommands`    | 需二次确认类                        |                           |     | 快捷指令分组          |
| `settings.confirmationCommandHint` | 危险操作执行前将在输入框内要求输入 y / n 二次确认。 | 执行前将在输入框内要求输入 y / n 二次确认。 |     | 快捷指令说明          |
| `shortcut.activateCapsule`         | 激活胶囊                          | 激活capsule                 |     | 快捷动作名称          |
| `shortcut.activateMicro`           | 激活micro                       |                           |     | 快捷动作名称；中英文空格需核对 |
| `shortcut.activateMini`            | 激活mini                        |                           |     | 快捷动作名称；中英文空格需核对 |
| `shortcut.activateNormal`          | 激活normal                      |                           |     | 快捷动作名称；中英文空格需核对 |
| `shortcut.activateStandby`         | 激活standby                     | 激活line                    |     | 快捷动作名称；中英文空格需核对 |
| `shortcut.openSettings`            | 打开设置                          |                           |     | 快捷动作名称          |

## 7. Settings：llama.cpp、视觉模型与详情

| 文案 ID                             | 当前中文             | 确认中文 | 英文  | 使用位置 / 备注                 |
| --------------------------------- | ---------------- | ---- | --- | ------------------------- |
| `runtime.available`               | 可用               |      |     | llama.cpp 版本状态            |
| `runtime.unselected`              | 未选择              |      |     | llama.cpp 版本状态            |
| `runtime.rootMissing`             | 目录缺失             |      |     | llama.cpp 版本状态            |
| `runtime.noneFound`               | 未发现可用版本          |      |     | llama.cpp 版本状态            |
| `runtime.selectionMissing`        | 所选版本缺失           |      |     | llama.cpp 版本状态            |
| `runtime.startFailed`             | 启动失败             |      |     | llama.cpp 进程状态            |
| `runtime.notFound`                | 未找到llama.cpp     | 未找到 llama.cpp |     | 当前缺少空格，需核对                |
| `model.unpaired`                  | 未配对              |      |     | 视觉模型状态                    |
| `model.paired`                    | 已配对              |      |     | 视觉模型状态                    |
| `model.selectionMissing`          | 所选模型缺失           |      |     | 视觉模型状态                    |
| `model.directoryMissing`          | 模型目录缺失           |      |     | 视觉模型状态                    |
| `model.notFound`                  | 未找到模型            |      |     | 视觉模型状态                    |
| `settings.selectRuntime`          | 选择 llama.cpp 版本  |      |     | select aria-label / title |
| `settings.selectVersion`          | 选择版本             |      |     | 空选项                       |
| `settings.refreshRuntime`         | 刷新 llama.cpp 版本  |      |     | 按钮 title                  |
| `settings.startServer`            | 启动 llama-server  |      |     | 按钮 title                  |
| `settings.stopServer`             | 停止 llama-server  |      |     | 按钮 title                  |
| `settings.visionModel`            | 视觉模型             |      |     | 设置项                       |
| `settings.selectVisionModel`      | 选择视觉模型           |      |     | select / 空选项              |
| `settings.refreshGguf`            | 刷新 GGUF 模型       |      |     | 按钮 title                  |
| `settings.details`                | 详细信息 >           |      |     | details summary           |
| `settings.viewReleases`           | 查看版本发布           |      | View releases | Settings 版本号 title / aria-label |
| `settings.runtimeFileStatus`      | 运行时文件状态          |      | Runtime File Status | 详情字段                      |
| `settings.runtimeDirectory`       | 运行时目录            |      |     | 详情字段                      |
| `settings.serviceAddress`         | 服务地址             |      | Service Address | 服务运行时显示                   |
| `settings.processPid`             | 进程 PID            |      | Process PID | 服务运行时显示                   |
| `settings.runtimeStartedAt`       | 启动时间             |      | Started At | 服务运行时显示                   |
| `settings.runtimeLog`             | 运行日志             |      |     | 详情字段                      |
| `settings.modelDirectory`         | 模型目录             |      |     | 详情字段                      |
| `settings.modelPath`              | 模型路径             |      |     | 详情字段                      |
| `settings.mmprojFile`             | mmproj 文件        |      |     | 详情字段                      |
| `settings.mainModelInfo`          | 主模型大小 / 修改时间     |      |     | 详情字段                      |
| `settings.mmprojInfo`             | mmproj 大小 / 修改时间 |      |     | 详情字段                      |
| `settings.modelInventory`         | 可用模型 / GGUF 文件   |      | Available Models / GGUF Files | 显示可加载模型组合数 / GGUF 文件数 |

## 8. 编辑、删除与缓存弹层

| 文案 ID                         | 当前中文                  | 确认中文 | 英文  | 使用位置 / 备注  |
| ----------------------------- | --------------------- | ---- | --- | ---------- |
| `keywords.selectedCount`      | 已选择 {count} 个文件       |      |     | 关键词编辑      |
| `keywords.label`              | 关键词                   |      |     | 关键词编辑      |
| `keywords.placeholder`        | 为所选项添加关键词，用逗号分隔       |      |     | 输入框        |
| `keywords.resultTitle`        | 关键词更新结果               |      |     | aria-label |
| `keywords.updateFailedCount`  | {count} 个文件更新失败。      |      |     | 更新结果       |
| `keywords.updateCompleted`    | 关键词更新完成。              |      |     | 更新结果       |
| `delete.fileDialogTitle`      | 删除文件                  |      |     | aria-label |
| `delete.movingToTrash`        | 正在将 {count} 个文件移入回收站… |      |     | 删除进度       |
| `delete.failedCount`          | {count} 个文件删除失败。      |      |     | 删除结果       |
| `delete.completed`            | 文件删除完成。               |      |     | 删除结果       |
| `delete.fileQuestion`         | 是否将选中的文件移入回收站？        |      |     | 删除确认       |
| `delete.directoryDialogTitle` | 删除目录                  |      |     | aria-label |
| `delete.directoryQuestion`    | 是否删除目录及索引？            |      |     | 删除确认       |
| `cache.dialogTitle`           | 清理缓存                  |      |     | aria-label |
| `cache.completed`             | 缓存清理完成。               |      |     | 清理结果       |
| `cache.regenerationHint`      | 视觉缓存会按需重新生成。          |      |     | 清理确认       |
| `cache.clearQuestion`         | 本次是否清理？               |      |     | 清理确认       |

## 9. 快捷指令查看页：分类与说明

| 文案 ID                              | 当前中文                              | 确认中文                             | 英文   | 使用位置 / 备注        |
| ---------------------------------- | --------------------------------- | -------------------------------- | ---- | ---------------- |
| `commands.group.settings`          | 设置页类                              | 设置页                              |      | 分类标题             |
| `commands.group.view`              | 查看类                               | 查看                               |      | 分类标题             |
| `commands.group.window`            | 窗口模式类                             | 窗口模式                             |      | 分类标题             |
| `commands.group.tags`              | 标签类                               | 标签                               |      | 分类标题             |
| `commands.group.index`             | 索引类                               | 索引                               |      | 分类标题             |
| `commands.group.directory`         | 目录类                               | 目录                               |      | 分类标题             |
| `commands.group.appearance`        | 外观类                               | 外观                               |      | 分类标题             |
| `commands.group.appBehavior`       | 软件行为                              |                                  |      | 分类标题             |
| `commands.group.standby`           | 待机线类                              | line |      | 分类标题             |
| `commands.group.edgeSnap`          | 边缘吸附类                             | 边缘吸附                             |      | 分类标题             |
| `commands.group.shortcuts`         | 快捷键类                              | 快捷动作                             |      | 分类标题；与快捷动作需核对    |
| `commands.group.commands`          | 快捷指令类                             | 快捷指令                             |      | 分类标题             |
| `commands.group.language`          | 语言类                               | 语言                               |      | 分类标题             |
| `commands.group.runtime`           | llama.cpp 类                       | llama.cpp                        |      | 分类标题             |
| `commands.group.model`             | 视觉模型类                             | 视觉模型                             |      | 分类标题             |
| `commands.group.app`               | 软件操作类                             | 软件操作                             |      | 分类标题             |
| `commands.group.cache`             | 缓存类                               | 缓存                               |      | 分类标题             |
| `commands.set.open`                | 打开设置页                             | 打开设置                             |      | `set:`           |
| `commands.set.quick`               | 快捷动作配置                            |                                  |      | `set:quick`      |
| `commands.set.commands`            | 查看快捷指令                            |                                  |      | `set:cmd`        |
| `commands.view.all`                | 查看全部已添加文件                         |                                  |      | `see:all`        |
| `commands.view.recognized`         | 查看已识别文件                           |                                  |      | `see:indexed`    |
| `commands.view.unrecognized`       | 查看未识别文件                           |                                  |      | `see:unindexed`  |
| `commands.view.directory`          | 查看指定目录                            |                                  |      | `see:dir`        |
| `commands.window.standby`          | 切换到待机线状态                          | 切换为 line 模式                      |      | `win:line`       |
| `commands.window.capsule`          | 切换到 Capsule 胶囊输入状态                | 切换为 capsule 模式                   |      | `win:cap`        |
| `commands.window.micro`            | 切换到 micro 状态                      | 切换为 micro 模式                     |      | `win:micro`      |
| `commands.window.mini`             | 切换到 mini 状态                       | 切换为 mini 模式                      |      | `win:mini`       |
| `commands.window.normal`           | 切换到 normal 状态                     | 切换为 normal 模式                    |      | `win:normal`     |
| `commands.window.max`              | 最大化 / 标准大窗口状态                     | 窗口最大化                            |      | `win:max`        |
| `commands.window.pin`              | 窗口置顶                              |                                  |      | `win:top on`     |
| `commands.window.unpin`            | 取消窗口置顶                            |                                  |      | `win:top off`    |
| `commands.tags.showDirectory`      | 显示目录标签                            |                                  |      | `tag:dir`        |
| `commands.tags.selectDirectory`    | 选择指定目录标签                          |                                  |      | `tag:dir "目录名称"` |
| `commands.tags.showSort`           | 显示排序标签                            |                                  |      | `tag:sort`       |
| `commands.tags.sortAsc`            | 切换为递增排序                           | 切换为升序排序                           |      | `tag:sort asc`   |
| `commands.tags.sortDesc`           | 切换为递减排序                           | 切换为降序排序                           |      | `tag:sort desc`  |
| `commands.tags.showAll`            | 显示所有标签                            |                                  |      | `tag:show all`   |
| `commands.tags.hideAll`            | 隐藏所有标签                            |                                  |      | `tag:hide all`   |
| `commands.tags.hideDirectory`      | 隐藏目录标签                            |                                  |      | `tag:hide dir`   |
| `commands.tags.hideSort`           | 隐藏排序标签                            |                                  |      | `tag:hide sort`  |
| `commands.index.all`               | 更新全部索引                            |                                  |      | `idx:all`        |
| `commands.index.directory`         | 识别指定目录                            |                                  |      | `idx:dir`        |
| `commands.index.continue`          | 继续识别未完成文件                         |                                  |      | `idx:continue`   |
| `commands.index.stop`              | 停止当前识别任务                          |                                  |      | `idx:stop`       |
| `commands.directory.add`           | 添加目录                              |                                  |      | `dir:add`        |
| `commands.directory.rename`        | 重命名目录显示名                          |                                  |      | `dir:rename`     |
| `commands.directory.refresh`       | 刷新目录统计 / 状态                       |                                  |      | `dir:refresh`    |
| `commands.appearance.light`        | 切换亮色模式                            | 切换明亮模式                            |      | `ui:light`；需统一   |
| `commands.appearance.dark`         | 切换暗色模式                            | 切换黑暗模式                            |      | `ui:dark`；需统一    |
| `commands.appearance.system`       | 跟随系统主题                            |                                  |      | `ui:auto`        |
| `commands.appearance.themeColor`   | 设置主题色                             | 设置颜色1                             |      | `ui:main`        |
| `commands.appearance.accentColor`  | 设置副色                              | 设置颜色2                              |      | `ui:accent`      |
| `commands.appearance.reset`        | 恢复默认外观配置                          |                                  |      | `ui:reset`       |
| `commands.app.startupEnable`       | 开启开机运行                            |                                  |      | `app:startup on` |
| `commands.app.startupDisable`      | 关闭开机运行                            |                                  |      | `app:startup off` |
| `commands.app.hintsEnable`         | 显示操作提示                            |                                  |      | `app:hints on`   |
| `commands.app.hintsDisable`        | 关闭操作提示                            |                                  |      | `app:hints off`  |
| `commands.standby.show`            | 显示待机线                             | 显示 line                          |      | `line:on`        |
| `commands.standby.hide`            | 隐藏待机线                             | 隐藏 line                          |      | `line:off`       |
| `commands.edgeSnap.enable`         | 开启边缘吸附                            |                                  |      | `edge:on`        |
| `commands.edgeSnap.disable`        | 关闭边缘吸附                            |                                  |      | `edge:off`       |
| `commands.shortcuts.enable`        | 启用全局快捷键                           |                                  |      | `key:global on`  |
| `commands.shortcuts.disable`       | 禁用全局快捷键                           |                                  |      | `key:global off` |
| `commands.shortcuts.reset`         | 恢复快捷动作默认配置                        |                                  |      | `key:reset`      |
| `commands.parser.enable`           | 启用快捷指令解析                          |                                  |      | `cmd:on`         |
| `commands.parser.disable`          | 禁用快捷指令解析                          |                                  |      | `cmd:off`        |
| `commands.language.system`         | 跟随系统语言                            |                                  |      | `lang:auto`      |
| `commands.language.chinese`        | 中文界面                              |                                  |      | `lang:cn`        |
| `commands.language.english`        | 英文界面                              |                                  |      | `lang:en`        |
| `commands.runtime.start`           | 启动 llama.cpp / llama-server       |                                  |      | `llama:start`    |
| `commands.runtime.select`          | 切换 llama.cpp 版本                   |                                  |      | `llama:use`      |
| `commands.runtime.refresh`         | 刷新 llama.cpp 版本列表                 |                                  |      | `llama:refresh`  |
| `commands.model.refresh`           | 刷新视觉模型列表                          |                                  |      | `model:refresh`  |
| `commands.model.select`            | 切换视觉模型                            |                                  |      | `model:use`      |
| `commands.cache.thumbnail`         | 仅清理缩略图缓存                          |                                  |      | `cache:thumb`    |
| `commands.cache.preview`           | 仅清理预览缓存                           |                                  |      | `cache:preview`  |
| `commands.cache.model`             | 仅清理模型输入图缓存                        |                                  |      | `cache:model`    |
| `commands.confirm.deleteDirectory` | 删除目录、索引和相关缓存，需二次确认                | 删除目录、索引和相关缓存                     |      | `dir:delete`     |
| `commands.confirm.clearIndex`      | 清除全部索引，需二次确认                      | 清除全部索引                           |      | `idx:clear all`  |
| `commands.confirm.quit`            | 真正退出 Cap7CE，需二次确认                 | 关闭 Cap7CE 运行进程                   |      | `app:quit`       |
| `commands.confirm.stopRuntime`     | 停止 llama.cpp / llama-server，需二次确认 | 停止 llama.cpp / llama-server      |      | `llama:stop`     |
| `commands.confirm.clearCache`      | 清理缩略图 / 预览 / 模型输入缓存，需二次确认         | 清理缩略图 / 预览 / 模型输入缓存              |      | `cache:clear`    |

## 10. 快捷指令执行反馈

| 文案 ID                                 | 当前中文                    | 确认中文 | 英文   | 使用位置 / 备注       |
| ------------------------------------- | ----------------------- | ---- | ---- | --------------- |
| `command.pending`                     | 暂不支持：{command}          |      |      | 尚未接入的指令         |
| `command.invalid`                     | 指令无效：{command}          |      |      | 解析失败            |
| `command.missingArgument`             | 缺少参数：{message}          |      |      | 参数不足            |
| `command.missingDirectoryName`        | 缺少目录名称                  |      |      | 参数不足            |
| `command.missingDirectoryPath`        | 缺少目录路径                  |      |      | 参数不足            |
| `command.missingColor`                | 缺少颜色值                   |      |      | 参数不足            |
| `command.missingRuntimeName`          | 缺少 llama.cpp 版本名称       |      |      | 参数不足            |
| `command.missingModelName`            | 缺少模型名称                  |      |      | 参数不足            |
| `command.enterYesOrNo`                | 请输入 y 或 n               |      |      | 二次确认输入          |
| `command.cancelled`                   | 已取消操作                   |      |      | 二次确认取消          |
| `command.taskRunning`                 | 已有任务正在运行                |      |      | 任务冲突            |
| `command.taskNotRunning`              | 当前没有正在运行的任务             |      |      | 停止识别            |
| `command.directoryNotFound`           | 未找到目录                   |      |      | 目录操作            |
| `command.directoryNameEmpty`          | 目录名称不能为空                |      |      | 重命名             |
| `command.viewedAll`                   | 已查看全部文件                 |      |      | `see:all`       |
| `command.viewedRecognized`            | 已查看已识别文件                |      |      | `see:indexed`   |
| `command.viewedUnrecognized`          | 已查看未识别文件                |      |      | `see:unindexed` |
| `command.viewedDirectory`             | 已查看目录：{name}            |      |      | `see:dir`       |
| `command.windowChanged`               | 已切换 {mode}              |      |      | 窗口模式            |
| `command.windowMaximized`             | 已最大化窗口                  |      |      | 窗口模式            |
| `command.windowPinEnabled`            | 已开启窗口置顶                 |      |      | 窗口置顶            |
| `command.windowPinDisabled`           | 已关闭窗口置顶                 |      |      | 窗口置顶            |
| `command.directoryLabelShown`         | 已显示目录标签                 |      |      | 标签操作            |
| `command.directorySelected`           | 已选择目录：{name}            |      |      | 标签操作            |
| `command.sortLabelShown`              | 已显示排序标签                 |      |      | 标签操作            |
| `command.sortAsc`                     | 已切换递增排序                 | 已切换升序排序 |      | 排序              |
| `command.sortDesc`                    | 已切换递减排序                 | 已切换降序排序 |      | 排序              |
| `command.allLabelsShown`              | 已显示所有标签                 |      |      | 标签操作            |
| `command.allLabelsHidden`             | 已隐藏所有标签                 |      |      | 标签操作            |
| `command.directoryLabelHidden`        | 已隐藏目录标签                 |      |      | 标签操作            |
| `command.sortLabelHidden`             | 已隐藏排序标签                 |      |      | 标签操作            |
| `command.indexAllStarted`             | 已开始更新全部索引               |      |      | 索引              |
| `command.directoryRecognitionStarted` | 已开始识别目录：{name}          |      |      | 索引              |
| `command.recognitionContinued`        | 已继续识别未完成文件              |      |      | 索引              |
| `command.recognitionStopped`          | 已停止当前识别任务               |      |      | 索引              |
| `command.confirmDeleteDirectory`      | 确认删除目录“{name}”？输入 y / n |      |      | 二次确认            |
| `command.directoryDeleted`            | 已删除目录：{name}            |      |      | 目录              |
| `command.directoryDeleteFailed`       | 删除目录失败                  |      |      | 目录              |
| `command.directoryRenamed`            | 已重命名目录：{name}           |      |      | 目录              |
| `command.directoryStatusRefreshed`    | 已刷新目录状态                 |      |      | 目录              |
| `command.settingsOpened`              | 已打开设置页                  | 已打开设置 |      | Settings        |
| `command.quickActionsOpened`          | 已打开快捷动作配置               |      |      | Settings        |
| `command.quickCommandsOpened`         | 已打开快捷指令                 |      |      | Settings        |
| `command.themeChanged`                | 已切换{theme}              |      |      | 主题切换            |
| `command.invalidColor`                | 颜色值无效                   |      |      | 外观              |
| `command.themeColorSet`               | 已设置主题色                  | 已设置颜色1 |      | 外观              |
| `command.accentColorSet`              | 已设置副色                   | 已设置颜色2 |      | 外观              |
| `command.appearanceReset`             | 已恢复默认外观配置               |      |      | 外观              |
| `command.standbyShown`                | 已显示待机线                  | 已显示 line |      | line             |
| `command.standbyHidden`               | 已隐藏待机线                  | 已隐藏 line |      | line             |
| `command.edgeSnapEnabled`             | 已开启边缘吸附                 |      |      | 边缘吸附            |
| `command.edgeSnapDisabled`            | 已关闭边缘吸附                 |      |      | 边缘吸附            |
| `command.globalShortcutsEnabled`      | 已开启全局快捷键                |      |      | 快捷动作            |
| `command.globalShortcutsDisabled`     | 已关闭全局快捷键                |      |      | 快捷动作            |
| `command.globalShortcutsFailed`       | 全局快捷键注册失败               |      |      | 快捷动作            |
| `command.shortcutsReset`              | 已恢复快捷动作默认配置             |      |      | 快捷动作            |
| `command.defaultShortcutsUnavailable` | 默认快捷键当前不可用              |      |      | 快捷动作            |
| `command.parserEnabled`               | 已启用快捷指令解析               |      |      | 快捷指令            |
| `command.parserDisabled`              | 已禁用快捷指令解析               |      |      | 快捷指令            |
| `command.launchAtLoginEnabled`         | 已开启开机运行                  |      |      | 软件行为            |
| `command.launchAtLoginDisabled`        | 已关闭开机运行                  |      |      | 软件行为            |
| `command.operationHintsEnabled`        | 已显示操作提示                  |      |      | 软件行为            |
| `command.operationHintsDisabled`       | 已关闭操作提示                  |      |      | 软件行为            |
| `command.runtimeListRefreshed`        | 已刷新 llama.cpp 版本列表      |      |      | llama.cpp       |
| `command.runtimeStarted`              | 已启动 llama.cpp           |      |      | llama.cpp       |
| `command.runtimeSelected`             | 已切换 llama.cpp 版本：{name} |      |      | llama.cpp       |
| `command.confirmStopRuntime`          | 确认停止 llama.cpp？输入 y / n |      |      | 二次确认            |
| `command.runtimeStopped`              | 已停止 llama.cpp           |      |      | llama.cpp       |
| `command.runtimeStopFailed`           | 停止 llama.cpp 失败         |      |      | llama.cpp       |
| `command.modelListRefreshed`          | 已刷新视觉模型列表               |      |      | 视觉模型            |
| `command.modelSelected`               | 已切换视觉模型：{name}          |      |      | 视觉模型            |
| `command.confirmClearCache`           | 确认清理缓存？输入 y / n         |      |      | 二次确认            |
| `command.cacheCleared`                | 已清理缓存                   |      |      | 缓存              |
| `command.cacheClearFailed`            | 清理缓存失败                  |      |      | 缓存              |
| `command.confirmQuit`                 | 确认退出 Cap7CE？输入 y / n    |      |      | 二次确认            |
| `command.quitting`                    | 正在退出 Cap7CE             |      |      | 软件操作            |
| `command.quitFailed`                  | 退出 Cap7CE 失败            |      |      | 软件操作            |

## 11. 服务错误与操作反馈

| 文案 ID                                 | 当前中文                                | 确认中文            | 英文  | 使用位置 / 备注   |
| ------------------------------------- | ----------------------------------- | --------------- | --- | ----------- |
| `error.connectionFailed`              | 连接失败                                |                 |     | fetch 错误格式化 |
| `error.scanUnavailable`               | 扫描服务暂时不可用。                          |                 |     | 目录扫描        |
| `error.scanFailed`                    | 扫描失败。                               |                 |     | 目录扫描        |
| `error.recognitionFailed`             | AI 识图失败。                            | AI 识别失败。        |     | 识别          |
| `error.supplementUnavailable`         | 补识别服务暂时不可用。                         |                 |     | 补识别         |
| `error.supplementFailed`              | 补识别失败。                              |                 |     | 补识别         |
| `error.indexUnavailable`              | 图片索引服务暂时不可用。                        | 文件索引服务暂时不可用。 |     | 索引 / 关键词    |
| `error.batchKeywordFailed`            | 关键词批量更新失败。                          |                 |     | 关键词         |
| `error.metadataSaveFailed`            | 保存图片描述和关键词失败。                       | 保存描述和关键词失败。 |     | 关键词         |
| `error.fileOperationUnavailable`      | 文件操作服务暂时不可用。                        |                 |     | 删除          |
| `error.fileDeletedRefreshFailed`      | 文件已删除，但状态刷新失败，正在重新加载。               |                 |     | 删除反馈        |
| `error.partialDeleteFailed`           | 部分文件删除失败。                           |                 |     | 删除反馈        |
| `error.deleteIncomplete`              | 文件删除未完成。                            |                 |     | 删除反馈        |
| `error.deleteFailed`                  | 删除文件失败。                             |                 |     | 删除反馈        |
| `error.cacheUnavailable`              | 缓存清理服务暂时不可用。                        |                 |     | 缓存          |
| `error.cacheFailed`                   | 缓存清理失败。                             |                 |     | 缓存          |
| `error.runtimeRefreshFailed`          | 刷新 llama.cpp 版本列表失败                 |                 |     | 快捷指令反馈      |
| `error.runtimeAlreadyRunning`         | llama.cpp 已在运行                      |                 |     | 快捷指令反馈      |
| `error.runtimeStartFailed`            | llama.cpp 启动失败                      |                 |     | 快捷指令反馈      |
| `error.stopRecognitionFirst`          | 请先停止当前识别任务                          |                 |     | 模型 / 运行时切换  |
| `error.runtimeVersionNotFound`        | 未找到 llama.cpp 版本                    |                 |     | 运行时切换       |
| `error.runtimeSwitchFailed`           | 切换 llama.cpp 版本失败                   |                 |     | 运行时切换       |
| `error.modelRefreshFailed`            | 刷新视觉模型列表失败                          |                 |     | 模型          |
| `error.modelNotFound`                 | 未找到视觉模型                             |                 |     | 模型          |
| `error.modelSwitchFailed`             | 切换视觉模型失败                            |                 |     | 模型          |
| `error.normalWindowSwitchFailed`      | 切换 normal 窗口失败                      | 切换为 normal 模式失败 |     | 快捷指令        |
| `error.windowMaximizeFailed`          | 最大化窗口失败                             |                 |     | 快捷指令        |
| `error.windowPinUpdateFailed`         | 更新窗口置顶状态失败                          |                 |     | 快捷指令        |
| `error.runtimeNotRunning`             | llama.cpp 未运行                       |                 |     | 停止运行时       |
| `error.directoryStatusRefreshFailed`  | 刷新目录状态失败                            |                 |     | 目录          |
| `error.directoryRenameFailed`         | 重命名目录失败                             |                 |     | 目录          |
| `error.windowPinEnableFailed`         | 开启窗口置顶失败                            |                 |     | 窗口置顶        |
| `error.windowPinDisableFailed`        | 关闭窗口置顶失败                            |                 |     | 窗口置顶        |
| `error.fileDeleteServiceFailed`       | 文件删除服务失败。                           |                 |     | 主进程文件操作     |
| `error.fileDragStartFailed`           | 文件拖拽启动失败。                           |                 |     | 主进程文件操作     |
| `error.directoryDoesNotExist`         | 指定目录不存在。                            |                 |     | 主进程目录校验     |
| `error.fileOutsideAddedDirectories`   | 图片不属于已添加目录。                         | 文件不属于已添加目录。     |     | 关键词更新       |
| `error.fileMissingOrStale`            | 图片文件不存在或已失效。                        | 文件不存在或已失效。      |     | 关键词更新       |
| `error.invalidImageFile`              | 图片文件无效。                             | 文件无效。           |     | 关键词更新       |
| `error.invalidMetadata`               | 图片描述或关键词格式无效。                       | 描述或关键词格式无效。     |     | 关键词更新       |
| `error.invalidBatchKeywordSource`     | 关键词批量更新请求来源无效。                      |                 |     | 关键词更新       |
| `error.noBatchKeywordSelection`       | 未选择需要更新的文件。                         |                 |     | 关键词更新       |
| `error.invalidBatchKeywordParameters` | 关键词批量更新参数无效。                        |                 |     | 关键词更新       |
| `error.invalidBatchKeywordTarget`     | 关键词批量更新目标无效。                        |                 |     | 关键词更新       |
| `error.duplicateBatchKeywordTarget`   | 关键词批量更新目标重复。                        |                 |     | 关键词更新       |
| `error.stopServerBeforeRuntimeSwitch` | 请先停止 llama-server，再切换 llama.cpp 版本。 |                 |     | 运行时设置       |
| `error.stopServerBeforeModelSwitch`   | 请先停止 llama-server，再切换视觉模型。          |                 |     | 模型设置        |
| `error.cacheConfirmationRequired`     | 清理缓存需要用户确认。                         |                 |     | 缓存 IPC 校验   |

## 12. 文件选择器与辅助提示

| 文案 ID                           | 当前中文        | 确认中文      | 英文  | 使用位置 / 备注    |
| ------------------------------- | ----------- | --------- | --- | ------------ |
| `dialog.selectIndexDirectory`   | 选择索引目录      |           |     | 系统目录选择器标题    |
| `settings.viewAllSupportedHint` | 双击查看全部受支持文件 |           |     | 识别状态统计 title |
| `settings.viewRecognizedHint`   | 双击查看已识别图片   | 双击查看已识别文件 |     | 识别状态统计 title |
| `settings.viewUnrecognizedHint` | 双击查看未识别图片   | 双击查看未识别文件 |     | 识别状态统计 title |
| `settings.indexScanning`        | 正在扫描        |           |     | 索引阶段         |
| `settings.indexRecognizing`     | 正在识别        |           |     | 索引阶段         |

## 13. 系统托盘

| 文案 ID                  | 当前中文      | 确认中文    | 英文  | 使用位置 / 备注 |
| ---------------------- | --------- | ------- | --- | --------- |
| `tray.hideStandbyLine` | 隐藏待机线     | 隐藏 line |     | 托盘菜单      |
| `tray.showStandbyLine` | 显示待机线     | 显示 line |     | 托盘菜单      |
| `tray.openSettings`    | 打开设置页     | 打开设置    |     | 托盘菜单      |
| `tray.quit`            | 退出 Cap7CE |         |     | 托盘菜单      |

---

## 初步发现的术语冲突（供核对）

以下仅是扫描结果，不代表已决定修改：

1. 主题状态同时存在“浅色 / 深色”“明亮 / 黑暗”“亮色模式 / 暗色模式”。
2. Settings 使用“模式切换”，但软件同时存在 Capsule / micro / mini / normal 等窗口模式，语义容易混淆。
3. 同一功能存在“线状胶囊”“待机线”“待机线条”三种名称。
4. 同一颜色角色存在“副色”，后续可确认是否统一为“强调色”。
5. Settings 使用“快捷动作”，快捷指令分类使用“快捷键类”，执行反馈又使用“全局快捷键”。三者可能需要明确层级。
6. “已识别 / 未识别”与快捷指令语法中的 `indexed / unindexed` 含义相关，但用户界面是否统一使用“识别”需要确认。
7. “递增 / 递减”用于排序方向，可确认是否改为更常见的“升序 / 降序”。
8. “打开路径”实际行为是由系统文件管理器定位文件，可确认是否改为“在文件夹中显示”或“打开所在位置”。
9. `未找到llama.cpp` 缺少空格，而其他位置使用 `llama.cpp`。
10. 省略号同时存在三个英文句点 `...` 和中文省略号 `…`，可统一显示规范。

## 用户补充区

可在此直接记录全局规则，例如：

- 主题模式统一使用：明亮/黑暗
- 所有语言模式下，除快捷指令 win:cap 为简写外，窗口形态统一使用：line / capsule / micro / mini / normal ，包括用户可见文字及内部代号，以避免混淆。
- 待机线统一使用：line
- 颜色角色统一使用：颜色1 / 颜色2
- 排序方向统一使用：升序 / 降序
- “识别 / 索引”使用边界：AI 内容分析使用“识别”，数据库记录及维护使用“索引”
- 标点和空格规则：中文标点；省略号统一用“…”；中英文之间留一个空格；短按钮不加句号，完整提示可加句号
- 英文风格（美式 / 英式）：美式
