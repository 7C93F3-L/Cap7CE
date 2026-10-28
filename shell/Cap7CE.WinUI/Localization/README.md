# 原生语言资源

`messages.json` 是 WinUI 独立维护的语言资源，每个稳定语义键包含 `zh-CN` 和 `en-US`，修改文案时在同一条目下对照修改。不要用中文句子作为键，不要修改内部协议、枚举值或用户输入来实现翻译。语言名保留各自原名。

动态文本使用命名参数，例如 `{count:N0}`。两种语言必须使用相同参数及格式，可改变顺序，不要拼接语序相关的句子。新增语言时同时更新 `LanguageCatalog.Languages`、解析规则和构建检查。

`LanguageCatalog` 只读取资源、验证键与参数及执行格式化；`LanguageSession` 持有当前界面语言并发送变化通知；`LanguageBinding.Attach` 将明确的资源键绑定到控件依赖属性。通过 Loaded/Unloaded 管理通知订阅，替换绑定时移除旧绑定，不重建页面或改变导航。参数提供函数在更新时读取当前值；业务数据变化仍由宿主触发自身更新。

已接入设置导航、卡片、主要选项、快捷动作、指令帮助与颜色编辑器；语言选择器仍未开放。LanguageUi只接受资源键，普通Ui继续显示用户数据。settings-help.json只持有指令结构和资源键，描述和可翻译示例在messages.json维护。指令文本是只读帮助，语言更新不会执行指令或改变分类选择。

PreferenceStore保存Language并在成功后更新AppLanguage唯一会话；默认中文，支持跟随系统。AI在任务开始、异步收集前取得语言快照，整批任务继续使用该快照；Node生成请求显式携带语言，四参数旧请求保持中文。当前未完成主窗口、索引/元数据、模型动态状态和后台提示的全覆盖，不能视为完整双语支持。文件名、路径、用户关键词和源文件元数据不能被资源替换。

验证：`node scripts/winui-language-check.cjs` 和 `dotnet run --project shell/Cap7CE.Layout.Tests/Cap7CE.Layout.Tests.csproj -c Release -- --language-tests`；完整构建运行资源检查。
