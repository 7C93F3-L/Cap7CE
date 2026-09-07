# Cap7CE 界面文案核对表

> 来源：Cap7CE 1.0.0 当前代码（2026-09-07）
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
| `filter.allImages`           | 全部图片    | 全部文件 |     | 统计 / Settings      |
| `filter.fileFormat`          | 文件格式    |      |     | 搜索标签               |
| `filter.allDirectories`      | 所有目录    |      |     | 目录筛选兜底             |
| `filter.addedDirectories`    | 已添加     |      |     | “所有已添加目录”的短标签      |
| `filter.allAddedDirectories` | 所有已添加目录 |      |     | 内部目录选项的可见名称        |

## 3. 主搜索界面

| 文案 ID                          | 当前中文                                           | 确认中文                                   | 英文  | 使用位置 / 备注          |
| ------------------------------ | ---------------------------------------------- | -------------------------------------- | --- | ------------------ |
| `search.inputLabel`            | 搜索关键词                                          |                                        |     | 输入框 aria-label     |
| `search.action`                | 搜索                                             |                                        |     | 旧搜索按钮 / aria-label |
| `search.aiEnhance` | AI 增强 |  | AI Enhance | 顶部 AI 深度匹配总开关 |
| `search.aiEnhanceCompleted` | AI 深度匹配完成 |  | AI deep matching completed | 搜索框临时反馈 |
| `search.aiRecognitionDisabled` | AI 深度匹配已关闭，请先在设置中开启。 |  | AI deep matching is disabled. Enable it in Settings first. | 设置总许可关闭反馈 |
| `search.aiStartFailed` / `search.aiFailed` | AI 深度匹配启动失败。/ AI 深度匹配失败。 |  | Failed to start AI deep matching. / AI deep matching failed. | Renderer 启动与主进程兜底反馈 |
| `search.aiInvalidRequest` / `search.aiInvalidRequestParameters` | AI 深度匹配请求无效。/ AI 深度匹配请求参数无效。 |  | The AI deep matching request is invalid. / The AI deep matching request parameters are invalid. | IPC 参数校验反馈 |
| `search.aiConsecutiveInvalidResults` | AI 深度匹配已停止：模型连续返回了无法使用的结果。 |  | AI deep matching stopped because the model returned unusable results repeatedly. | 连续模型失败反馈 |
| `search.aiVisionEmptyResponse` / `search.aiVisionInvalidScore` | llama-server 没有返回视觉判断结果。/ AI 视觉判断没有返回单个 0、1 或 2。 |  | llama-server returned no visual result. / The AI visual check did not return a single 0, 1, or 2. | 模型响应校验反馈 |
| `search.aiVisionCancelled` / `search.aiVisionTimeout` | AI 视觉判断已取消。/ AI 视觉判断超时。 |  | The AI visual check was cancelled. / The AI visual check timed out. | 模型请求终止反馈 |
| `search.aiVisionRequestFailed` | llama-server 视觉判断请求失败（{status}）：{detail} |  | The llama-server visual request failed ({status}): {detail} | 模型 HTTP 失败反馈 |
| `search.aiVisionInvalidResponse` | llama-server 返回了无效响应。 |  | llama-server returned an invalid response. | 模型 JSON 失败反馈 |
| `runtime.visionStartupFailed` / `runtime.visionUnavailable` | llama-server 启动或视觉模型加载失败。/ llama-server 已启动，但健康检查或模型状态不可用。 |  | llama-server failed to start or load the vision model. / llama-server started, but its health check or model state is unavailable. | AI 深度匹配启动兜底反馈 |
| `search.directorySelect`       | 目录选择                                           |                                        |     | 图标提示               |
| `stableUi.sidebar.moveDirectoryUp` / `stableUi.sidebar.moveDirectoryDown` | 上移 / 下移 | | Move Up / Move Down | 已添加目录管理浮层 |
| `skim.locationPicker.open`     | skim 边栏                                        |                                        | skim sidebar | 主窗口与预览窗口入口 title / aria-label |
| `skim.locationPicker.close`    | 收起 skim 边栏                                     |                                        | Close skim sidebar | 主窗口与预览窗口入口 title / aria-label |
| `search.directorySwitched`     | 已切换到目录 {name}                                  |                                        |     | 目录标签反馈            |
| `search.allDirectoriesSwitched` | 已切换为所有已添加目录                               |                                        |     | 目录标签反馈            |
| `search.displaySwitched.skim`  | 已查看默认格式                                       |                                        |     | 查看范围反馈            |
| `search.displaySwitched.all`   | 已查看全部格式                                       |                                        |     | 查看范围反馈            |
| `search.displaySwitched.custom` | 已查看自定义格式                                    |                                        |     | 查看范围反馈            |
| `search.sortSwitched.modifiedAtDesc` | 已按时间降序排序                              |                                        |     | 排序反馈               |
| `search.sortSwitched.modifiedAtAsc` | 已按时间升序排序                               |                                        |     | 排序反馈               |
| `search.sortSwitched.fileNameAsc` | 已按名称升序排序                                  |                                        |     | 排序反馈               |
| `stableUi.resizeSidebar` / `stableUi.resizeSkim` | 调整侧栏宽度 / 调整 Skim 宽度 | | Resize sidebar / Resize Skim | 新版键盘分隔线 aria-label |
| `stableUi.resultsRegion` | 搜索结果区 | | Search results | 新版结果区域 aria-label |
| `search.sortSwitched.fileNameDesc` | 已按名称降序排序                                 |                                        |     | 排序反馈               |
| `search.settings`              | 设置                                             |                                        |     | 图标提示               |
| `search.colorScheme`           | 配色方案                                           |                                        |     | 图标提示               |
| `search.hideLabelHint`         | 右键单击隐藏标签                                       |                                        |     | 标签 title           |
| `search.showAllLabels`         | 显示所有标签                                         |                                        |     | 标签菜单               |
| `search.hideAllLabels`         | 隐藏所有标签                                         |                                        |     | 标签菜单               |
| `search.filterTitle`           | 筛选：{status}                                    |                                        |     | 识别状态 title         |
| `search.searching`             | 正在搜索...                                        |                                        |     | 搜索状态               |
| `search.resultCount`           | 搜索结果 {count} 张                                 | 搜索结果：{count}                            | Results: {count} | 有搜索或筛选条件时的结果数 |
| `search.fileCount`             |                                                  | 文件数量：{count}                            | Files: {count} | 默认全目录无搜索条件时的文件总数 |
| `search.recognizedCount`       | 已识别图片 {count} 张                                | 已识别文件：{count}                           |     | 结果统计               |
| `search.allImageCount`         | 全部图片：{count}                                   | 全部文件：{count}                            |     | 结果统计               |
| `search.unrecognizedCount`     | 未识别：{count}                                    |                                        |     | 结果统计               |
| `search.parseFailureCount`     | 解析失败：{count}                                   |                                        |     | 未识别结果统计            |
| `search.fileFailureCount`      | 文件错误：{count}                                   |                                        |     | 未识别结果统计            |
| `search.skippedUnrecognized`   | 搜索结果 {count} 张 · {skippedCount} 张未识别图片未参与关键词搜索 | 搜索结果：{count} · {skippedCount} 个未识别文件未参与内容搜索 |     | 动态结果说明             |
| `search.resultGridLabel`       | 搜索结果缩略图                                        | 搜索结果                                   |     | aria-label         |
| `search.unrecognizedGridLabel` | 未识别图片列表                                        | 未识别文件列表                                |     | aria-label         |
| `search.section.fastMatch.title` | 快速匹配 |  | Quick Match | 明确信息展示分类卡标题 |
| `search.section.fastMatch.description` | 根据文件信息直接匹配 |  | Matched directly from file information | 展示分类卡说明 |
| `search.section.possibleSimilarity.title` | 可能相似 |  | Possibly Similar | 已有 AI 与低级视觉属性展示分类卡标题 |
| `search.section.possibleSimilarity.description` | 根据特征找到相似内容 |  | Similar content found from known features | 展示分类卡说明 |
| `search.section.aiDeepMatch.title` | AI 深度匹配 |  | AI Deep Match | 按需 AI 搜索的静态分类卡标题 |
| `search.section.aiDeepMatch.description` | AI 找到可能接近的内容 |  | Content that AI found potentially relevant | 顶部总开关关闭后保留结果时的静态分类说明 |
| `search.section.aiDeepMatch.completedDescription` | 深度匹配已完成 |  | Deep matching completed | 当前范围全部检查完成 |
| `search.section.aiMatching.title` | AI 匹配中 |  | AI Matching | 当前范围持续匹配状态 |
| `search.section.aiMatching.description` | 点击暂停本次深度匹配 |  | Click to pause this deep match | 运行中分类卡整卡操作说明 |
| `search.section.aiMatching.progressDescription` | 已处理 {processed} / {total}，点击暂停 |  | Processed {processed}/{total} · Click to pause | 运行中分类卡进度与操作说明 |
| `search.section.aiPaused.title` | AI 已暂停 |  | AI Paused | 用户主动暂停状态 |
| `search.section.aiPaused.description` | 点击继续进行匹配 |  | Click to continue matching | 暂停状态分类卡整卡操作说明 |
| `search.section.aiPaused.progressDescription` | 已处理 {processed} / {total}，点击继续 |  | Processed {processed}/{total} · Click to continue | 暂停状态分类卡进度与操作说明 |
| `search.emptyResult`           | 没有匹配的真实图片                                      | 没有匹配的文件                                |     | 空结果                |
| `search.emptyUnrecognized`     | 没有未识别图片                                        | 没有未识别文件                                |     | 空结果                |
| `search.failed`                | 搜索失败。                                          |                                        |     | 搜索失败兜底             |
| `search.fileMissing`           | 文件已不存在                                         |                                        |     | 预览 / 操作反馈          |

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
| `window.fix`                 | 固定窗口              | 固定窗口    | Pin Window | 主窗口控制栏          |
| `window.unfix`               | 取消固定窗口            | 取消固定窗口  | Unpin Window | 主窗口控制栏          |
| `window.openSettings`         | 打开设置              |         |     | 控制栏             |
| `window.returnSearch`         | 返回搜索页             |         |     | Settings 控制栏    |
| `preview.close`               | 关闭预览              |         |     | 预览按钮            |
| `preview.restoreWindow`       | 还原预览窗口            |         |     | 预览控制栏           |
| `preview.maximizeWindow`      | 最大化预览窗口           |         |     | 预览控制栏           |
| `preview.pin`                 | 固定窗口              | 固定窗口      | Pin Window | 预览控制栏           |
| `preview.unpin`               | 取消固定窗口            | 取消固定窗口    | Unpin Window | 预览控制栏           |
| `preview.loading`             | 正在加载预览…           |         |     | 等待状态            |
| `preview.sidebar.expand` / `preview.sidebar.collapse` | 展开文件信息 / 收起文件信息 | | Expand / Collapse file information | Preview 边栏按钮 aria-label |
| `preview.metadata.heading`    | 嵌入信息                |         | Embedded Information | 预览元数据标题与折叠入口 |
| `preview.metadata.visualContent` | 画面内容             |         | Visual Content | 图片、视频生成内容 |
| `preview.metadata.title`      | 标题                    |         | Title | 文档嵌入标题 |
| `preview.metadata.subject`    | 主题                    |         | Subject | 文档嵌入主题 |
| `preview.metadata.description` | 描述                  |         | Description | 嵌入描述 |
| `preview.metadata.keywords`   | 关键词                  |         | Keywords | 嵌入关键词 |
| `preview.metadata.software`   | 创作软件                |         | Creator App | 规范化软件家族 |
| `preview.metadata.device`     | 拍摄设备                |         | Capture Device | 相机或设备 |
| `preview.metadata.mediaTitle` | 媒体标题                |         | Media Title | 音频媒体标题 |
| `preview.metadata.artist`     | 艺术家                  |         | Artist | 音频艺术家 |
| `preview.metadata.album`      | 专辑                    |         | Album | 音频专辑 |
| `preview.metadata.fontFamily` | 字体家族                |         | Font Family | 字体内部家族名 |
| `preview.metadata.fontStyle`  | 字体样式                |         | Font Style | 字体内部样式名 |
| `preview.metadata.capturedAt` | 拍摄时间                |         | Captured At | 原始拍摄时间 |
| `preview.action`              | 预览                |         |     | 图片右键菜单          |
| `context.open`                | 打开                |         |     | 图片右键菜单          |
| `context.showInFolder`        | 打开路径              |         |     | 图片右键菜单          |
| `context.view`                | 查看                  |         |     | 右键菜单父级          |
| `context.actions`             | 操作                  |         |     | 右键菜单父级          |
| `context.copyPath`            | 复制路径              |         |     | 单选右键菜单          |
| `context.copySelectedPaths`   | 复制选中的 {count} 条路径 |      |     | 多选右键菜单          |
| `clipboard.itemsCopied`       | 已复制 {count} 个项目    |      |     | 文件剪贴板反馈        |
| `clipboard.copyFailed`        | 复制文件失败              |      |     | 文件剪贴板反馈        |
| `context.editKeywords`        | 编辑关键词             |         |     | 图片右键菜单          |
| `context.deleteFile`          | 删除文件              |         |     | 图片右键菜单          |
| `context.deleteSelectedFiles` | 删除选中的 {count} 个文件 |         |     | 多选右键菜单          |

