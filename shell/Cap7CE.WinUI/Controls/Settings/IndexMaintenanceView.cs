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
    private readonly Dictionary<string,bool> selection=[];
    private readonly List<string> order=[];
    private IEnumerable<CheckBox> Choices=>volumes.Children.OfType<Grid>().Select(row=>row.Children.OfType<CheckBox>().Single());
    public void StopMonitoring()=>monitor.Dispose();
    public IndexMaintenanceView(ShellServices services)
    {
        this.services=services;
        order.AddRange(services.Preferences.Current.IndexVolumeOrder);
        foreach(var entry in services.Preferences.Current.IndexVolumeSelection)selection[entry.Key]=entry.Value;
        volumeHost.Content=volumes;
        volumes.Spacing=4;
        volumeHost.Margin=new(0,8,0,12);
        var primary=Action("建立 / 更新",()=>BuildAsync(false));
        primary.Style=(Style)Application.Current.Resources["AccentButtonStyle"];
        primary.HorizontalAlignment=HorizontalAlignment.Right;
        var tools=Ui.Row(Action("刷新",DiscoverAsync),Action("停止",CancelAsync),Action("重建…",()=>BuildAsync(true)));
        var scroll=new ScrollViewer {Content=tools,HorizontalScrollBarVisibility=ScrollBarVisibility.Auto,VerticalScrollBarVisibility=ScrollBarVisibility.Disabled};
        var actions=new Grid {ColumnSpacing=24,RowSpacing=10};
        actions.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});actions.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        actions.Children.Add(scroll);Grid.SetColumn(primary,1);actions.Children.Add(primary);
        actions.SizeChanged+=(_,_)=>{var narrow=actions.ActualWidth<460;Grid.SetRow(primary,narrow?1:0);Grid.SetColumn(primary,narrow?0:1);};
        actions.RowDefinitions.Add(new(){Height=GridLength.Auto});actions.RowDefinitions.Add(new(){Height=GridLength.Auto});
        Content=Ui.Column(Ui.Text("按从上到下的顺序处理所选磁盘。",true),volumeHost,actions,status);
        Loaded+=(_,_)=>Run(ReadAsync);
        Unloaded+=(_,_)=>monitor.Dispose();
    }
    private CoreConnection Core=>services.Core??throw new IOException("Core尚未连接，请到“诊断 → 服务维护”中重新连接。");
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
        if(updateVolumes)
        {
            foreach(var choice in Choices)selection[(string)choice.Tag]=choice.IsChecked==true;
            foreach(var item in snapshot.Volumes)if(!order.Contains(item.VolumeId))order.Add(item.VolumeId);
            volumes.Children.Clear();
            var items=snapshot.Volumes.OrderBy(item=>order.IndexOf(item.VolumeId)).ToArray();
            foreach(var item in items)
            {
                var row=new Grid {ColumnSpacing=20,RowSpacing=6,Padding=new(0,4,0,4),Tag=item.VolumeId};
                row.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
                row.ColumnDefinitions.Add(new(){Width=new(140)});
                row.ColumnDefinitions.Add(new(){Width=new(165)});
                row.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
                row.RowDefinitions.Add(new(){Height=GridLength.Auto});
                row.RowDefinitions.Add(new(){Height=GridLength.Auto});
                var drive=Models.DrivePresentation.Read(item.DisplayName);
                var choice=new CheckBox {Content=drive.Name,IsChecked=selection.TryGetValue(item.VolumeId,out var chosen)?chosen:drive.IsSystem||item.Selected,Tag=item.VolumeId};
                choice.Content=new TextBlock {Text=drive.Name,TextTrimming=TextTrimming.CharacterEllipsis};
                choice.VerticalAlignment=VerticalAlignment.Center;
                var capacity=Ui.Text($"容量  {drive.Capacity}",true);
                var count=Ui.Text($"索引项  {item.Processed:N0}",true);
                capacity.VerticalAlignment=count.VerticalAlignment=VerticalAlignment.Center;
                Grid.SetColumn(capacity,1);Grid.SetColumn(count,2);
                row.Children.Add(capacity);row.Children.Add(count);
                ToolTipService.SetToolTip(choice,$"{item.FileSystem} · {item.State}");
                choice.Click+=(_,_)=>Run(async()=>{
                    foreach(var entry in Choices)selection[(string)entry.Tag]=entry.IsChecked==true;
                    await services.Preferences.SaveAsync(services.Preferences.Current with{IndexVolumeSelection=new(selection)});
                });
                row.Children.Add(choice);
                var up=Ui.Button("↑",()=>Move(row,-1));var down=Ui.Button("↓",()=>Move(row,1));
                ToolTipService.SetToolTip(up,"提前索引");ToolTipService.SetToolTip(down,"延后索引");
                up.IsEnabled=item!=items[0];down.IsEnabled=item!=items[^1];
                var controls=Ui.Row(up,down);controls.VerticalAlignment=VerticalAlignment.Center;
                Grid.SetColumn(controls,3);row.Children.Add(controls);
                row.SizeChanged+=(_,_)=>{
                    var narrow=row.ActualWidth<640;
                    row.ColumnDefinitions[1].Width=narrow?GridLength.Auto:new(140);
                    row.ColumnDefinitions[2].Width=narrow?new(0):new(165);
                    Grid.SetColumn(controls,narrow?1:3);Grid.SetColumnSpan(controls,narrow?3:1);
                    controls.HorizontalAlignment=HorizontalAlignment.Right;
                    Grid.SetRow(capacity,narrow?1:0);Grid.SetColumn(capacity,narrow?0:1);
                    capacity.Margin=narrow?new(28,0,0,0):new(0);
                    Grid.SetRow(count,narrow?1:0);Grid.SetColumn(count,narrow?1:2);Grid.SetColumnSpan(count,narrow?3:1);
                };
                volumes.Children.Add(row);
            }
        }
        foreach(var task in tasks.Where(t=>t.State!="running"))if(started.Remove(task.TaskId))services.Notify("索引任务："+task.State);
        status.Text=string.Join("\n",snapshot.Tasks.Select(t=>$"{t.Kind}：{t.State}"+(t.ErrorCode is null?"":" · "+t.ErrorCode)));
        var unavailable=snapshot.Volumes.Where(v=>v.Selected&&!v.Queryable).Select(v=>v.DisplayName).ToArray();
        if(unavailable.Length>0)status.Text+=(status.Text.Length>0?"\n":"")+string.Join("、",unavailable)+" 索引未就绪；可选择相应磁盘，点击“建立 / 更新”。";
        else if(status.Text.Length==0)status.Text=snapshot.Volumes.Count==0?"暂无磁盘，请刷新。":"索引就绪";
        await services.RefreshVolumesAsync();
    }
    private async Task BuildAsync(bool rebuild)
    {
        var ids=Choices.Where(b=>b.IsChecked==true).Select(b=>(string)b.Tag).ToArray();
        if(ids.Length==0)throw new IOException("请先选择磁盘。");
        var dialog=new ContentDialog {XamlRoot=XamlRoot,Title=rebuild?"重建索引":"建立/更新索引",
            Content=rebuild?"将重新读取所选磁盘并替换其索引。原文件不变；已有索引较大时可能耗时。":"将读取所选磁盘的文件名与目录信息；不会自动提取文件内容。",
            PrimaryButtonText="继续",CloseButtonText="取消",DefaultButton=rebuild?ContentDialogButton.Close:ContentDialogButton.Primary};
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
    private void Move(Grid row,int delta)=>Run(async()=>
    {
        var from=volumes.Children.IndexOf(row);var to=from+delta;
        if(to<0||to>=volumes.Children.Count)return;
        var next=volumes.Children.OfType<Grid>().Select(r=>(string)r.Tag).ToList();
        (next[from],next[to])=(next[to],next[from]);
        await services.Preferences.SaveAsync(services.Preferences.Current with{IndexVolumeOrder=next.ToArray()});
        order.Clear();order.AddRange(next);
        await ReadAsync();
    });
}
