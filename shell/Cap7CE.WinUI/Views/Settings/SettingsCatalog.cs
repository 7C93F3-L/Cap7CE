using Cap7CE.WinUI.Localization;
using Microsoft.UI.Xaml;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Services;

namespace Cap7CE.WinUI.Views;

internal sealed class SettingsCatalog
{
    private readonly ShellServices services;
    private readonly SettingsActions actions;
    private readonly Action<UiMessage> notice;
    private readonly Window owner;
    private ModelSettingsView? models;
    private bool metadataFocus;
    private readonly Action<string,Func<UIElement>> openSubpage;
    public List<SettingsEntry> Entries {get;}=[];
    public SettingsCatalog(ShellServices services,Window owner,SettingsActions actions,Action<UiMessage> notice,Action<string,Func<UIElement>> openSubpage)
    {
        this.services=services;this.owner=owner;this.actions=actions;this.notice=notice;this.openSubpage=openSubpage;
        General();Appearance();Storage();Shortcuts();Models();Diagnostics();About();
    }
    public void BeginRender()=>models=null;
    public void FocusMetadata()=>metadataFocus=true;
    private MetadataMaintenanceView MetadataView()
    {
        var view=new MetadataMaintenanceView(services,owner);
        if(metadataFocus){metadataFocus=false;view.Loaded+=(_,_)=>view.DispatcherQueue.TryEnqueue(()=>view.StartBringIntoView());}
        return view;
    }
    private ModelSettingsView ModelsView=>models??=new(services,notice);
    private void Mainline(string category,string section,string title,string description,Func<UIElement> create,bool expanded=false,string? descriptionOverride=null)
        =>Entries.Add(new(category,"stableSettings.section."+section,title,descriptionOverride??description,create,expanded));
    private static UIElement Disabled(string key){var button=L.Button(key,()=>{});button.IsEnabled=false;return button;}
    private static UIElement DisabledChoice(string[] labels)=>L.Choice(labels,enabled:false);
    private void General()
    {
        Mainline("通用","basics","settings.language","stableSettings.desc.language",()=>Choice(LanguagePreferenceOptions.Choices.Select(choice=>choice.Key).ToArray(),
            ()=>LanguagePreferenceOptions.Index(services.Preferences.Current.Language),index=>services.Preferences.UpdateAsync(value=>value with{Language=LanguagePreferenceOptions.Choices[index].Id})));
        Mainline("通用","basics","settings.launchAtLogin","stableSettings.desc.launch",()=>SettingsLoginToggle.Create(notice));
        Mainline("通用","basics","ui.tray.enabled","ui.tray.enabledHint",()=>Toggle(()=>services.Preferences.Current.TrayIconEnabled,value=>services.Preferences.UpdateAsync(p=>p with{TrayIconEnabled=value})));
        Mainline("通用","basics","ui.tray.showStartup","ui.tray.showStartupHint",()=>Toggle(()=>services.Preferences.Current.ShowMainOnStartup,value=>services.Preferences.UpdateAsync(p=>p with{ShowMainOnStartup=value})));
        Mainline("通用","basics","settings.systemNotifications","stableSettings.desc.notifications",()=>Toggle(()=>services.Preferences.Current.Notifications,async value=>{
            await services.Notifications.SetEnabledAsync(services.Preferences,value);
            if(value&&!services.Notifications.IsAllowed)notice(UiMessage.Key("ui.notice.notificationsBlocked"));
        }));
        Mainline("通用","windows","settings.edgeCollapse","stableSettings.desc.edgeCollapse",()=>Choice(["settings.standardWindowMode","settings.edgeCollapseMode"],
            ()=>services.Preferences.Current.EdgeCollapseEnabled?1:0,index=>services.Preferences.UpdateAsync(value=>value with{EdgeCollapseEnabled=index==1})));
    }
    private void Appearance()
    {
        Mainline("外观","colors","stableSettings.material","stableSettings.desc.material",
            ()=>Choice(["native.material.mica","native.material.alt"],()=>services.Preferences.Current.Material=="mica-alt"?1:0,
                i=>services.Preferences.SaveAsync(services.Preferences.Current with{Material=i==0?"mica":"mica-alt"})),
            descriptionOverride:"native.material.description");
        Mainline("外观","colors","appearance.themeModeLabel","stableSettings.desc.theme",
            ()=>Choice(["theme.system","theme.light","theme.dark"],()=>Array.IndexOf(new[]{"system","light","dark"},services.Preferences.Current.Theme),i=>services.Preferences.SaveAsync(services.Preferences.Current with{Theme=new[]{"system","light","dark"}[i]})));
        Mainline("外观","colors","appearance.configureLabel","stableSettings.desc.colors",()=>new SettingsExpandable(new SettingsColors(()=>services.Preferences.Current,services.Preferences.SaveAsync,notice)));
    }
    private void Storage()
    {
        Entries.Add(new("缓存与索引","stableSettings.section.index","","",()=>new MaintenanceSettingsView(services,owner),true));
        Entries.Add(new("缓存与索引","native.metadata.section","native.metadata.title","native.metadata.description",MetadataView,true));
        Mainline("缓存与索引","cache","stableSettings.formalCache","stableSettings.desc.formalCache",()=>new CacheSettingsView(services,owner,notice),descriptionOverride:"native.cache.description");
    }
    private UIElement Toggle(Func<bool> read,Func<bool,Task> save)
    {
        var toggle=L.Toggle();toggle.IsOn=read();var syncing=false;
        toggle.Toggled+=async(_,_)=>{
            if(syncing)return;toggle.IsEnabled=false;
            try{await save(toggle.IsOn);}catch(Exception error){notice(FailureText.From(error));syncing=true;toggle.IsOn=read();syncing=false;}
            finally{toggle.IsEnabled=true;}
        };return toggle;
    }
    private void Shortcuts()
    {
        Mainline("快捷操作","keyboard","settings.quickActions","stableSettings.desc.quickActions",()=>new SettingsPageLink(()=>openSubpage("settings.quickActions",()=>new SettingsShortcutEditor(services,owner,notice))));
        Mainline("快捷操作","keyboard","settings.quickCommands","stableSettings.desc.quickCommands",()=>new SettingsPageLink(()=>openSubpage("settings.quickCommands",SettingsShortcutReference.Commands)));
    }
    private void Models()
    {
        Mainline("搜索与 AI","ai","settings.selectRuntime","stableSettings.desc.runtime",()=>ModelsView.RuntimeSettings);
        Mainline("搜索与 AI","ai","settings.visionModel","stableSettings.desc.model",()=>ModelsView.ModelSettings);
        Mainline("搜索与 AI","ai","ui.model.serviceTitle","ui.model.serviceDescription",()=>ModelsView.RuntimeService);
        Mainline("搜索与 AI","ai","stableSettings.runtimeInfo","stableSettings.desc.runtimeInfo",()=>ModelsView.RuntimeInfo,true);
    }
    private void Diagnostics()
    {
        Entries.Add(new("诊断","stableSettings.section.application","native.maintenance.title","native.maintenance.description",()=>new CoreMaintenanceView(services,owner).Section));
        Entries.Add(new("诊断","stableSettings.section.application","","",()=>new DiagnosticsView(services,owner)));
    }
    private void About()
    {
        Mainline("关于","application","settings.versionUpdate","stableSettings.desc.update",VersionActions,descriptionOverride:"native.update.description");
        Mainline("关于","application","stableSettings.license","stableSettings.desc.license",()=>new TextBlock());
    }
    private UIElement VersionActions()
    {
        var version=L.Text("settings.updateCurrentVersion",parameters:()=>new Dictionary<string,object?>{{"version",NativeVersion.Text}});
        version.VerticalAlignment=VerticalAlignment.Center;
        return Ui.Row(version,L.Button("settings.checkForUpdates",()=>actions.Run(async()=>notice(await NativeUpdates.CheckAsync()))));
    }
    private UIElement Choice(string[] labels,Func<int> read,Func<int,Task> change)
    {
        var box=L.Choice(labels,read());var syncing=false;
        box.SelectionChanged+=async(_,_)=>{
            if(syncing||box.SelectedIndex<0)return;box.IsEnabled=false;
            try{await change(box.SelectedIndex);}catch(Exception error){notice(FailureText.From(error));syncing=true;box.SelectedIndex=read();syncing=false;}
            finally{box.IsEnabled=true;}
        };return box;
    }
}
