using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Localization;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;

internal sealed class IndexMaintenanceView : UserControl
{
    private readonly ShellServices services;
    private readonly StackPanel volumes=Ui.Column();
    private readonly ContentControl volumeHost=new(){HorizontalContentAlignment=HorizontalAlignment.Stretch};
    private readonly TextBlock status=L.Text("ui.index.reading",true);
    private readonly TextBlock feedbackText=Ui.Text("",true);
    private readonly ProgressBar progress=new(){Minimum=0,Maximum=100,Height=3};
    private readonly StackPanel feedback=Ui.Column();
    private readonly Dictionary<string,(TextBlock Count,TextBlock State)> volumeText=[];
    private readonly List<Button> buttons=[];
    private void ShowStatus(Func<string> text)=>L.Computed(status,text);
    private string? observedTask;
    private bool listening;
    private CoreCatalogTaskStatus[] tasks=[];
    private readonly Controllers.VisibleTaskMonitor monitor=new();
    private readonly Dictionary<string,bool> selection=[];
    private readonly List<string> order=[];
    private IEnumerable<CheckBox> Choices=>volumes.Children.OfType<Grid>().Select(row=>row.Children.OfType<CheckBox>().Single());
    public UIElement Options {get;}
    public void StopMonitoring()=>monitor.Dispose();
    public IndexMaintenanceView(ShellServices services)
    {
        this.services=services;
        order.AddRange(services.Preferences.Current.IndexVolumeOrder);
        foreach(var entry in services.Preferences.Current.IndexVolumeSelection)selection[entry.Key]=entry.Value;
        volumeHost.Content=volumes;
        volumes.Spacing=4;
        volumeHost.Margin=new(0,8,0,12);
        status.TextWrapping=TextWrapping.NoWrap;status.TextTrimming=TextTrimming.CharacterEllipsis;status.MaxLines=1;
        feedback.Spacing=6;feedback.Visibility=Visibility.Collapsed;feedback.Children.Add(feedbackText);feedback.Children.Add(progress);
        feedbackText.IsTextSelectionEnabled=true;
        var primary=Action("ui.index.build",()=>BuildAsync(false));
        primary.Style=(Style)Application.Current.Resources["AccentButtonStyle"];
        primary.HorizontalAlignment=HorizontalAlignment.Right;
        var tools=Ui.Row(Action("ui.index.refresh",DiscoverAsync),Action("ui.index.stop",CancelAsync),Action("ui.index.rebuild",()=>BuildAsync(true)));
        var scroll=new ScrollViewer {Content=tools,HorizontalScrollBarVisibility=ScrollBarVisibility.Auto,VerticalScrollBarVisibility=ScrollBarVisibility.Disabled};
        var actions=new Grid {ColumnSpacing=24,RowSpacing=10};
        actions.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});actions.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        actions.Children.Add(scroll);Grid.SetColumn(primary,1);actions.Children.Add(primary);
        actions.SizeChanged+=(_,_)=>{var narrow=actions.ActualWidth<460;Grid.SetRow(primary,narrow?1:0);Grid.SetColumn(primary,narrow?0:1);};
        actions.RowDefinitions.Add(new(){Height=GridLength.Auto});actions.RowDefinitions.Add(new(){Height=GridLength.Auto});
        Options=Ui.Column(L.Text("ui.index.orderHint",true),volumeHost,feedback,actions);
        Content=status;
        Loaded+=(_,_)=>{
            if(listening)return;listening=true;services.ConnectionChanged+=ConnectionChanged;ReadConnection();
        };
        Unloaded+=(_,_)=>{listening=false;services.ConnectionChanged-=ConnectionChanged;monitor.Dispose();};
    }
    private void ConnectionChanged()=>DispatcherQueue.TryEnqueue(()=>{if(listening)ReadConnection();});
    private void ReadConnection()
    {
        if(services.Core?.IsConnected==true){Run(services.Core.Supports(CoreOperations.VolumeList)?DiscoverAsync:ReadAsync);return;}
        monitor.Dispose();foreach(var button in buttons)button.IsEnabled=false;volumeHost.IsEnabled=false;
        ShowStatus(()=>AppLanguage.Text("ui.index.connecting"));
    }
    private CoreConnection Core=>services.Core??throw new IOException("index-ui-disconnected");
    private Button Action(string title,Func<Task> action)
    {var button=L.Button(title,()=>Run(action));buttons.Add(button);return button;}
    private async void Run(Func<Task> action)
    {
        foreach(var b in buttons)b.IsEnabled=false;volumeHost.IsEnabled=false;
        try{await action();}catch(Exception e){ShowFailure(e);}
        finally{var connected=services.Core?.IsConnected==true;foreach(var b in buttons)b.IsEnabled=connected;volumeHost.IsEnabled=connected;}
    }
    private void ShowFailure(Exception error)
    {
        NativeDiagnostics.CoreFailure(error.ToString());
        var message=UiMessage.Key("ui.index.actionFailed",new Dictionary<string,object?>{{"error",FailureText.From(error)}});
        ShowStatus(()=>AppLanguage.Text("ui.index.state.failed"));
        feedback.Visibility=Visibility.Visible;progress.Visibility=Visibility.Collapsed;
        L.Message(feedbackText,TextBlock.TextProperty,message);
    }
    private async Task DiscoverAsync()
    {
        if(!Core.Supports(CoreOperations.VolumeList))throw new IOException("index-ui-isolated");
        await Core.RequestAsync<VolumeListResponse>(CoreOperations.VolumeList,new{},deadlineMs:30000);await ReadAsync();
    }
    private async Task ReadAsync()
    {
        await ReadSnapshotAsync(true);
        if(tasks.Any(t=>t.State=="running"))monitor.Start(async token=>{await ReadSnapshotAsync(false,token);return tasks.Any(t=>t.State=="running");},ShowFailure);
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
            volumes.Children.Clear();volumeText.Clear();
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
                var choice=new CheckBox {Content=drive.Name,IsChecked=selection.TryGetValue(item.VolumeId,out var chosen)?chosen:true,Tag=item.VolumeId};
                var caption=new TextBlock{Text=drive.Name,TextTrimming=TextTrimming.CharacterEllipsis};choice.Content=caption;
                if(drive.UsesDefaultName)L.Bind(caption,TextBlock.TextProperty,"ui.drive.defaultName",()=>new Dictionary<string,object?>{{"drive",(Path.GetPathRoot(item.DisplayName)??item.DisplayName).TrimEnd('\\','/')}});
                choice.VerticalAlignment=VerticalAlignment.Center;
                var capacity=L.Text("ui.index.capacity",true,()=>new Dictionary<string,object?>{{"size",drive.CapacityAvailable?drive.Capacity:AppLanguage.Text("ui.drive.unavailable")}});
                var count=L.Text("ui.index.items",true,()=>new Dictionary<string,object?>{{"count",item.Processed}});
                var state=L.Text(MaintenanceText.VolumeStateKey(item.State),true);state.FontSize=12;
                var information=Ui.Column(count,state);information.Spacing=2;information.VerticalAlignment=VerticalAlignment.Center;
                volumeText[item.VolumeId]=(count,state);
                capacity.VerticalAlignment=count.VerticalAlignment=VerticalAlignment.Center;
                Grid.SetColumn(capacity,1);Grid.SetColumn(information,2);
                row.Children.Add(capacity);row.Children.Add(information);
                L.Bind(choice,ToolTipService.ToolTipProperty,"ui.index.volumeInfo",()=>new Dictionary<string,object?>{{"fileSystem",item.FileSystem},{"state",AppLanguage.Text(MaintenanceText.VolumeStateKey(item.State))}});
                choice.Click+=(_,_)=>Run(async()=>{
                    foreach(var entry in Choices)selection[(string)entry.Tag]=entry.IsChecked==true;
                    await services.Preferences.SaveAsync(services.Preferences.Current with{IndexVolumeSelection=new(selection)});
                });
                row.Children.Add(choice);
                var up=Ui.Button("",()=>Move(row,-1));var down=Ui.Button("",()=>Move(row,1));
                up.Content=new FontIcon{Glyph="\uE74A",FontSize=16};down.Content=new FontIcon{Glyph="\uE74B",FontSize=16};
                up.Width=down.Width=32;up.Height=down.Height=32;up.Padding=down.Padding=new(0);
                L.Label(up,"ui.index.earlier");L.Label(down,"ui.index.later");
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
                    Grid.SetRow(information,narrow?1:0);Grid.SetColumn(information,narrow?1:2);Grid.SetColumnSpan(information,narrow?3:1);
                };
                volumes.Children.Add(row);
            }
        }
        foreach(var volume in snapshot.Volumes)if(volumeText.TryGetValue(volume.VolumeId,out var text)){
            L.Bind(text.Count,TextBlock.TextProperty,"ui.index.items",()=>new Dictionary<string,object?>{{"count",volume.Processed}});
            L.Bind(text.State,TextBlock.TextProperty,volume.NeedsRebuild?"ui.index.volume.needsRebuild":
                !volume.Selected&&volume.State=="ready"?"ui.index.volume.disabled":MaintenanceText.VolumeStateKey(volume.State));
        }
        var running=snapshot.Tasks.FirstOrDefault(t=>t.State=="running");
        if(running is not null)observedTask=running.TaskId;
        ShowStatus(()=>running is not null?AppLanguage.Text(MaintenanceText.TaskKindKey(running.Kind))+"…":
            snapshot.Volumes.Count==0?AppLanguage.Text("ui.index.noVolumes"):
            AppLanguage.Text("ui.index.summary",new Dictionary<string,object?>{{"ready",snapshot.Volumes.Count(v=>v.Queryable)},{"total",snapshot.Volumes.Count}}));
        var tracked=snapshot.Tasks.FirstOrDefault(t=>t.TaskId==observedTask);
        feedback.Visibility=tracked is null?Visibility.Collapsed:Visibility.Visible;
        progress.Visibility=running is null?Visibility.Collapsed:Visibility.Visible;
        if(running is not null){
            var p=snapshot.Preparation;progress.IsIndeterminate=p?.Fraction is null;progress.Value=Math.Clamp(p?.Fraction??0,0,1)*100;
            L.Computed(feedbackText,()=>p is null?AppLanguage.Text(MaintenanceText.TaskKindKey(running.Kind)):
                AppLanguage.Text("ui.progress.indexDetails",new Dictionary<string,object?>{
                    {"stage",AppLanguage.Text(ProgressText.IndexStageKey(p.Stage))},{"drive",p.Drive},{"count",p.Processed}}));
        }else if(tracked is not null)L.Computed(feedbackText,()=>AppLanguage.Text("ui.index.taskStatus",new Dictionary<string,object?>{
            {"kind",AppLanguage.Text(MaintenanceText.TaskKindKey(tracked.Kind))},{"state",AppLanguage.Text(MaintenanceText.TaskStateKey(tracked.State))}})+
            (tracked.ErrorCode is null?"":" · "+AppLanguage.Text("ui.index.actionFailed",new Dictionary<string,object?>{{"error",MaintenanceText.Error(tracked.ErrorCode,AppLanguage.Session)}})));
        await services.RefreshVolumesAsync();
    }
    private async Task BuildAsync(bool rebuild)
    {
        var ids=Choices.Where(b=>b.IsChecked==true).Select(b=>(string)b.Tag).ToArray();
        if(ids.Length==0)throw new IOException("index-ui-no-volumes");
        var dialog=L.Dialog(XamlRoot,rebuild?"ui.index.rebuildTitle":"ui.index.buildTitle",rebuild?"ui.index.rebuildDescription":"ui.index.buildDescription","ui.index.continue",
            rebuild?ContentDialogButton.Close:ContentDialogButton.Primary);
        if(await dialog.ShowAsync()!=ContentDialogResult.Primary)return;
        var reply=await IndexBuildActions.StartAsync(services,ids,rebuild);
        if(reply.Accepted)observedTask=reply.TaskId;
        await ReadAsync();
    }
    private async Task CancelAsync()
    {
        foreach(var task in tasks.Where(t=>t.State is not ("completed" or "cancelled" or "failed"))){
            services.TaskNotices.Forget("index",task.TaskId);
            await Core.RequestAsync<CatalogCancelResponse>(CoreOperations.CatalogCancel,new CatalogCancelRequest(task.TaskId));
        }
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
