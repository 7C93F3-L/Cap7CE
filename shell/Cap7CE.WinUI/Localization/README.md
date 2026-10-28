# 原生语言资源

`messages.json` 是 WinUI 独立维护的语言资源，每个稳定语义键包含 `zh-CN` 和 `en-US`，修改文案时在同一条目下对照修改。不要用中文句子作为键，不要修改内部协议、枚举值或用户输入来实现翻译。语言名保留各自原名。

动态文本使用命名参数，例如 `{count:N0}`。两种语言必须使用相同参数及格式，可改变顺序，不要拼接语序相关的句子。新增语言时同时更新 `LanguageCatalog.Languages`、解析规则和构建检查。

`LanguageCatalog` 只读取资源、验证键与参数及执行格式化；`LanguageSession` 持有当前界面语言并发送变化通知；`LanguageBinding.Attach` 将明确的资源键绑定到控件依赖属性。通过 Loaded/Unloaded 管理通知订阅，替换绑定时移除旧绑定，不重建页面或改变导航。参数提供函数在更新时读取当前值；业务数据变化仍由宿主触发自身更新。

已接入设置导航、卡片、主要选项、快捷动作、指令帮助与颜色编辑器；语言选择器仍未开放。LanguageUi只接受资源键，普通Ui继续显示用户数据。settings-help.json只持有指令结构和资源键，描述和可翻译示例在messages.json维护。指令文本是只读帮助，语言更新不会执行指令或改变分类选择。

主窗口工具栏、侧栏、地址栏、菜单、首页分组、空结果和大小滑块已接入。使用LanguageUi.Label同步设置提示与无障碍名称；同一属性从资源切换为用户数据时必须调用LanguageUi.Literal解除旧绑定。数据模板使用LanguageText.Key显式绑定资源键、LanguageText.Literal绑定原文；二者独立，不能以原文猜测资源键。

系统位置采用Windows真实显示名：SystemLocations在启动时读取Computer和六个Known Folder的名称/实际路径，SystemLocationSnapshot按完整路径提供展示名称；语言切换不重查Shell、不翻译这些名称、不修改路由。桌面等home-*内部身份不随名称改变，下载不拼接默认路径。应用英文配合中文Windows时，系统位置仍可能显示中文；自定义名称、用户收藏名及目录重定向保持系统/用户原值。系统更名或重新定位发生在运行期间时，下次启动读取。LocationText.Computer仅在Shell未返回名称时退回main.home资源；未解析的Known Folder省略，不猜测位置。磁盘显示名也优先取Shell，系统读取失败时才沿用既有回退。不要重新引入main.homeDesktop等系统目录翻译键。

详细信息、关键词编辑器、内嵌元数据标签及基础筛选已接入。DetailsCard.Field的label参数是资源键，value始终为原文；FieldResource用于可翻译展示值。LanguageText.Key支持TextBlock文字和ContentControl内容，NameKey单独绑定无障碍名称；含图标等复合内容的按钮应绑定内部文字，不能将整个Content绑定为字符串。新增界面资源使用ui.*前缀，避免与keywords.read等协议名称混淆。构建检查核对C#/XAML静态键、时间/种类动态键和尺寸预设数量。

高级筛选使用FactTextKeys从生成的分组/选项身份构造资源键。新增或删除预设时，构建检查和Layout专项会核对动态键；修改中文文案只需改messages.json，无须修改生成的旧Label或事实约束。图标使用独立身份，不能依赖翻译后的文字。将原本绑定Content字符串的选项改为复合布局时，先调用LanguageBinding.Clear解除旧Content绑定，再绑定内部标签。

LanguageUi.Dialog在原生ContentDialog中绑定标题、主按钮、关闭按钮，以及可选的正文资源；正文是自定义控件时传空contentKey，随后设置Content。语言更新不负责重建对话框、提交草稿或开始维护动作。

索引、元数据设置和模型运行库状态通过MaintenanceText及LanguageUi.Computed格式化已有状态快照。Computed回调只能读取快照和资源，不得查询服务、写偏好、启动任务或修改编辑状态；变化的原始路径/地址用Literal清除旧占位订阅。错误先按明确机器码选择资源，无法识别的原文保持原样，不能猜测或替换用户文字。旧模型的中文显示访问器仍供系统通知等未迁入的链路及兼容验证使用，尚不代表完整双语支持。

主窗口和设置通知回调携带UiMessage。使用Key保存资源键及命名参数，参数字典会复制；参数中的路径、名称和版本等数据保持原文，需要随语言更新的嵌套内容显式传入UiMessage。Snapshot只捕获不可变状态，委托交给ProgressText等纯格式化方法，不得读取运行中服务；普通字符串隐式转换为Literal，不以文字内容猜测资源键。WorkspaceNotice仅绑定文字，不因语言变化重新调用显示/任务控制入口或重置消失计时。新增通知应保留键，不要预先调用AppLanguage.Text后传入已翻译字符串。

程序自己产生的IO错误使用UiFailure，目录不存在使用UiDirectoryFailure，构造参数是资源键与原文数据；Message保留稳定诊断键，Display保留消息，不在异常内读取当前语言。呈现错误时调用FailureText.From，再交给LanguageUi.Message或通知回调，避免提早取error.Message丢失资源身份。未知异常的原文保持不变；只有明确的机器码进入MaintenanceText映射，任意CoreMessage诊断不会被猜测为资源键。AI未知错误使用统一可翻译提示，不再检查文本是否含中文；实际生成语言仍固定于任务开始。系统通知通过ShellServices.Notify在发送时格式化，已发送通知不会重新发送或改写。分页、错误展示与语言刷新不能隐式重试业务动作。

需要原生测量、省略等自定义显示过程时，LanguageBinding.Attach可提供apply回调；回调只更新显示，不修改原始记录。绑定拥有者的加载/卸载、替换和排队更新由Layout替身测试验证；原生菜单、模板回收和视觉效果仍需手动回归。

PreferenceStore保存Language并在成功后更新AppLanguage唯一会话；默认中文，支持跟随系统。AI在任务开始、异步收集前取得语言快照，整批任务继续使用该快照；Node生成请求显式携带语言，四参数旧请求保持中文。当前预览边角文案及最终遗漏审计仍未完成，语言选择器继续禁用，不能视为完整双语支持。文件名、路径、用户关键词和源文件元数据不能被资源替换。

验证：`node scripts/winui-language-check.cjs` 和 `dotnet run --project shell/Cap7CE.Layout.Tests/Cap7CE.Layout.Tests.csproj -c Release -- --language-tests`；Windows本机Shell交叉比对使用`--system-location-tests`，不修改实际名称或目录。完整构建运行资源检查。
