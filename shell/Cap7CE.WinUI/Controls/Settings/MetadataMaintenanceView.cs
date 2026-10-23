using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Storage.Pickers;
using System.Text.Json;

namespace Cap7CE.WinUI.Controls;

internal sealed class MetadataMaintenanceView : UserControl
{
    private readonly ShellServices services;
    private readonly Window owner;
    private readonly TextBox directory=new(){PlaceholderText="选择目录",MinWidth=160};
    private readonly TextBlock status=Ui.Text("暂无任务信息",true);
    private readonly List<Button> buttons=[];
    private readonly Controllers.VisibleTaskMonitor monitor=new();
    public void SetDirectory(string path)=>directory.Text=path;
    public void StopMonitoring()=>monitor.Dispose();
    public MetadataMaintenanceView(ShellServices services,Window owner)
    {
        this.services=services;this.owner=owner;
        var browse=Action("选择目录",ChooseAsync);
        var path=new Grid {ColumnSpacing=8};path.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});path.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        path.Children.Add(directory);Grid.SetColumn(browse,1);path.Children.Add(browse);
        var tools=Ui.Row(Action("提取目录",()=>StartAsync(false)),Action("提取已索引磁盘",()=>StartAsync(true)),
            Action("暂停",()=>InvokeAsync("pause")),Action("继续",()=>InvokeAsync("resume")),Action("取消队列",()=>InvokeAsync("cancelDirectories")),Action("刷新",()=>InvokeAsync("status")));
        Content=Ui.Column(path,
            new ScrollViewer {Content=tools,HorizontalScrollBarVisibility=ScrollBarVisibility.Auto,VerticalScrollBarVisibility=ScrollBarVisibility.Disabled},status);
        Unloaded+=(_,_)=>monitor.Dispose();
    }
    private Button Action(string title,Func<Task> work)
    {var button=Ui.Button(title,()=>Run(work));buttons.Add(button);return button;}
    private async void Run(Func<Task> action)
    {
        foreach(var button in buttons)button.IsEnabled=false;
        try{await action();}catch(Exception error){status.Text=error.Message;}
        finally{foreach(var button in buttons)button.IsEnabled=true;}
    }
    private async Task ChooseAsync()
    {
        var picker=new FolderPicker();picker.FileTypeFilter.Add("*");WinRT.Interop.InitializeWithWindow.Initialize(picker,WinRT.Interop.WindowNative.GetWindowHandle(owner));
        if(await picker.PickSingleFolderAsync() is {} folder)directory.Text=folder.Path;
    }
    private async Task StartAsync(bool all)
    {
        var path=directory.Text.Trim();if(!all&&!Directory.Exists(path))throw new IOException("请选择存在的本地目录。");
        var dialog=new ContentDialog {XamlRoot=XamlRoot,Title="开始属性提取",Content=all?"读取全部已索引磁盘的文件内容并保存属性？此范围可能很大。":$"读取此目录及子目录的文件内容并保存属性？\n{path}",
            PrimaryButtonText="开始提取",CloseButtonText="取消",DefaultButton=ContentDialogButton.Close};
        if(await dialog.ShowAsync()!=ContentDialogResult.Primary)return;
        var result=await services.Metadata.InvokeAsync(all?"startAllVolumes":"startDirectory",all?new{allowMetadataExtraction=true}:(object)new{path,allowMetadataExtraction=true});Show(result);
    }
    private async Task InvokeAsync(string operation)=>Show(await services.Metadata.InvokeAsync(operation));
    private void Show(JsonElement result)
    {
        var progress=result.GetProperty("progress");
        var phase=progress.GetProperty("phase").GetString();
        monitor.Dispose();
        if(services.Metadata.ActiveThisSession&&phase is not ("idle" or "completed" or "paused" or "failed"))monitor.Start(async token=>{
            var snapshot=await services.Metadata.InvokeAsync("status",token:token);token.ThrowIfCancellationRequested();Display(snapshot);
            return snapshot.GetProperty("progress").GetProperty("phase").GetString() is not ("idle" or "completed" or "paused" or "failed");
        },e=>status.Text=e.Message);
        Display(result);
    }
    private void Display(JsonElement result)
    {
        var progress=result.GetProperty("progress");
        status.Text=$"状态：{progress.GetProperty("phase").GetString()}\n已发现：{progress.GetProperty("discovered")} · 已处理：{progress.GetProperty("processed")} · 失败：{progress.GetProperty("failed")}";
        if(progress.TryGetProperty("errorCode",out var error)&&error.ValueKind==JsonValueKind.String)status.Text+="\n"+error.GetString();
        if(result.TryGetProperty("directoryTask",out var task))status.Text+=$"\n{task.GetProperty("path").GetString()} · 待处理目录 {task.GetProperty("pending")}";
    }
}
