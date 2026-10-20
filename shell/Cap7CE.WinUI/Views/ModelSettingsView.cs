using System.Text.Json;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Controls;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Views;
internal sealed class ModelSettingsView : UserControl
{
    private readonly ShellServices services;
    private readonly Action<string> notice;
    private readonly ComboBox runtimes=new(){MinWidth=240,DisplayMemberPath="Name"},models=new(){MinWidth=240,DisplayMemberPath="Name"};
    private readonly TextBlock state=Ui.Text("尚未读取",true);
    private object Context=>new{runtimeRoot=Path.Combine(services.Root,"llama.cpp"),modelsRoot=Path.Combine(services.Root,"models"),language="zh-CN"};
    public ModelSettingsView(ShellServices services,Action<string> notice)
    {
        this.services=services;this.notice=notice;
        Content=Ui.Column(Ui.Button("刷新可用组件",()=>Run(RefreshAsync)),runtimes,Ui.Button("选择运行组件",()=>Run(()=>SelectAsync("runtime.select",runtimes))),
            models,Ui.Button("选择模型",()=>Run(()=>SelectAsync("models.select",models))),Ui.Row(Ui.Button("加载",()=>Run(()=>RuntimeAsync("runtime.start","manual"))),
            Ui.Button("卸载",()=>Run(()=>RuntimeAsync("runtime.stop","manual"))),Ui.Button("状态",()=>Run(()=>RuntimeAsync("runtime.state",null)))),state);
    }
    private async Task RefreshAsync()
    {
        var runtime=await services.Models.RequestAsync("modelSettings.invoke",[Context,"runtime.settings",null]);
        var model=await services.Models.RequestAsync("modelSettings.invoke",[Context,"models.settings",null]);
        runtimes.ItemsSource=runtime.GetProperty("versions").EnumerateArray().Select(x=>new Choice(x.GetProperty("version").GetString()!,x.GetProperty("version").GetString()!)).ToArray();
        models.ItemsSource=model.GetProperty("models").EnumerateArray().Select(x=>new Choice(x.GetProperty("id").GetString()!,x.GetProperty("name").GetString()!)).ToArray();
        state.Text=$"运行组件：{runtime.GetProperty("status")}\n模型：{model.GetProperty("status")}";
    }
    private async Task SelectAsync(string operation,ComboBox selector)
    {if(selector.SelectedItem is not Choice choice)throw new IOException("请先选择一项");await services.Models.RequestAsync("modelSettings.invoke",[Context,operation,choice.Id]);state.Text="已选择";}
    private async Task RuntimeAsync(string operation,object? value)
    {
        var reply=(await services.Models.RequestAsync(operation,[Context,value])).GetProperty("state");
        state.Text=$"运行：{reply.GetProperty("status")}\n模型：{reply.GetProperty("modelStatus")}";
        if(reply.TryGetProperty("message",out var message))state.Text+="\n"+message.GetString();
    }
    private async void Run(Func<Task> work){try{await work();}catch(Exception error){notice(error.Message);state.Text=error.Message;}}
    private sealed record Choice(string Id,string Name);
}
