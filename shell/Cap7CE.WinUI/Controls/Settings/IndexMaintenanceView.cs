using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;

internal sealed class IndexMaintenanceView : UserControl
{
    private readonly ShellServices services;
    private readonly StackPanel volumes=Ui.Column();
    private readonly ContentControl volumeHost=new(){HorizontalContentAlignment=HorizontalAlignment.Stretch};
    private readonly TextBlock status=Ui.Text("读取索引状态…",true);
    private readonly List<Button> buttons=[];
    private CoreCatalogTaskStatus[] tasks=[];
    private readonly Controllers.VisibleTaskMonitor monitor=new();
    private readonly HashSet<string> started=[];
    public void StopMonitoring()=>monitor.Dispose();
    public IndexMaintenanceView(ShellServices services)
    {
        this.services=services;
        volumeHost.Content=volumes;
        var tools=Ui.Row(Action("发现磁盘",DiscoverAsync),Action("建立/更新索引",()=>BuildAsync(false)),Action("重建所选索引",()=>BuildAsync(true)),Action("停止",CancelAsync),Action("刷新状态",ReadAsync));
        var scroll=new ScrollViewer {Content=tools,HorizontalScrollBarVisibility=ScrollBarVisibility.Auto,VerticalScrollBarVisibility=ScrollBarVisibility.Disabled};
        Content=Ui.Column(Ui.Text("选择需要检索的磁盘后建立索引。重建会替换所选磁盘的索引；不会删除源文件。",true),volumeHost,scroll,status);
        Loaded+=(_,_)=>Run(ReadAsync);
        Unloaded+=(_,_)=>monitor.Dispose();
    }
    private CoreConnection Core=>services.Core??throw new IOException("Core尚未连接，请在上方重新连接。");
    private Button Action(string title,Func<Task> action)
    {var button=Ui.Button(title,()=>Run(action));buttons.Add(button);return button;}
    private async void Run(Func<Task> action)
    {
        foreach(var b in buttons)b.IsEnabled=false;volumeHost.IsEnabled=false;
        try{await action();}catch(Exception e){status.Text=e.Message+"\n索引服务未安装或未授权时，请先完成Reader服务安装；不要以管理员身份运行整个界面。";}
        finally{foreach(var b in buttons)b.IsEnabled=true;volumeHost.IsEnabled=true;}
    }
    private async Task DiscoverAsync()
    {
        if(!Core.Supports(CoreOperations.VolumeList))throw new IOException("此会话为隔离查询模式，不提供索引维护。");
        await Core.RequestAsync<VolumeListResponse>(CoreOperations.VolumeList,new{},deadlineMs:30000);await ReadAsync();
    }
    private async Task ReadAsync()
    {
        await ReadSnapshotAsync(true);
        if(tasks.Any(t=>t.State=="running"))monitor.Start(async token=>{await ReadSnapshotAsync(false,token);return tasks.Any(t=>t.State=="running");},e=>status.Text=e.Message);
    }
    private async Task ReadSnapshotAsync(bool updateVolumes,CancellationToken token=default)
    {
        var snapshot=await Core.RequestAsync<CatalogStatusResponse>(CoreOperations.CatalogStatus,new{},token);
        token.ThrowIfCancellationRequested();
        tasks=snapshot.Tasks.ToArray();
        if(updateVolumes){volumes.Children.Clear();foreach(var item in snapshot.Volumes)volumes.Children.Add(new CheckBox {Content=$"{item.DisplayName} · {item.FileSystem} · {item.State} · {item.Processed:N0}",IsChecked=item.Selected,Tag=item.VolumeId});}
        foreach(var task in tasks.Where(t=>t.State!="running"))if(started.Remove(task.TaskId))services.Notify("索引任务："+task.State);
        status.Text=string.Join("\n",snapshot.Tasks.Select(t=>$"{t.Kind}：{t.State}"+(t.ErrorCode is null?"":" · "+t.ErrorCode)));
        if(status.Text.Length==0)status.Text=snapshot.Volumes.Count==0?"尚无磁盘索引，点击“发现磁盘”开始。":"索引就绪。磁盘选择仅在建立/更新时保存。";
        await services.RefreshVolumesAsync();
    }
    private async Task BuildAsync(bool rebuild)
    {
        var ids=volumes.Children.OfType<CheckBox>().Where(b=>b.IsChecked==true).Select(b=>(string)b.Tag).ToArray();
        if(ids.Length==0)throw new IOException("请先选择磁盘。");
        var dialog=new ContentDialog {XamlRoot=XamlRoot,Title=rebuild?"重建索引":"建立/更新索引",
            Content=rebuild?"将重新读取所选磁盘并替换其索引。原文件不变；已有索引较大时可能耗时。":"将读取所选磁盘的文件名与目录信息；不会自动提取文件内容。",
            PrimaryButtonText="继续",CloseButtonText="取消",DefaultButton=ContentDialogButton.Close};
        if(await dialog.ShowAsync()!=ContentDialogResult.Primary)return;
        await Core.RequestAsync<VolumeSelectionResponse>(CoreOperations.VolumeSelection,new VolumeSelectionRequest(ids));
        var reply=await Core.RequestAsync<CatalogBuildResponse>(rebuild?CoreOperations.CatalogRebuild:CoreOperations.CatalogBuild,new CatalogBuildRequest(ids));
        if(reply.Accepted)started.Add(reply.TaskId);
        await ReadAsync();status.Text=$"任务已接受：{reply.TaskId}\n"+status.Text;
    }
    private async Task CancelAsync()
    {
        foreach(var task in tasks.Where(t=>t.State is not ("completed" or "cancelled" or "failed")))
            await Core.RequestAsync<CatalogCancelResponse>(CoreOperations.CatalogCancel,new CatalogCancelRequest(task.TaskId));
        await ReadAsync();
    }
}
