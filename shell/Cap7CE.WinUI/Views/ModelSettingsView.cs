using System.Text.Json;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Controls;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI.Views;
internal sealed class ModelSettingsView
{
    private readonly ShellServices services;
    private readonly Action<string> notice;
    private readonly ComboBox runtimes=new(){MinWidth=160,MaxWidth=360,HorizontalAlignment=HorizontalAlignment.Stretch,DisplayMemberPath="Name"},
        models=new(){MinWidth=160,MaxWidth=360,HorizontalAlignment=HorizontalAlignment.Stretch,DisplayMemberPath="Name"};
    private readonly TextBlock fileState=Ui.Text(T("common.notDetected"),true),address=Ui.Text(T("common.stopped"),true),
        runtimeDirectory=Ui.Text(T("common.notDetected"),true),modelDirectory=Ui.Text(T("common.notDetected"),true),inventory=Ui.Text("0 / 0",true);
    private readonly List<Button> buttons=[];
    private readonly Button runtimeToggle;
    private bool active,starting,syncing;
    public UIElement RuntimeSettings {get;}
    public UIElement ModelSettings {get;}
    public UIElement RuntimeInfo {get;}
    private static string T(string key)=>SettingsReference.Text(key);
    private object Context=>new{runtimeRoot=Path.Combine(services.Root,"llama.cpp"),modelsRoot=Path.Combine(services.Root,"models"),language="zh-CN"};
    public ModelSettingsView(ShellServices services,Action<string> notice)
    {
        this.services=services;this.notice=notice;
        runtimes.PlaceholderText=T("settings.selectVersion");models.PlaceholderText=T("settings.selectVisionModel");
        runtimeToggle=Action(T("common.start"),()=>RuntimeAsync(active?"runtime.stop":"runtime.start","manual"));
        RuntimeSettings=Ui.Column(runtimes,Ui.Row(runtimeToggle,Action(T("common.refresh"),RefreshAsync)));
        ModelSettings=Ui.Column(models,Action(T("common.refresh"),RefreshAsync));
        runtimes.SelectionChanged+=(_,_)=>{if(!syncing&&runtimes.SelectedItem is Choice choice)Run(()=>SelectAsync("runtime.select",choice.Id));};
        models.SelectionChanged+=(_,_)=>{if(!syncing&&models.SelectedItem is Choice choice)Run(()=>SelectAsync("models.select",choice.Id));};
        var info=Ui.Column();
        foreach(var (key,value) in new[]{("settings.runtimeFileStatus",fileState),("settings.serviceAddress",address),
            ("settings.runtimeDirectory",runtimeDirectory),("settings.modelDirectory",modelDirectory),("settings.modelInventory",inventory)}) {
            value.IsTextSelectionEnabled=true;info.Children.Add(new SettingsFieldRow(T(key),value));
        }
        RuntimeInfo=info;
    }
    private async Task RefreshAsync()
    {
        var runtime=await services.Models.RequestAsync("modelSettings.invoke",[Context,"runtime.settings",null]);
        var model=await services.Models.RequestAsync("modelSettings.invoke",[Context,"models.settings",null]);
        syncing=true;
        try {
            runtimes.ItemsSource=runtime.GetProperty("versions").EnumerateArray().Select(x=>new Choice(x.GetProperty("version").GetString()!,x.GetProperty("version").GetString()!)).ToArray();
            models.ItemsSource=model.GetProperty("models").EnumerateArray().Select(x=>new Choice(x.GetProperty("id").GetString()!,x.GetProperty("name").GetString()!)).ToArray();
            runtimes.SelectedItem=runtimes.Items.Cast<Choice>().FirstOrDefault(x=>x.Id==runtime.GetProperty("selectedVersion").GetString());
            models.SelectedItem=models.Items.Cast<Choice>().FirstOrDefault(x=>x.Id==model.GetProperty("selectedModelId").GetString());
        } finally{syncing=false;}
        fileState.Text=runtime.TryGetProperty("message",out var message)?message.GetString()??"":runtime.GetProperty("status").GetString();
        runtimeDirectory.Text=runtime.GetProperty("runtimeRoot").GetString();modelDirectory.Text=model.GetProperty("modelsRoot").GetString();
        inventory.Text=$"{models.Items.Count} / {model.GetProperty("files").GetArrayLength()}";
        await RuntimeAsync("runtime.state",null);
    }
    private async Task SelectAsync(string operation,string id)
    {await services.Models.RequestAsync("modelSettings.invoke",[Context,operation,id]);}
    private async Task RuntimeAsync(string operation,object? value)
    {
        var reply=(await services.Models.RequestAsync(operation,[Context,value])).GetProperty("state");
        starting=reply.GetProperty("status").GetString()=="starting";active=starting||reply.GetProperty("status").GetString()=="running";
        runtimeToggle.Content=T(active?"common.stop":"common.start");
        address.Text=reply.TryGetProperty("host",out var host)&&reply.TryGetProperty("port",out var port)&&port.ValueKind==JsonValueKind.Number
            ?$"{host.GetString()}:{port.GetInt32()}":T("common.stopped");
    }
    private Button Action(string label,Func<Task> work){var button=Ui.Button(label,()=>Run(work));buttons.Add(button);return button;}
    private async void Run(Func<Task> work)
    {
        foreach(var button in buttons)button.IsEnabled=false;runtimes.IsEnabled=models.IsEnabled=false;
        try{await work();}catch(Exception error){notice(error.Message);}
        finally{foreach(var button in buttons)button.IsEnabled=true;runtimes.IsEnabled=models.IsEnabled=!active;runtimeToggle.IsEnabled=!starting;}
    }
    private sealed record Choice(string Id,string Name);
}
