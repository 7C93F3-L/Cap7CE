# 原生语言资源

`messages.json` 是 WinUI 独立维护的语言资源，每个稳定语义键包含 `zh-CN` 和 `en-US`，修改文案时在同一条目下对照修改。不要用中文句子作为键，不要修改内部协议、枚举值或用户输入来实现翻译。语言名保留各自原名。

动态文本使用命名参数，例如 `{count:N0}`。两种语言必须使用相同参数及格式，可改变顺序，不要拼接语序相关的句子。新增语言时同时更新 `LanguageCatalog.Languages`、解析规则和构建检查。

`LanguageCatalog` 只读取资源、验证键与参数及执行格式化；`LanguageSession` 持有当前界面语言并发送变化通知；`LanguageBinding.Attach` 将明确的资源键绑定到控件依赖属性。通过 Loaded/Unloaded 管理通知订阅，替换绑定时移除旧绑定，不重建页面或改变导航。参数提供函数在更新时读取当前值；业务数据变化仍由宿主触发自身更新。

已接入设置导航、卡片、主要选项、快捷动作、指令帮助与颜色编辑器；语言选择器仍未开放。LanguageUi只接受资源键，普通Ui继续显示用户数据。settings-help.json只持有指令结构和资源键，描述和可翻译示例在messages.json维护。指令文本是只读帮助，语言更新不会执行指令或改变分类选择。

主窗口工具栏、侧栏、地址栏、菜单、首页系统入口与分组、空结果和大小滑块已接入。使用LanguageUi.Label同步设置提示与无障碍名称；同一属性从资源切换为用户数据时必须调用LanguageUi.Literal解除旧绑定。数据模板使用LanguageText.Key显式绑定资源键、LanguageText.Literal绑定原文；二者独立，不能以原文猜测资源键。首页系统名称按入口身份映射，用户文件和目录始终使用原名。

详细信息、关键词编辑器、内嵌元数据标签及基础筛选已接入。DetailsCard.Field的label参数是资源键，value始终为原文；FieldResource用于可翻译展示值。LanguageText.Key支持TextBlock文字和ContentControl内容，NameKey单独绑定无障碍名称；含图标等复合内容的按钮应绑定内部文字，不能将整个Content绑定为字符串。新增界面资源使用ui.*前缀，避免与keywords.read等协议名称混淆。构建检查核对C#/XAML静态键、时间/种类动态键和尺寸预设数量。

高级筛选使用FactTextKeys从生成的分组/选项身份构造资源键。新增或删除预设时，构建检查和Layout专项会核对动态键；修改中文文案只需改messages.json，无须修改生成的旧Label或事实约束。图标使用独立身份，不能依赖翻译后的文字。将原本绑定Content字符串的选项改为复合布局时，先调用LanguageBinding.Clear解除旧Content绑定，再绑定内部标签。

LanguageUi.Dialog在原生ContentDialog中绑定标题、主按钮、关闭按钮，以及可选的正文资源；正文是自定义控件时传空contentKey，随后设置Content。语言更新不负责重建对话框、提交草稿或开始维护动作。

需要原生测量、省略等自定义显示过程时，LanguageBinding.Attach可提供apply回调；回调只更新显示，不修改原始记录。绑定拥有者的加载/卸载、替换和排队更新由Layout替身测试验证；原生菜单、模板回收和视觉效果仍需手动回归。

PreferenceStore保存Language并在成功后更新AppLanguage唯一会话；默认中文，支持跟随系统。AI在任务开始、异步收集前取得语言快照，整批任务继续使用该快照；Node生成请求显式携带语言，四参数旧请求保持中文。当前未完成主窗口、索引/元数据、模型动态状态和后台提示的全覆盖，不能视为完整双语支持。文件名、路径、用户关键词和源文件元数据不能被资源替换。

验证：`node scripts/winui-language-check.cjs` 和 `dotnet run --project shell/Cap7CE.Layout.Tests/Cap7CE.Layout.Tests.csproj -c Release -- --language-tests`；完整构建运行资源检查。