## 5. Settings：目录、AI 与缓存

| 文案 ID | 当前中文 | 英文 | 使用位置 / 备注 |
| --- | --- | --- | --- |
| `settings.directoryConfig` | 配置目录 | Configure Folders | 目录区标题 |
| `settings.directoryLoading` | 正在读取目录… | Loading folders… | 目录服务状态 |
| `settings.directoryEmpty` | 尚未添加目录 | No folders added | 目录服务状态 |
| `settings.directorySummary` | {directoryCount} 目录　{fileCount} 文件 | {directoryCount} folders　{fileCount} files | 动态目录数与共用文件总数 |
| `settings.addDirectoryActionHint` | 点击添加目录 | Click to add a folder | 添加按钮 title |
| `settings.expandDirectoriesHint` | 管理已添加目录 | Manage added folders | 展开目录列表 |
| `settings.collapseDirectoriesHint` | 点击收起列表 | Collapse the folder list | 收起目录列表 |
| `settings.index` | AI 深度匹配 | AI Deep Match | 全局 AI 能力开关标题 |
| `settings.enableAiRecognitionHint` | 开启按需 AI 深度匹配 | Enable on-demand AI deep matching | 关闭状态按钮 title |
| `settings.disableAiRecognitionHint` | 关闭 AI 深度匹配并结束当前任务 | Disable AI deep matching and stop the current task | 开启状态按钮 title |
| `common.enable` / `common.close` | 开启 / 关闭 | Enable / Disable | 全局 AI 能力开关 |
| `settings.renameDirectoryHint` | 双击重命名 | Double-click to rename | 目录名 title |
| `settings.directoryFileCountHint` | 受支持文件数 | Supported file count | 目录文件数量 |
| `settings.deleteDirectoryActionHint` | 点击移除此目录 | Remove this folder | 删除按钮 title |
| `settings.clearCache` | 清理缓存 | Clear Cache | 缓存区标题 / title |
| `settings.cacheManagement` | 缓存管理 | Cache Management | 缓存设置项标题 |
| `settings.readingCache` | 读取中 | Reading | 缓存统计 |
| `settings.cacheStats` | {count} 个 / {size} | {count} / {size} | 缓存统计 |
| `settings.cacheOptimizationReady` | {count}个 / {size} 自动优化已开启。 | | 自动缓存状态 |
| `settings.cacheOptimizationRunning` | {count}个 / {size} 正在自动优化缓存，如遇电脑卡顿可手动关闭。 | | 自动缓存状态 |
| `settings.cacheOptimizationCompleted` | {count}个 / {size} 自动优化已完成。 | | 自动缓存状态 |
| `settings.cacheOptimizationDisabled` | {count}个 / {size} 自动优化已关闭，开启可提升浏览体验。 | | 自动缓存状态 |
| `settings.cacheOptimizationOn` / `settings.cacheOptimizationOff` | 自动优化 / 无优化 | | 自动缓存按钮 |
| `settings.clearingCache` / `settings.clearAllCache` / `settings.cacheCleared` | 清理中 / 清理全部 / 清理完成 | | 缓存操作 |

