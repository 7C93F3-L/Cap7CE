# 原生语言资源

`messages.json` 是 WinUI 独立维护的语言资源，每个稳定语义键包含 `zh-CN` 和 `en-US`，修改文案时在同一条目下对照修改。不要用中文句子作为键，不要修改内部协议、枚举值或用户输入来实现翻译。语言名保留各自原名。

动态文本使用命名参数，例如 `{count:N0}`。两种语言必须使用相同参数及格式，可改变顺序，不要拼接语序相关的句子。新增语言时同时更新 `LanguageCatalog.Languages`、解析规则和构建检查。

`LanguageCatalog` 只读取资源、验证键与参数及执行格式化；`LanguageSession` 持有当前界面语言并发送变化通知；`LanguageBinding.Attach` 将明确的资源键绑定到控件依赖属性。通过 Loaded/Unloaded 管理通知订阅，替换绑定时移除旧绑定，不重建页面或改变导航。参数提供函数在更新时读取当前值；业务数据变化仍由宿主触发自身更新。

当前为接入基础，尚未开放语言选择器。接入范围包括按钮、标题、提示、无障碍名称、菜单、对话框、后台消息及生成的筛选资源。文件名、路径、用户关键词和源文件元数据不能被资源替换。AI 语言应在任务开始时取快照，整批任务继续使用该快照，切换影响后续新任务。

验证：`node scripts/winui-language-check.cjs` 和 `dotnet run --project shell/Cap7CE.Layout.Tests/Cap7CE.Layout.Tests.csproj -c Release -- --language-tests`；完整构建运行资源检查。
