using System.Collections.ObjectModel;
using Windows.ApplicationModel.DataTransfer;
using Windows.System;
using Microsoft.UI.Xaml.Media;
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
    private readonly ListView volumes=new(){SelectionMode=ListViewSelectionMode.None,CanDragItems=true,CanReorderItems=true,AllowDrop=true};
    private readonly ObservableCollection<Grid> volumeRows=[];
    private Grid[]? draggingRows;
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
    private IEnumerable<CheckBox> Choices=>volumeRows.Select(row=>row.Children.OfType<CheckBox>().Single());
    public UIElement Options {get;}
    public void StopMonitoring()=>monitor.Dispose();
    public IndexMaintenanceView(ShellServices services)
    {
        this.services=services;
        order.AddRange(services.Preferences.Current.IndexVolumeOrder);
        foreach(var entry in services.Preferences.Current.IndexVolumeSelection)selection[entry.Key]=entry.Value;
        volumeHost.Content=volumes;
        volumes.ItemsSource=volumeRows;
        var itemStyle=new Style(typeof(ListViewItem)){BasedOn=(Style)Application.Current.Resources["DefaultListViewItemStyle"]};
        itemStyle.Setters.Add(new Setter(HorizontalContentAlignmentProperty,HorizontalAlignment.Stretch));
        itemStyle.Setters.Add(new Setter(PaddingProperty,new Thickness(0)));
        volumes.ItemContainerStyle=itemStyle;
        ScrollViewer.SetVerticalScrollBarVisibility(volumes,ScrollBarVisibility.Disabled);
        ScrollViewer.SetHorizontalScrollBarVisibility(volumes,ScrollBarVisibility.Disabled);
        volumes.DragItemsStarting+=(_,e)=>{
            if(!volumeHost.IsEnabled||e.Items.Count!=1){e.Cancel=true;return;}
            draggingRows=volumeRows.ToArray();e.Data.RequestedOperation=DataPackageOperation.Move;
        };
        volumes.DragOver+=(_,e)=>{if(draggingRows is null){e.AcceptedOperation=DataPackageOperation.None;e.Handled=true;}};
        volumes.DragItemsCompleted+=(_,e)=>{
            var before=draggingRows;draggingRows=null;if(before is null)return;
            if(e.DropResult!=DataPackageOperation.Move){RestoreRows(before);return;}
            Run(()=>SaveOrderAsync(before));
        };
        volumes.KeyDown+=(_,e)=>{
            var alt=Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Menu).HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down);
            if(!alt||draggingRows is not null||!volumeHost.IsEnabled||e.Key is not (VirtualKey.Up or VirtualKey.Down))return;
            var source=e.OriginalSource as DependencyObject;
            while(source is not null&&!(source is Grid candidate&&volumeRows.Contains(candidate)))source=VisualTreeHelper.GetParent(source);
            if(source is not Grid row)return;
            var from=volumeRows.IndexOf(row);var to=from+(e.Key==VirtualKey.Up?-1:1);
            if(to<0||to>=volumeRows.Count)return;
            e.Handled=true;var before=volumeRows.ToArray();volumeRows.Move(from,to);Run(()=>SaveOrderAsync(before));
        };
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
        if(updateVolumes&&draggingRows is null)
        {
            foreach(var choice in Choices)selection[(string)choice.Tag]=choice.IsChecked==true;
            foreach(var item in snapshot.Volumes)if(!order.Contains(item.VolumeId))order.Add(item.VolumeId);
            volumeRows.Clear();volumeText.Clear();
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
                var controls=new FontIcon{Glyph="\uE700",FontSize=14,Width=32,VerticalAlignment=VerticalAlignment.Center};
                L.Label(controls,"ui.sidebar.reorder");
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
                volumeRows.Add(row);
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
    private void RestoreRows(Grid[] rows)
    {if(volumeRows.SequenceEqual(rows))return;volumeRows.Clear();foreach(var row in rows)volumeRows.Add(row);}
    private async Task SaveOrderAsync(Grid[] before)
    {
        var next=volumeRows.Select(row=>(string)row.Tag).ToArray();
        var previous=before.Select(row=>(string)row.Tag).ToArray();
        if(next.SequenceEqual(previous))return;
        if(next.Length!=previous.Length||next.Distinct().Count()!=next.Length||!next.ToHashSet().SetEquals(previous)){RestoreRows(before);return;}
        try{await services.Preferences.UpdateAsync(value=>value with{IndexVolumeOrder=next});}
        catch{RestoreRows(before);throw;}
        order.Clear();order.AddRange(next);
    }
}
