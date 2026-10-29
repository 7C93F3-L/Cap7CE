using Cap7CE.WinUI.Localization;
using System.Text.Json;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Controls;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI.Views;
internal sealed class ModelSettingsView
{
    private readonly ShellServices services;
    private readonly Action<UiMessage> notice;
    private readonly ComboBox runtimes=new(){MinWidth=160,MaxWidth=360,HorizontalAlignment=HorizontalAlignment.Stretch,DisplayMemberPath="Name"},
        models=new(){MinWidth=160,MaxWidth=360,HorizontalAlignment=HorizontalAlignment.Stretch,DisplayMemberPath="Name"};
    private readonly TextBlock fileState=L.Text("common.notDetected",true),address=L.Text("common.stopped",true),
        runtimeDirectory=L.Text("common.notDetected",true),modelDirectory=L.Text("common.notDetected",true),inventory=L.Text("ui.model.inventory",true,()=>new Dictionary<string,object?>{{"models",0},{"files",0}});
    private readonly List<Button> buttons=[];
    private readonly Button runtimeToggle;
    private bool active,starting,syncing;
    public UIElement RuntimeSettings {get;}
    public UIElement ModelSettings {get;}
    public UIElement RuntimeService=>runtimeToggle;
    public UIElement RuntimeInfo {get;}
    private Commands.ModelCommandActions ModelActions=>new(services);
    public ModelSettingsView(ShellServices services,Action<UiMessage> notice)
    {
        this.services=services;this.notice=notice;
        L.Bind(runtimes,ComboBox.PlaceholderTextProperty,"settings.selectVersion");L.Bind(models,ComboBox.PlaceholderTextProperty,"settings.selectVisionModel");
        runtimeToggle=Action("common.start",()=>RuntimeAsync(active?"runtime.stop":"runtime.start","manual"));
        RuntimeSettings=SelectionRow(runtimes,Action("common.refresh",RefreshAsync));
        ModelSettings=SelectionRow(models,Action("common.refresh",RefreshAsync));
        runtimes.SelectionChanged+=(_,_)=>{if(!syncing&&runtimes.SelectedItem is Choice choice)Run(()=>SelectAsync("runtime.select",choice.Id));};
        models.SelectionChanged+=(_,_)=>{if(!syncing&&models.SelectedItem is Choice choice)Run(()=>SelectAsync("models.select",choice.Id));};
        var info=Ui.Column();
        foreach(var (key,value) in new[]{("settings.runtimeFileStatus",fileState),("settings.serviceAddress",address),
            ("settings.runtimeDirectory",runtimeDirectory),("settings.modelDirectory",modelDirectory),("settings.modelInventory",inventory)}) {
            value.IsTextSelectionEnabled=true;info.Children.Add(new SettingsFieldRow(key,value,localized:true));
        }
        RuntimeInfo=new SettingsExpandable(info);
        var loaded=false;((FrameworkElement)RuntimeSettings).Loaded+=(_,_)=>{if(!loaded){loaded=true;Run(RefreshAsync);}};
    }
    private static UIElement SelectionRow(ComboBox choice,Button refresh)
    {
        var row=new Grid{ColumnSpacing=8};row.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        row.ColumnDefinitions.Add(new(){Width=GridLength.Auto});row.Children.Add(choice);Grid.SetColumn(refresh,1);row.Children.Add(refresh);
        return row;
    }
    private async Task RefreshAsync()
    {
        var runtime=await ModelActions.SettingsAsync("runtime.settings");
        var model=await ModelActions.SettingsAsync("models.settings");
        syncing=true;
        try {
            runtimes.ItemsSource=runtime.GetProperty("versions").EnumerateArray().Select(x=>new Choice(x.GetProperty("version").GetString()!,x.GetProperty("version").GetString()!)).ToArray();
            models.ItemsSource=model.GetProperty("models").EnumerateArray().Select(x=>new Choice(x.GetProperty("id").GetString()!,x.GetProperty("name").GetString()!)).ToArray();
            runtimes.SelectedItem=runtimes.Items.Cast<Choice>().FirstOrDefault(x=>x.Id==runtime.GetProperty("selectedVersion").GetString());
            models.SelectedItem=models.Items.Cast<Choice>().FirstOrDefault(x=>x.Id==model.GetProperty("selectedModelId").GetString());
        } finally{syncing=false;}
        var runtimeStatus=runtime.GetProperty("status").GetString()??"";
        var runtimeRoot=runtime.GetProperty("runtimeRoot").GetString();var selectedVersion=runtime.GetProperty("selectedVersion").GetString();
        var detail=runtime.TryGetProperty("message",out var message)?message.GetString()??runtimeStatus:runtimeStatus;
        L.Bind(fileState,TextBlock.TextProperty,Cap7CE.WinUI.Localization.MaintenanceText.RuntimeKey(runtimeStatus),()=>new Dictionary<string,object?>{{"path",runtimeRoot},{"name",selectedVersion},{"status",detail}});
        L.Literal(runtimeDirectory,TextBlock.TextProperty,runtimeRoot);L.Literal(modelDirectory,TextBlock.TextProperty,model.GetProperty("modelsRoot").GetString());
        var fileCount=model.GetProperty("files").GetArrayLength();L.Bind(inventory,TextBlock.TextProperty,"ui.model.inventory",()=>new Dictionary<string,object?>{{"models",models.Items.Count},{"files",fileCount}});
        await RuntimeAsync("runtime.state",null);
    }
    private async Task SelectAsync(string operation,string id)
    {await ModelActions.SettingsAsync(operation,id);}
    private async Task RuntimeAsync(string operation,object? value)
    {
        var reply=await ModelActions.RuntimeAsync(operation,value);
        starting=reply.GetProperty("status").GetString()=="starting";active=starting||reply.GetProperty("status").GetString()=="running";
        L.Bind(runtimeToggle,Button.ContentProperty,active?"common.stop":"common.start");
        if(reply.TryGetProperty("host",out var host)&&reply.TryGetProperty("port",out var port)&&port.ValueKind==JsonValueKind.Number)L.Literal(address,TextBlock.TextProperty,$"{host.GetString()}:{port.GetInt32()}");else L.Bind(address,TextBlock.TextProperty,"common.stopped");
    }
    private Button Action(string label,Func<Task> work){var button=L.Button(label,()=>Run(work));buttons.Add(button);return button;}
    private async void Run(Func<Task> work)
    {
        foreach(var button in buttons)button.IsEnabled=false;runtimes.IsEnabled=models.IsEnabled=false;
        try{await work();}catch(Exception error){notice(FailureText.From(error));}
        finally{foreach(var button in buttons)button.IsEnabled=true;runtimes.IsEnabled=models.IsEnabled=!active;runtimeToggle.IsEnabled=!starting;}
    }
    private sealed record Choice(string Id,string Name);
}