## 6. Settings：偏好、外观与快捷动作

| 文案 ID                              | 当前中文                          | 确认中文                      | 英文  | 使用位置 / 备注       |
| ---------------------------------- | ----------------------------- | ------------------------- | --- | --------------- |
| `settings.language`                | 语言 / Language                 |                           | Language / 语言 | Settings 双语语言入口 |
| `settings.languageSystem`          | 跟随系统 / System                 |                           | 跟随系统 / System | Settings 系统语言值 |
| `appearance.themeModeLabel`        | 主题模式                          |                           | Theme Mode | 主题模式选择 |
| `appearance.configureLabel`        | 主题颜色                          |                           | Theme Colors | 颜色1 / 颜色2 配置 |
| `settings.editColorHint`           | 单击修改                          |                           |     | 颜色按钮 title      |
| `appearance.themeColor`            | 颜色1                           |                           | Color 1 | 外观颜色 |
| `appearance.accentColor`           | 颜色2                           |                           | Color 2 | 外观颜色 |
| `settings.standbyLine`             | line                            |                           | line | line 显示开关 |
| `settings.visible`                 | 显示                            |                           |     | 待机线状态           |
| `settings.hidden`                  | 不显示                           |                           |     | 待机线状态           |
| `settings.edgeCollapse`            | 边缘自动收起                       |                           | Edge Auto-hide | 主窗口与预览窗口的屏幕外缘自动收起 |
| `settings.enabled`                 | 打开                            |                           |     | 开关状态            |
| `settings.disabled`                | 关闭                            |                           |     | 开关状态            |
| `settings.launchAtLogin`           | 登录时启动                         |                           | Launch at Sign-in | Windows 登录启动 |
| `settings.launchAtLoginOn`         | 启动                            |                           | On | 登录启动状态 |
| `settings.launchAtLoginOff`        | 关闭                            |                           | Off | 登录启动状态 |
| `settings.systemNotifications`     | 系统通知                          |                           | System Notifications | 后台运行与缓存完成通知 |
| `settings.skimDisplay`             | 自定义范围                        |                           | Custom Scope | 格式范围配置 |
| `settings.skimDisplaySummary`      | 已选 {selected} / {total} 种格式，在查看范围中选择“自定义”后应用。 | | {selected} / {total} formats selected. Choose “Custom” under View Scope to apply. | 自定义范围摘要 |
| `settings.skimCache`               | Skim 缓存                       |                           | Skim Cache | Skim 独立缓存 |
| `settings.embeddedMetadata`        | 嵌入信息                         |                           | Embedded Information | 嵌入信息补齐 |
| `format.category.visual`           | 图像                            |                           |     | 自定义查看分类        |
| `format.category.video`            | 视频                            |                           |     | 自定义查看分类        |
| `format.category.audio`            | 音频                            |                           |     | 自定义查看分类        |
| `format.category.text`             | 文本                            |                           |     | 自定义查看分类        |
| `format.category.document`         | 文档                            |                           |     | 自定义查看分类        |
| `format.category.project`          | 项目                            |                           |     | 自定义查看分类        |
| `format.category.threeD`           | 三维                            |                           |     | 自定义查看分类        |
| `format.category.archive`          | 压缩包                           |                           |     | 自定义查看分类        |
| `format.category.data`             | 数据                            |                           |     | 自定义查看分类        |
| `format.category.font`             | 字体                            |                           |     | 自定义查看分类        |
| `format.category.model`            | 模型                            |                           |     | 自定义查看分类        |
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
| `shortcut.focusMainSearch` | 显示主窗口并聚焦搜索 | | Show main window and focus search | 快捷动作名称 |
| `shortcut.hideToLine` | 关闭主窗口并保持后台运行 | | Close main window and keep running in the background | 快捷动作名称 |
| `shortcut.toggleSkim` | 展开 / 收起 skim | | Expand / collapse skim | 快捷动作名称 |
| `shortcut.restoreDefaultWindow` | 默认大小和位置打开主窗口 | | Open main window at default size and position | 快捷动作名称 |
| `shortcut.openSettings` | 打开设置 | | Open Settings | 快捷动作名称 |
| `shortcut.cycleDirectory` | 目录切换 | | Cycle folders | 窗口内快捷动作 |

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
| `settings.selectRuntime`          | llama.cpp 版本  |      | llama.cpp Version | select aria-label / title |
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
| `settings.versionUpdate`          | 版本与更新           |      | Version and Updates | 当前版本与用户主动更新入口 |
| `settings.updateCurrentVersion`   | 当前版本 {version}   |      | Current version {version} | 初始更新状态 |
| `settings.checkForUpdates`        | 检查更新             |      | Check for Updates | 更新按钮 |
| `settings.updateChecking`         | 正在检查最新版本        |      | Checking for the latest version | 更新状态 |
| `settings.updateUpToDate`         | 已是最新版本 {version} |      | Latest: {version} | 更新状态 |
| `settings.updateAvailable`        | 发现新版本 {version}   |      | New: {version} | 更新状态 |
| `settings.downloadUpdateNow`      | 立即下载             |      | Download Now | 更新按钮 |
| `settings.updateDownloading`      | 正在下载 {percent}% · {received} / {total} |      | Downloading {percent}% · {received} / {total} | 下载进度 |
| `settings.pauseUpdate`            | 暂停                 |      | Pause | 下载按钮 |
| `settings.updatePausing`          | 暂停中               |      | Pausing | 下载按钮状态 |
| `settings.updatePaused`           | 已暂停 {version} 下载，可稍后继续 |      | {version} download paused. You can resume later | 更新状态 |
| `settings.resumeUpdate`           | 继续下载             |      | Resume | 下载按钮 |
| `settings.updateVerifying`        | 下载完成，正在验证安装器 |      | Download complete. Verifying installer. | 更新状态 |
| `settings.updateVerifyingButton`  | 验证中               |      | Verifying | 更新按钮状态 |
| `settings.updateReady`            | {version} 已下载，可以安装 |      | {version} is ready to install | 更新状态 |
| `settings.installUpdateNow`       | 立即安装             |      | Install Now | 更新按钮 |
| `settings.discardUpdate`          | 放弃更新             |      | Discard Update | 清理按钮 |
| `settings.updateDiscarding`       | 正在清理下载         |      | Removing download | 清理状态 |
| `settings.confirmDiscardUpdate`   | 删除已经下载的更新文件？ |      | Delete the downloaded update files? | 确认弹层 |
| `settings.confirmInstallUpdate`   | Cap7CE 将启动安装程序并安全退出。是否继续？ |      | Cap7CE will start the installer and exit safely. Continue? | 确认弹层 |
| `settings.updateInstalling`       | 正在启动安装程序并退出 Cap7CE |      | Starting the installer and exiting Cap7CE | 更新状态 |
| `settings.updateInstallingButton` | 正在启动             |      | Starting | 更新按钮状态 |
| `settings.updateInstallerOpenFailed` | 无法启动安装程序，Cap7CE 将继续运行 |      | The installer could not be started. Cap7CE will remain open | 更新失败 |
| `settings.updateUnsupported`      | 开发模式不能启动安装程序，请使用安装版测试 |      | The installer cannot be started in development mode. Test with an installed build. | 开发版边界 |
| `settings.downloadUpdateAgain`    | 再次下载             |      | Download Again | 重试按钮 |
| `settings.updateDownloadFailed`   | 更新失败，详情已记录 |      | Update failed. Details recorded | 更新失败 |
| `settings.updateRateLimited`      | 下载请求受限，请稍后再试 |      | Download limited. Try again later | 更新失败 |
| `settings.updateNetworkFailed`    | 下载已中断，请检查网络 |      | Download interrupted. Check your network | 可续传失败 |
| `settings.updateDiskSpaceFailed`  | 磁盘空间不足         |      | Not enough disk space | 更新失败 |
| `settings.updateSecurityFailed`   | 更新失败，请检查安全软件 |      | Update failed. Check security software | 更新失败 |
| `settings.updateIncomplete`       | 下载尚未完成，可以继续下载 |      | The download is incomplete and can be resumed | 可续传失败 |
| `settings.updateInvalid`          | 下载文件无效，已自动清理 |      | Invalid download removed | 更新失败 |
| `settings.updateCheckFailed`      | 检查失败，请重试       |      | Check failed. Try again. | 更新失败 |

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
| `commands.group.settings`          | 设置                                | 设置                               |      | 分类标题             |
| `commands.group.view`              | 查看类                               | 查看                               |      | 分类标题             |
| `commands.group.window`            | 窗口模式类                             | 窗口模式                             |      | 分类标题             |
| `commands.group.directory`         | 目录类                               | 目录                               |      | 分类标题             |
| `commands.group.appearance`        | 外观类                               | 外观                               |      | 分类标题             |
| `commands.group.appBehavior`       | 软件行为                              |                                  |      | 分类标题             |
| `commands.group.standby`           | 待机线类                              | line |      | 分类标题             |
| `commands.group.shortcuts`         | 快捷键类                              | 快捷动作                             |      | 分类标题；与快捷动作需核对    |
| `commands.group.commands`          | 快捷指令类                             | 快捷指令                             |      | 分类标题             |
| `commands.group.language`          | 语言类                               | 语言                               |      | 分类标题             |
| `commands.group.runtime`           | llama.cpp 类                       | llama.cpp                        |      | 分类标题             |
| `commands.group.model`             | 视觉模型类                             | 视觉模型                             |      | 分类标题             |
| `commands.group.app`               | 软件操作类                             | 软件操作                             |      | 分类标题             |
| `commands.group.cache`             | 缓存类                               | 缓存                               |      | 分类标题             |
| `commands.group.ai`                | AI                                |                                  |      | 分类标题             |
| `commands.set.open`                | 打开设置页                             | 打开设置                             |      | `set:`           |
| `commands.skim.scopeDefault`       |                                     | 切换为默认查看范围                        |      | `skim:scope default` |
| `commands.skim.scopeAll`           |                                     | 切换为全部查看范围                        |      | `skim:scope all` |
| `commands.skim.scopeCustom`        |                                     | 切换为自定义查看范围                       |      | `skim:scope custom` |
| `commands.skim.sortAsc`            |                                     | 切换为升序排序                          |      | `skim:sort asc`  |
| `commands.skim.sortDesc`           |                                     | 切换为降序排序                          |      | `skim:sort desc` |
| `commands.skim.sortName`           |                                     | 按名称排序                            |      | `skim:sort name` |
| `commands.skim.sortTime`           |                                     | 按修改时间排序                          |      | `skim:sort time` |
| `commands.skim.hiddenEnable`       |                                     | 显示 Windows 隐藏文件                 |      | `skim:hidden on` |
| `commands.skim.hiddenDisable`      |                                     | 隐藏 Windows 隐藏文件                 |      | `skim:hidden off` |
| `commands.view.allDirectories`     |                                     | 选择全部目录                           |      | `see:dir all`    |
| `commands.view.directory`          | 查看指定目录                            | 选择指定目录                           |      | `see:dir`        |
| `commands.view.scopeDefault`       |                                     | 切换为默认查看范围                        |      | `see:scope default` |
| `commands.view.scopeAll`           |                                     | 切换为全部查看范围                        |      | `see:scope all`  |
| `commands.view.scopeCustom`        |                                     | 切换为自定义查看范围                       |      | `see:scope custom` |
| `commands.view.sortAsc`            |                                     | 切换为升序排序                          |      | `see:sort asc`   |
| `commands.view.sortDesc`           |                                     | 切换为降序排序                          |      | `see:sort desc`  |
| `commands.view.sortName`           |                                     | 按名称排序                            |      | `see:sort name`  |
| `commands.view.sortTime`           |                                     | 按修改时间排序                          |      | `see:sort time`  |
| `commands.window.standby`          | 切换到待机线状态                          | 切换为 line 模式                      |      | `win:line`       |
| `commands.window.max`              | 最大化 / 标准大窗口状态                     | 窗口最大化                            |      | `win:max`        |
| `commands.window.reset`            |                                     | 复位主窗口                            |      | `win:reset`      |
| `commands.window.pin`              | 固定窗口                              |                                  | Pin Window | `win:top on`     |
| `commands.window.unpin`            | 取消固定窗口                            |                                  | Unpin Window | `win:top off`    |
| `commands.directory.add`           | 添加目录                              |                                  |      | `dir:add`        |
| `commands.directory.rename`        | 重命名目录显示名                          |                                  |      | `dir:rename`     |
| `commands.directory.refresh`       | 刷新目录统计 / 状态                       |                                  |      | `dir:refresh`    |
| `commands.appearance.light`        | 切换亮色模式                            | 切换明亮模式                            |      | `ui:light`；需统一   |
| `commands.appearance.dark`         | 切换暗色模式                            | 切换黑暗模式                            |      | `ui:dark`；需统一    |
| `commands.appearance.system`       | 跟随系统主题                            |                                  |      | `ui:auto`        |
| `commands.appearance.acrylic`      |                                     | 切换为亚克力材质                         |      | `ui:acrylic`     |
| `commands.appearance.mica`         |                                     | 切换为云母材质                          |      | `ui:mica`        |
| `commands.appearance.fontSize`     |                                     | 将界面字体大小设为 {size}                 |      | `ui:font 12-16`  |
| `commands.appearance.themeColor`   | 设置主题色                             | 设置颜色1                             |      | `ui:main`        |
| `commands.appearance.accentColor`  | 设置副色                              | 设置颜色2                              |      | `ui:accent`      |
| `commands.appearance.reset`        | 恢复默认外观配置                          |                                  |      | `ui:reset`       |
| `commands.app.startupEnable`       | 开启开机运行                            |                                  |      | `app:startup on` |
| `commands.app.startupDisable`      | 关闭开机运行                            |                                  |      | `app:startup off` |
| `commands.app.notificationsEnable` | 开启系统通知                            |                                  |      | `app:notify on`  |
| `commands.app.notificationsDisable`| 关闭系统通知                            |                                  |      | `app:notify off` |
| `commands.edge.enable`             | 开启窗口贴边自动收起                        |                                  |      | `edge:on`        |
| `commands.edge.disable`            | 关闭窗口贴边自动收起                        |                                  |      | `edge:off`       |
| `commands.standby.show`            | 显示待机线                             | 显示 line                          |      | `line:on`        |
| `commands.standby.hide`            | 隐藏待机线                             | 隐藏 line                          |      | `line:off`       |
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
| `commands.cache.autoEnable`        | 开启自动缓存优化                          |                                  |      | `cache:auto on`  |
| `commands.cache.autoDisable`       | 关闭自动缓存优化                          |                                  |      | `cache:auto off` |
| `commands.ai.enable`               |                                     | 启用 AI 增强能力                       |      | `ai:on`          |
| `commands.ai.disable`              |                                     | 禁用 AI 增强能力                       |      | `ai:off`         |
| `commands.ai.searchEnable`         |                                     | 开启当前搜索的 AI 增强                    |      | `ai:search on`   |
| `commands.ai.searchDisable`        |                                     | 关闭当前搜索的 AI 增强                    |      | `ai:search off`  |
| `commands.confirm.deleteDirectory` | 删除目录、索引和相关缓存，需二次确认                | 删除目录、索引和相关缓存                     |      | `dir:delete`     |
| `commands.confirm.quit`            | 真正退出 Cap7CE，需二次确认                 | 关闭 Cap7CE 运行进程                   |      | `app:quit`       |
| `commands.confirm.stopRuntime`     | 停止 llama.cpp / llama-server，需二次确认 | 停止 llama.cpp / llama-server      |      | `llama:stop`     |
| `commands.confirm.clearCache`      | 清理缩略图 / 预览 / 模型输入缓存，需二次确认         | 清理缩略图 / 预览 / 模型输入缓存              |      | `cache:clear`    |
| `commands.confirm.clearThumbnailCache` | 清理普通搜索与 Shell 缩略图缓存，需二次确认      |                                  |      | `cache:thumb`    |
| `commands.confirm.clearSkimCache`  | 清理 skim 缩略图 / 预览 / 元数据缓存，需二次确认   |                                  |      | `cache:skim`     |

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
| `command.directoryNotFound`           | 未找到目录                   |      |      | 目录操作            |
| `command.directoryNameEmpty`          | 目录名称不能为空                |      |      | 重命名             |
| `command.allDirectoriesSelected`      |                          | 已选择全部目录 |      | `see:dir all`   |
| `command.windowChanged`               | 已切换 {mode}              |      |      | 窗口模式            |
| `command.windowMaximized`             | 已最大化窗口                  |      |      | 窗口模式            |
| `command.windowReset`                 |                          | 已复位主窗口 |      | 窗口模式            |
| `command.windowPinEnabled`            | 已固定窗口                 |      | Window pinned | 固定窗口            |
| `command.windowPinDisabled`           | 已取消固定窗口                 |      | Window unpinned | 固定窗口            |
| `command.directorySelected`           | 已选择目录：{name}            |      |      | 目录切换            |
| `command.scopeChanged`                |                          | 查看范围已切换为：{scope} |      | 查看范围            |
| `command.skimScopeChanged`            |                          | Skim 查看范围已切换为：{scope} |      | Skim 查看范围       |
| `command.skimSortAsc`                 |                          | Skim 已切换为升序排序 |      | Skim 排序          |
| `command.skimSortDesc`                |                          | Skim 已切换为降序排序 |      | Skim 排序          |
| `command.skimSortByName`              |                          | Skim 已切换为按名称排序 |      | Skim 排序          |
| `command.skimSortByTime`              |                          | Skim 已切换为按修改时间排序 |      | Skim 排序          |
| `command.skimHiddenShown`             |                          | Skim 已显示 Windows 隐藏文件 |      | Skim              |
| `command.skimHiddenHidden`            |                          | Skim 已隐藏 Windows 隐藏文件 |      | Skim              |
| `command.sortAsc`                     | 已切换递增排序                 | 已切换升序排序 |      | 排序              |
| `command.sortDesc`                    | 已切换递减排序                 | 已切换降序排序 |      | 排序              |
| `command.sortByName`                  | 已切换为按名称排序               |      |      | 排序              |
| `command.sortByTime`                  | 已切换为按修改时间排序             |      |      | 排序              |
| `command.confirmDeleteDirectory`      | 确认删除目录“{name}”？输入 y / n |      |      | 二次确认            |
| `command.directoryDeleted`            | 已删除目录：{name}            |      |      | 目录              |
| `command.directoryDeleteFailed`       | 删除目录失败                  |      |      | 目录              |
| `command.directoryRenamed`            | 已重命名目录：{name}           |      |      | 目录              |
| `command.directoryStatusRefreshed`    | 已刷新目录状态                 |      |      | 目录              |
| `command.directoryAdded`              | 已添加目录                   |      |      | 目录              |
| `command.directoryAddNeedsConfirmation` | 请确认是否替换已添加的子目录       |      |      | 目录冲突确认          |
| `command.settingsOpened`              | 已打开设置页                  | 已打开设置 |      | Settings        |
| `command.themeChanged`                | 已切换{theme}              |      |      | 主题切换            |
| `command.materialAcrylic`             |                          | 已切换为亚克力材质 |      | 窗口材质            |
| `command.materialMica`                |                          | 已切换为云母材质 |      | 窗口材质            |
| `command.uiFontSizeChanged`           |                          | 界面字体大小已设为 {size} |      | 字体大小            |
| `command.invalidColor`                | 颜色值无效                   |      |      | 外观              |
| `command.themeColorSet`               | 已设置主题色                  | 已设置颜色1 |      | 外观              |
| `command.accentColorSet`              | 已设置副色                   | 已设置颜色2 |      | 外观              |
| `command.appearanceReset`             | 已恢复默认外观配置               |      |      | 外观              |
| `command.standbyShown`                | 已显示待机线                  | 已显示 line |      | line             |
| `command.standbyHidden`               | 已隐藏待机线                  | 已隐藏 line |      | line             |
| `command.globalShortcutsEnabled`      | 已开启全局快捷键                |      |      | 快捷动作            |
| `command.globalShortcutsDisabled`     | 已关闭全局快捷键                |      |      | 快捷动作            |
| `command.globalShortcutsFailed`       | 全局快捷键注册失败               |      |      | 快捷动作            |
| `command.shortcutsReset`              | 已恢复快捷动作默认配置             |      |      | 快捷动作            |
| `command.defaultShortcutsUnavailable` | 默认快捷键当前不可用              |      |      | 快捷动作            |
| `command.parserEnabled`               | 已启用快捷指令解析               |      |      | 快捷指令            |
| `command.parserDisabled`              | 已禁用快捷指令解析               |      |      | 快捷指令            |
| `command.launchAtLoginEnabled`         | 已开启开机运行                  |      |      | 软件行为            |
| `command.launchAtLoginDisabled`        | 已关闭开机运行                  |      |      | 软件行为            |
| `command.notificationsEnabled`         | 已开启系统通知                  |      |      | 软件行为            |
| `command.notificationsDisabled`        | 已关闭系统通知                  |      |      | 软件行为            |
| `command.edgeCollapseEnabled`          | 已开启窗口贴边自动收起              |      |      | 窗口行为            |
| `command.edgeCollapseDisabled`         | 已关闭窗口贴边自动收起              |      |      | 窗口行为            |
| `command.autoCacheEnabled`             | 已开启自动缓存优化                |      |      | 缓存              |
| `command.autoCacheDisabled`            | 已关闭自动缓存优化                |      |      | 缓存              |
| `command.aiEnabled`                    |                          | 已启用 AI 增强能力 |      | AI               |
| `command.aiDisabled`                   |                          | 已禁用 AI 增强能力 |      | AI               |
| `command.aiSearchEnabled`              |                          | 已开启当前搜索的 AI 增强 |      | AI               |
| `command.aiSearchDisabled`             |                          | 已关闭当前搜索的 AI 增强 |      | AI               |
| `command.runtimeListRefreshed`        | 已刷新 llama.cpp 版本列表      |      |      | llama.cpp       |
| `command.runtimeStarted`              | 已启动 llama.cpp           |      |      | llama.cpp       |
| `command.runtimeSelected`             | 已切换 llama.cpp 版本：{name} |      |      | llama.cpp       |
| `command.confirmStopRuntime`          | 确认停止 llama.cpp？输入 y / n |      |      | 二次确认            |
| `command.runtimeStopped`              | 已停止 llama.cpp           |      |      | llama.cpp       |
| `command.runtimeStopFailed`           | 停止 llama.cpp 失败         |      |      | llama.cpp       |
| `command.modelListRefreshed`          | 已刷新视觉模型列表               |      |      | 视觉模型            |
| `command.modelSelected`               | 已切换视觉模型：{name}          |      |      | 视觉模型            |
| `command.confirmClearCache`           | 确认清理缓存？输入 y / n         |      |      | 二次确认            |
| `command.confirmClearThumbnailCache`  | 确认清理缩略图缓存？输入 y / n     |      |      | 二次确认            |
| `command.cacheCleared`                | 已清理缓存                   |      |      | 缓存              |
| `command.thumbnailCacheCleared`       | 已清理缩略图缓存                |      |      | 缓存              |
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
| `error.supplementUnavailable`         | 补识别服务暂时不可用。                         |                 |     | 补识别         |
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
| `error.stopAiSearchFirst`             | 请先停止当前 AI 深度匹配                     | Stop the current AI deep match first |     | 模型 / 运行时切换  |
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

