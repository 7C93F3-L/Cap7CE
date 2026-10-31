# 原生语言资源

文案引用由 `scripts/winui-language-usage.cjs` 收集：静态键来自原生 C#/XAML 和帮助清单，动态键来自实际筛选资源、设置分组、快捷键及任务/诊断状态。构建拒绝缺失或无引用的文案；仅被测试或旧设置资源引用不能作为保留依据。新增动态键规则时同步更新收集器。

`messages.json` 是 Cap7CE 自有界面文案的唯一来源。每个稳定语义键下并排维护 `zh-CN` 和 `en-US`，修改中文时可直接对照修改英文；不要用中文句子作键，不要改协议、枚举、用户输入或路径来翻译界面。语言名称保留各自原名。

动态内容使用命名参数，例如 `{count:N0}`。各语言必须拥有相同参数和格式，可调整顺序；路径、文件名、元数据等参数始终保留原文。不要先拼接中文语序再翻译。新增语言需更新 `LanguageCatalog.Languages/Resolve`、`LanguagePreferenceOptions.Choices`、偏好验证和构建检查，并为每个现有键补齐同一语言的值；AI生成语言目前仅支持中文和英文，也须明确扩展对应请求与提示词。

| 范围 | 文案来源与行为 |
| --- | --- |
| 主窗口、侧栏、地址栏、筛选、菜单、详情及空状态 | 明确资源键；切换更新现有控件，不导航、提交筛选或清空草稿 |
| 设置各类别、确认框、通知、颜色与命令说明 | 资源绑定；只更新展示，不执行所展示的命令或维护动作 |
| 图片/PDF/正文/字体/音频/视频/压缩包/通用文件预览 | 资源化工具、标签、状态和错误；切换不重开源文件、媒体或Provider会话 |
| 后台任务与错误 | UiMessage保留资源键和不可变状态，显示时格式化；不重启通知消失计时，不隐式重试任务 |
| 无障碍和模板提示 | LanguageUi.Label/Bind及LanguageText.NameKey/ToolTipKey，复用时清理旧绑定 |
| 系统位置与用户内容 | Windows Shell显示名、原生平台界面、源正文、字体字形样本、文件名/路径、用户收藏名/关键词及元数据保持原文 |

`LanguageCatalog` 读取并验证资源与参数，`LanguageSession` 持有当前解析语言并通知变化。`PreferenceStore` 成功保存后更新 `AppLanguage` 唯一会话，默认中文，可选择 English 或跟随系统。保存失败不会先应用新语言；纯语言更新不走主窗口的布局和窗口动作。生产偏好路径保持原样，测试使用内部构造参数指定临时文件。

`LanguageBinding.Attach` 将资源键绑定到控件依赖属性，通过 Loaded/Unloaded 管理订阅，替换时解除旧绑定。Unloaded可能在窗口内容重新挂接后的Loaded之后迟到；仍加载的控件需在UI调度后核对IsLoaded，仅实际脱离树时取消订阅，避免主窗口保留旧语言。参数函数只读取当前展示数据；需要业务刷新时仍由宿主沿既有链路更新。`LanguageUi.Literal` 在显示原文前清理同一属性的绑定，不能直接赋值后留下旧订阅。`LanguageUi.Computed/Message` 只格式化已有快照，不得查询服务、写偏好或改变任务/编辑状态。

`LanguageText.Key` 支持 TextBlock 和 ContentControl；`Literal` 提供原文，不能从原文猜测键。`NameKey`、`ToolTipKey` 分别用于无障碍名称和提示。复合按钮应绑定内部标签，不能把含图标的整个 Content 绑定为字符串。`LanguageUi.Dialog` 绑定原生确认框标题/按钮和可选正文，自定义正文传空 contentKey 后设置 Content；它不会重建对话框或提交动作。

NavigationView会按平台资源重设内部按钮提示；设置窗口在加载、显示模式和开合状态变化后，由SettingsNavigationAppearance重新绑定navigation.open/close。模板按钮的悬停提示与无障碍名称均跟随应用语言，不能只依靠根Language属性或只在首次加载时赋值。

`FactTextKeys` 按生成预设的稳定身份组织资源，图标选择也按身份。新增/删除预设时，构建及专项检查核对动态键与图标；无需为了修改文案同步修改旧生成Label。`MaintenanceText`、`ProgressText` 和 `FailureText` 只格式化状态/机器码，模型中已停用的中文显示访问器已经移除，修改资源不需再维护旧中文副本。

通知回调携带 `UiMessage`。Key复制命名参数字典，需随语言变化的嵌套内容显式传入另一个UiMessage；Snapshot只捕获不可变状态；普通字符串作为Literal，不猜测资源键。自有IO/目录/参数错误分别使用UiFailure、UiDirectoryFailure、UiArgumentFailure，显示处调用FailureText.From并交给LanguageUi.Message。未知系统错误保留原文或既有机器码，AI未知错误使用统一提示，不以是否含中文推断语言。系统通知按发送时语言生成，不重发已送达消息。

系统位置从 `SystemLocations` 的启动快照取得。Computer和六个Known Folder的显示名/实际路径按Windows读取，下载不拼接默认路径，名称只按完整路径匹配。应用英文与中文Windows组合时，这些位置仍可能显示中文；运行期间系统更名/重新定位，下次启动读取。Computer读取失败才用main.home资源，无法解析的Known Folder不猜测路径。磁盘也优先保留Shell显示名，读取失败时使用原始卷标/盘符或明确资源回退。不要重新引入main.homeDesktop等目录翻译键。

AI在任务开始、异步收集之前取得语言快照；整批任务的模型上下文和生成请求使用同一语言。界面切换只影响新批次，已保存关键词不翻译。四参数旧请求保持中文，第五参数显式选择生成语言。英语集成检查使用HTTP模型替身验证提示词与标签解析，不代表实际模型推理质量。

`source-audit.json` 记录保留的内部身份、预设原始数据和字体字形样本及数量；它不是第二套语言包。构建拒绝未登记的中文源码、直接UI字串和过期例外。新增界面文案应进入messages.json，不得通过扩大例外绕过资源。English资源只允许语言入口名称和既有双语签名中出现中文。

验证命令：

- `npm run build`：完整原生构建，包含资源、源码审计及模块边界检查。
- `dotnet run --project shell/Cap7CE.Layout.Tests/Cap7CE.Layout.Tests.csproj -c Release`：完整布局/状态/语言/偏好回归。
- 同一测试入口加 `--language-tests`：语言专项与真实偏好文件隔离验证。
- 同一入口加 `--system-location-tests`：Windows Shell七个位置及系统盘只读交叉比对。
- `npm run test:core-local-keywords`：隔离运行库、双语请求/英文解析、并发和取消边界。

原生界面人工验收需覆盖：已打开的主窗口/设置/预览和弹层切换、往返语言与重启保存、正在编辑的草稿/筛选/选择不丢失、既有任务继续而新AI批次采用新语言。绑定替身与构建通过不等同于视觉或安装包验收。
