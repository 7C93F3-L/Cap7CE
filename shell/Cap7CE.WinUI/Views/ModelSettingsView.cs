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
    private readonly ComboBox runtimes=new(){MinWidth=160,MaxWidth=360,HorizontalAlignment=HorizontalAlignment.Stretch},
        models=new(){MinWidth=160,MaxWidth=360,HorizontalAlignment=HorizontalAlignment.Stretch};
    private readonly TextBlock fileState=L.Text("common.notDetected",true),address=L.Text("common.stopped",true),
        runtimeDirectory=L.Text("common.notDetected",true),modelDirectory=L.Text("common.notDetected",true),inventory=L.Text("ui.model.inventory",true,()=>new Dictionary<string,object?>{{"models",0},{"files",0}});
    private readonly List<Button> buttons=[];
    private readonly Button runtimeToggle;
    private bool active,starting,syncing;
    private bool subscribed,running,refreshPending;
    private int generation;
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
        runtimes.SelectionChanged+=(_,_)=>{if(!syncing&&runtimes.SelectedItem is ComboBoxItem{Tag:string id})Run(()=>SelectAsync("runtime.select",id));};
        models.SelectionChanged+=(_,_)=>{if(!syncing&&models.SelectedItem is ComboBoxItem{Tag:string id})Run(()=>SelectAsync("models.select",id));};
        var info=Ui.Column();
        foreach(var (key,value) in new[]{("settings.runtimeFileStatus",fileState),("settings.serviceAddress",address),
            ("settings.runtimeDirectory",runtimeDirectory),("settings.modelDirectory",modelDirectory),("settings.modelInventory",inventory)}) {
            value.IsTextSelectionEnabled=true;info.Children.Add(new SettingsFieldRow(key,value,localized:true));
        }
        RuntimeInfo=new SettingsExpandable(info);
        var owner=(FrameworkElement)RuntimeSettings;
        owner.Loaded+=(_,_)=>{
            if(subscribed)return;subscribed=true;generation++;
            services.ModelChanges.Changed+=ModelChanged;
            ModelChanged();
        };
        owner.Unloaded+=(_,_)=>owner.DispatcherQueue.TryEnqueue(()=>{
            // WinUI can deliver a late Unloaded after reparenting the settings card.
            if(owner.IsLoaded||!subscribed)return;
            subscribed=false;generation++;refreshPending=false;
            services.ModelChanges.Changed-=ModelChanged;
        });
    }
    private void ModelChanged()=>((FrameworkElement)RuntimeSettings).DispatcherQueue.TryEnqueue(()=>{
        if(!subscribed)return;
        refreshPending=true;ApplyEnabled();
        if(!running&&!services.ModelChanges.Busy)Run(RefreshAsync);
    });
    private void ApplyEnabled()
    {
        var busy=running||services.ModelChanges.Busy;
        foreach(var button in buttons)button.IsEnabled=!busy;
        runtimes.IsEnabled=models.IsEnabled=!busy&&!active;
        runtimeToggle.IsEnabled=!busy&&!starting;
    }
    private static UIElement SelectionRow(ComboBox choice,Button refresh)
    {
        var row=new Grid{ColumnSpacing=8};row.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        row.ColumnDefinitions.Add(new(){Width=GridLength.Auto});row.Children.Add(choice);Grid.SetColumn(refresh,1);row.Children.Add(refresh);
        return row;
    }
    private async Task RefreshAsync()
    {
        var current=generation;
        var runtime=await ModelActions.SettingsAsync("runtime.settings");
        var model=await ModelActions.SettingsAsync("models.settings");
        var state=await ModelActions.RuntimeAsync("runtime.state",null);
        if(!subscribed||current!=generation)return;
        syncing=true;
        try {
            Populate(runtimes,"settings.selectVersion",runtime.GetProperty("versions"),"version","version",runtime.GetProperty("selectedVersion").GetString());
            Populate(models,"settings.selectVisionModel",model.GetProperty("models"),"id","name",model.GetProperty("selectedModelId").GetString());
        } finally{syncing=false;}
        var runtimeStatus=runtime.GetProperty("status").GetString()??"";
        var runtimeRoot=runtime.GetProperty("runtimeRoot").GetString();var selectedVersion=runtime.GetProperty("selectedVersion").GetString();
        var detail=runtime.TryGetProperty("message",out var message)?message.GetString()??runtimeStatus:runtimeStatus;
        L.Bind(fileState,TextBlock.TextProperty,Cap7CE.WinUI.Localization.MaintenanceText.RuntimeKey(runtimeStatus),()=>new Dictionary<string,object?>{{"path",runtimeRoot},{"name",selectedVersion},{"status",detail}});
        L.Literal(runtimeDirectory,TextBlock.TextProperty,runtimeRoot);L.Literal(modelDirectory,TextBlock.TextProperty,model.GetProperty("modelsRoot").GetString());
        var fileCount=model.GetProperty("files").GetArrayLength();var modelCount=model.GetProperty("models").GetArrayLength();
        L.Bind(inventory,TextBlock.TextProperty,"ui.model.inventory",()=>new Dictionary<string,object?>{{"models",modelCount},{"files",fileCount}});
        ApplyRuntime(state);
    }
    private async Task SelectAsync(string operation,string id)
    {await ModelActions.SettingsAsync(operation,id);}
    private async Task RuntimeAsync(string operation,object? value)
    {
        var current=generation;
        var reply=await ModelActions.RuntimeAsync(operation,value);
        if(subscribed&&current==generation)ApplyRuntime(reply);
    }
    private void ApplyRuntime(JsonElement reply)
    {
        starting=reply.GetProperty("status").GetString()=="starting";active=starting||reply.GetProperty("status").GetString()=="running";
        L.Bind(runtimeToggle,Button.ContentProperty,active?"common.stop":"common.start");
        if(reply.TryGetProperty("host",out var host)&&reply.TryGetProperty("port",out var port)&&port.ValueKind==JsonValueKind.Number)L.Literal(address,TextBlock.TextProperty,$"{host.GetString()}:{port.GetInt32()}");else L.Bind(address,TextBlock.TextProperty,"common.stopped");
    }
    private Button Action(string label,Func<Task> work){var button=L.Button(label,()=>Run(work));buttons.Add(button);return button;}
    private async void Run(Func<Task> work)
    {
        if(running)return;running=true;refreshPending=false;ApplyEnabled();
        try{
            await work();
            while(refreshPending&&subscribed&&!services.ModelChanges.Busy){refreshPending=false;await RefreshAsync();}
        }catch(Exception error){if(subscribed)notice(FailureText.From(error));}
        finally{
            running=false;ApplyEnabled();
            if(refreshPending&&subscribed&&!services.ModelChanges.Busy)ModelChanged();
        }
    }
    private static void Populate(ComboBox box,string emptyKey,JsonElement entries,string idKey,string nameKey,string? selected)
    {
        box.Items.Clear();
        var empty=new ComboBoxItem{Tag=""};L.Bind(empty,ComboBoxItem.ContentProperty,emptyKey);box.Items.Add(empty);
        foreach(var entry in entries.EnumerateArray())
            box.Items.Add(new ComboBoxItem{Tag=entry.GetProperty(idKey).GetString()!,Content=entry.GetProperty(nameKey).GetString()!});
        box.SelectedItem=box.Items.Cast<ComboBoxItem>().FirstOrDefault(item=>(string)item.Tag==selected)??empty;
    }
}
