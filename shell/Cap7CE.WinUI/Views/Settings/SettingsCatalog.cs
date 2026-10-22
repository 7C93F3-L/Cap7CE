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
    private ModelSettingsView? models;
    public List<SettingsEntry> Entries {get;}=[];
    public SettingsCatalog(ShellServices services,SettingsActions actions,Action<string> notice)
    {
        this.services=services;this.actions=actions;this.notice=notice;
        General();Appearance();Storage();Shortcuts();Models();Diagnostics();About();
    }
    public void BeginRender()=>models=null;
    private ModelSettingsView ModelsView=>models??=new(services,notice);
    private static string T(string key)=>SettingsReference.Text(key);
    private void Mainline(string category,string section,string title,string description,Func<UIElement> create,bool expanded=false)
        =>Entries.Add(new(category,T("stableSettings.section."+section),T(title),T(description),create,expanded));
    private static UIElement Disabled(string key)=>new Button {Content=T(key),IsEnabled=false};
    private static UIElement DisabledToggle()=>new ToggleSwitch {IsEnabled=false,OnContent=T("settings.enabled"),OffContent=T("settings.disabled")};
    private static UIElement DisabledChoice(string[] labels)=>new ComboBox {ItemsSource=labels,SelectedIndex=0,IsEnabled=false};
    private void General()
    {
        Mainline("通用","basics","settings.language","stableSettings.desc.language",()=>DisabledChoice([T("theme.system"),"中文","English"]));
        Mainline("通用","basics","settings.launchAtLogin","stableSettings.desc.launch",DisabledToggle);
        Mainline("通用","basics","settings.systemNotifications","stableSettings.desc.notifications",DisabledToggle);
        Mainline("通用","windows","settings.edgeCollapse","stableSettings.desc.edgeCollapse",()=>DisabledChoice([T("settings.standardWindowMode"),T("settings.edgeCollapseMode")]));
        Mainline("通用","windows","settings.standbyLine","stableSettings.desc.line",DisabledToggle);
    }
    private void Appearance()
    {
        Mainline("外观","colors","stableSettings.material","stableSettings.desc.material",()=>{
            var box=new ComboBox {MinWidth=160};
            box.Items.Add(new ComboBoxItem {Content=T("stableSettings.material.acrylic"),IsEnabled=false});
            box.Items.Add(new ComboBoxItem {Content=T("stableSettings.material.mica")});box.SelectedIndex=1;
            return box;
        });
        Mainline("外观","colors","appearance.themeModeLabel","stableSettings.desc.theme",
            ()=>Choice([T("theme.system"),T("theme.light"),T("theme.dark")],()=>Array.IndexOf(new[]{"system","light","dark"},services.Preferences.Current.Theme),i=>services.Preferences.SaveAsync(services.Preferences.Current with{Theme=new[]{"system","light","dark"}[i]})));
        Mainline("外观","colors","appearance.configureLabel","stableSettings.desc.colors",()=>new SettingsColors(()=>services.Preferences.Current,services.Preferences.SaveAsync,notice));
        Mainline("外观","colors","stableSettings.uiFontSize","stableSettings.desc.uiFontSize",FontSize);
    }
    private void Storage()
    {
        Mainline("缓存与索引","cache","stableSettings.formalCache","stableSettings.desc.formalCache",()=>Disabled("settings.clearCache"));
        Mainline("缓存与索引","index","stableSettings.metadataBuild","stableSettings.desc.metadataBuild",()=>Disabled("stableSettings.manageMetadataBuild"));
    }
    private void Shortcuts()
    {
        Mainline("快捷操作","keyboard","settings.quickActions","stableSettings.desc.quickActions",SettingsShortcutReference.Actions,true);
        Mainline("快捷操作","keyboard","settings.quickCommands","stableSettings.desc.quickCommands",SettingsShortcutReference.Commands,true);
    }
    private void Models()
    {
        Mainline("搜索与 AI","ai","settings.selectRuntime","stableSettings.desc.runtime",()=>ModelsView.RuntimeSettings,true);
        Mainline("搜索与 AI","ai","settings.visionModel","stableSettings.desc.model",()=>ModelsView.ModelSettings,true);
        Mainline("搜索与 AI","ai","stableSettings.runtimeInfo","stableSettings.desc.runtimeInfo",()=>ModelsView.RuntimeInfo,true);
    }
    private void Diagnostics()=>Mainline("诊断","application","stableSettings.diagnostics","stableSettings.desc.diagnostics",()=>{
        var column=Ui.Column();
        column.Children.Add(Ui.Column(Ui.Text(T("settings.applicationLog")),Ui.Text(T("common.notCreated"),true)));
        column.Children.Add(Ui.Column(Ui.Text(T("settings.crashReports")),Ui.Text(T("common.notCreated"),true)));
        column.Children.Add(Ui.Column(Ui.Text(T("settings.detailedLogging")),Ui.Row(Ui.Text(T("common.disabled"),true),Disabled("common.enable"))));
        column.Children.Add(Ui.Column(Ui.Text(T("settings.diagnosticsBundle")),Ui.Text(T("settings.diagnosticsBundleDescription"),true),Disabled("settings.exportDiagnostics")));
        return column;
    },true);
    private void About()
    {
        Mainline("关于","application","settings.versionUpdate","stableSettings.desc.update",()=>Ui.Column(Ui.Text(T("settings.updateCurrentVersion").Replace("{version}","1.0.4")),Disabled("settings.checkForUpdates")));
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
        var slider=new Slider {Value=services.Preferences.Current.FontSize,Minimum=12,Maximum=16,StepFrequency=1,MinWidth=180};
        var column=Ui.Column(slider);column.Spacing=0;
        var scale=new Grid();for(var i=0;i<5;i++)scale.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        var labels=new[]{T("stableSettings.uiFontSize.small"),T("stableSettings.uiFontSize.standard"),"","",T("stableSettings.uiFontSize.large")};
        for(var i=0;i<5;i++){var label=Ui.Text(labels[i],true);label.HorizontalAlignment=i==0?HorizontalAlignment.Left:i==4?HorizontalAlignment.Right:HorizontalAlignment.Center;Grid.SetColumn(label,i);scale.Children.Add(label);}
        column.Children.Add(scale);
        var saved=services.Preferences.Current.FontSize;
        void Commit(){var value=slider.Value;if(value==saved)return;saved=value;actions.Run(async()=>{try{await services.Preferences.SaveAsync(services.Preferences.Current with{FontSize=value});}catch{saved=services.Preferences.Current.FontSize;throw;}});}
        slider.AddHandler(UIElement.PointerReleasedEvent,new PointerEventHandler((_,_)=>Commit()),true);
        slider.KeyUp+=(_,_)=>Commit();slider.LostFocus+=(_,_)=>Commit();
        return column;
    }
}
