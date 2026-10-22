using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Services;

namespace Cap7CE.WinUI.Views;

internal sealed class SettingsCatalog
{
    private readonly ShellServices services;
    private readonly SettingsActions actions;
    private readonly Action<string> notice;
    private readonly Window owner;
    private ModelSettingsView? models;
    public List<SettingsEntry> Entries {get;}=[];
    public SettingsCatalog(ShellServices services,Window owner,SettingsActions actions,Action<string> notice)
    {
        this.services=services;this.owner=owner;this.actions=actions;this.notice=notice;
        General();Appearance();Storage();Shortcuts();Models();Diagnostics();About();
    }
    public void BeginRender()=>models=null;
    private ModelSettingsView ModelsView=>models??=new(services,notice);
    private static string T(string key)=>SettingsReference.Text(key);
    private void Mainline(string category,string section,string title,string description,Func<UIElement> create,bool expanded=false,string? descriptionOverride=null)
        =>Entries.Add(new(category,T("stableSettings.section."+section),T(title),descriptionOverride??T(description),create,expanded));
    private static UIElement Disabled(string key)=>new Button {Content=T(key),IsEnabled=false};
    private static UIElement DisabledToggle()=>new ToggleSwitch {IsEnabled=false,OnContent=T("settings.enabled"),OffContent=T("settings.disabled")};
    private static UIElement DisabledChoice(string[] labels)=>new ComboBox {ItemsSource=labels,SelectedIndex=0,IsEnabled=false};
    private void General()
    {
        Mainline("通用","basics","settings.language","stableSettings.desc.language",()=>DisabledChoice([T("theme.system"),"中文","English"]));
        Mainline("通用","basics","settings.launchAtLogin","stableSettings.desc.launch",()=>Toggle(()=>SystemSettings.LaunchAtLogin,value=>{SystemSettings.LaunchAtLogin=value;return Task.CompletedTask;}));
        Mainline("通用","basics","settings.systemNotifications","stableSettings.desc.notifications",()=>Toggle(()=>services.Preferences.Current.Notifications,async value=>{services.Notifications.Configure(value);await services.Preferences.SaveAsync(services.Preferences.Current with{Notifications=value});}));
        Mainline("通用","windows","settings.edgeCollapse","stableSettings.desc.edgeCollapse",()=>DisabledChoice([T("settings.standardWindowMode"),T("settings.edgeCollapseMode")]));
        Mainline("通用","windows","settings.standbyLine","stableSettings.desc.line",DisabledToggle);
    }
    private void Appearance()
    {
        Mainline("外观","colors","stableSettings.material","stableSettings.desc.material",
            ()=>Choice(["云母","云母 Alt"],()=>services.Preferences.Current.Material=="mica-alt"?1:0,
                i=>services.Preferences.SaveAsync(services.Preferences.Current with{Material=i==0?"mica":"mica-alt"})),
            descriptionOverride:"选择主窗口、设置与预览窗口使用的云母或云母 Alt 效果；不可用时自动使用纯色背景。");
        Mainline("外观","colors","appearance.themeModeLabel","stableSettings.desc.theme",
            ()=>Choice([T("theme.system"),T("theme.light"),T("theme.dark")],()=>Array.IndexOf(new[]{"system","light","dark"},services.Preferences.Current.Theme),i=>services.Preferences.SaveAsync(services.Preferences.Current with{Theme=new[]{"system","light","dark"}[i]})));
        Mainline("外观","colors","appearance.configureLabel","stableSettings.desc.colors",()=>new SettingsColors(()=>services.Preferences.Current,services.Preferences.SaveAsync,notice));
        Mainline("外观","colors","stableSettings.uiFontSize","stableSettings.desc.uiFontSize",FontSize);
    }
    private void Storage()
    {
        Mainline("缓存与索引","cache","stableSettings.formalCache","stableSettings.desc.formalCache",()=>Ui.Button(T("settings.clearCache"),()=>actions.Run(ClearCacheAsync)),descriptionOverride:"清理WinUI缩略图和预览缓存，下次查看时按需生成；不清理旧界面缓存、索引和用户资料。");
        Mainline("缓存与索引","index","stableSettings.metadataBuild","stableSettings.desc.metadataBuild",()=>Ui.Button(T("stableSettings.manageMetadataBuild"),OpenMaintenance));
    }
    private void OpenMaintenance()
    {
        services.ShowMaintenance();
    }
    private async Task ClearCacheAsync()
    {
        var dialog=new ContentDialog {XamlRoot=owner.Content.XamlRoot,Title="清理缓存",Content="仅清理WinUI缩略图与预览缓存，索引、关键词和源文件保持不变。",PrimaryButtonText="清理",CloseButtonText="取消",DefaultButton=ContentDialogButton.Close};
        if(await dialog.ShowAsync()!=ContentDialogResult.Primary)return;
        await services.ClearVisualCacheAsync();notice("WinUI缓存已清理。");
    }
    private UIElement Toggle(Func<bool> read,Func<bool,Task> save)
    {
        var toggle=new ToggleSwitch {MinWidth=0,IsOn=read(),OnContent=T("settings.enabled"),OffContent=T("settings.disabled")};var syncing=false;
        toggle.Toggled+=async(_,_)=>{
            if(syncing)return;toggle.IsEnabled=false;
            try{await save(toggle.IsOn);}catch(Exception error){notice(error.Message);syncing=true;toggle.IsOn=read();syncing=false;}
            finally{toggle.IsEnabled=true;}
        };return toggle;
    }
    private void Shortcuts()
    {
        Mainline("快捷操作","keyboard","settings.quickActions","stableSettings.desc.quickActions",()=>SettingsShortcutReference.Actions(Toggle(()=>services.Preferences.Current.QuickActions,async value=>{
            var previous=services.Preferences.Current.QuickActions;
            services.Shortcuts?.Configure(value);
            try{await services.Preferences.SaveAsync(services.Preferences.Current with{QuickActions=value});}catch{services.Shortcuts?.Configure(previous);throw;}
        })),true);
        Mainline("快捷操作","keyboard","settings.quickCommands","stableSettings.desc.quickCommands",SettingsShortcutReference.Commands,true);
    }
    private void Models()
    {
        Mainline("搜索与 AI","ai","settings.selectRuntime","stableSettings.desc.runtime",()=>ModelsView.RuntimeSettings);
        Mainline("搜索与 AI","ai","settings.visionModel","stableSettings.desc.model",()=>ModelsView.ModelSettings);
        Mainline("搜索与 AI","ai","stableSettings.runtimeInfo","stableSettings.desc.runtimeInfo",()=>ModelsView.RuntimeInfo,true);
    }
    private void Diagnostics()=>Mainline("诊断","application","stableSettings.diagnostics","stableSettings.desc.diagnostics",()=>{
        var column=Ui.Column();
        column.Children.Add(new SettingsFieldRow(T("settings.applicationLog"),Ui.Text("原生启动及Core错误日志",true),Ui.Button("打开目录",()=>{Directory.CreateDirectory(PreferenceStore.DataRoot);FileCommands.OpenDirectoryInExplorer(PreferenceStore.DataRoot);} )));
        column.Children.Add(new SettingsFieldRow(T("settings.crashReports"),Ui.Text(File.Exists(Path.Combine(PreferenceStore.DataRoot,"last-startup-error.log"))?"存在启动/异常记录":T("common.notCreated"),true)));
        column.Children.Add(new SettingsFieldRow(T("settings.detailedLogging"),Ui.Text(T("common.disabled"),true),Disabled("common.enable")));
        column.Children.Add(new SettingsFieldRow(T("settings.diagnosticsBundle"),Ui.Text("导出原生运行信息及已记录的错误，不包含素材、数据库或偏好文件。",true),Ui.Button(T("settings.exportDiagnostics"),()=>actions.Run(()=>NativeDiagnostics.ExportAsync(owner)))));
        return column;
    },true);
    private void About()
    {
        Mainline("关于","application","settings.versionUpdate","stableSettings.desc.update",()=>Ui.Column(Ui.Text(T("settings.updateCurrentVersion").Replace("{version}",NativeVersion.Text)),Ui.Button(T("settings.checkForUpdates"),()=>actions.Run(async()=>notice(await NativeUpdates.CheckAsync())))),descriptionOverride:"仅在主动点击时检查正式WinUI更新，不下载或安装Electron发布。");
        Mainline("关于","application","stableSettings.license","stableSettings.desc.license",()=>new TextBlock());
    }
    private UIElement Choice(string[] labels,Func<int> read,Func<int,Task> change)
    {
        var box=new ComboBox {ItemsSource=labels,SelectedIndex=read(),MinWidth=160,MaxWidth=300};var syncing=false;
        box.SelectionChanged+=async(_,_)=>{
            if(syncing||box.SelectedIndex<0)return;box.IsEnabled=false;
            try{await change(box.SelectedIndex);}catch(Exception error){notice(error.Message);syncing=true;box.SelectedIndex=read();syncing=false;}
            finally{box.IsEnabled=true;}
        };return box;
    }
    private UIElement FontSize()
    {
        var slider=new SizeSlider("界面字号",services.Preferences.Current.FontSize,12,16,1,1,13,value=>$"{value:0} DIP",_=>{},showTitle:false);
        var saved=services.Preferences.Current.FontSize;
        void Commit(){var value=slider.Value;if(value==saved)return;saved=value;actions.Run(async()=>{try{await services.Preferences.SaveAsync(services.Preferences.Current with{FontSize=value});}catch{saved=services.Preferences.Current.FontSize;throw;}});}
        slider.CommitRequested+=Commit;
        return slider;
    }
}