## 13. 系统托盘与系统通知

| 文案 ID                  | 当前中文      | 确认中文    | 英文  | 使用位置 / 备注 |
| ---------------------- | --------- | ------- | --- | --------- |
| `tray.hideStandbyLine` | 隐藏待机线     | 隐藏 line |     | 托盘菜单      |
| `tray.showStandbyLine` | 显示待机线     | 显示 line |     | 托盘菜单      |
| `tray.disableEdgeCollapse` | 关闭边缘收起 | | Disable Edge Collapse | 托盘菜单 |
| `tray.enableEdgeCollapse` | 打开边缘收起 | | Enable Edge Collapse | 托盘菜单 |
| `tray.openSettings`    | 打开设置页     | 打开设置    |     | 托盘菜单      |
| `tray.quit`            | 退出 Cap7CE |         |     | 托盘菜单      |
| `notification.backgroundRunTitle` | Cap7CE 已在后台运行 | | Cap7CE is running in the background | 首次后台提示 |
| `notification.duplicateLaunchContent` | 无需重复启动，可使用快捷键唤醒或从系统托盘打开。 | | No need to start it again. Use a shortcut to activate Cap7CE, or open it from the system tray. | 重复启动提示 |

---

## 初步发现的术语冲突（供核对）

以下仅是扫描结果，不代表已决定修改：

1. 主题状态同时存在“浅色 / 深色”“明亮 / 黑暗”“亮色模式 / 暗色模式”。
2. 旧窗口模式切换与 Capsule / micro / mini 已退役；当前只保留主窗口显示、隐藏至 line、Skim 切换和默认几何恢复。
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
- 窗口相关文字只使用“主窗口”“line”“展开 / 收起 skim”“默认大小和位置”，不再暴露旧 capsule / micro / mini / normal 形态名。
- 待机线统一使用：line
- 颜色角色统一使用：颜色1 / 颜色2
- 排序方向统一使用：升序 / 降序
- “识别 / 索引”使用边界：AI 内容分析使用“识别”，数据库记录及维护使用“索引”
- 标点和空格规则：中文标点；省略号统一用“…”；中英文之间留一个空格；短按钮不加句号，完整提示可加句号
- 英文风格（美式 / 英式）：美式
