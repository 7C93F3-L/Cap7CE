using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Localization;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using System.Text.Json;

namespace Cap7CE.WinUI.Controls;

internal sealed class MetadataMaintenanceView : UserControl
{
    private readonly ShellServices services;
    private readonly MetadataExclusionsView exclusions;
    private readonly TextBlock status=L.Text("ui.metadata.reading");
    private readonly TextBlock current=Ui.Text("",true),counts=Ui.Text("",true),error=Ui.Text("",true);
    private readonly ProgressBar progress=new(){Height=4,HorizontalAlignment=HorizontalAlignment.Stretch};
    private readonly StackPanel taskArea=Ui.Column();
    private readonly Button start,control,cancel,refresh;
    private MetadataPanelState? state;
    private bool listening,busy,reload;
    public UIElement Options {get;}
    public UIElement Details {get;}
    public MetadataMaintenanceView(ShellServices services,Window owner)
    {
        this.services=services;exclusions=new(services,owner);
        start=Action("ui.metadata.start",()=>MetadataBatchService.StartAsync(services,exclusions.Snapshot()));
        start.Style=(Style)Application.Current.Resources["AccentButtonStyle"];
        control=Action("ui.metadata.pause",()=>InvokeAsync(state?.CanResume==true?"resume":"pause"));
        cancel=Action("ui.metadata.cancel",()=>InvokeAsync("cancelDirectories"));
        refresh=Action("ui.metadata.refresh",()=>InvokeAsync("status"));
        L.Bind(cancel,ToolTipService.ToolTipProperty,"ui.metadata.cancelHint");

        current.TextWrapping=TextWrapping.NoWrap;current.TextTrimming=TextTrimming.CharacterEllipsis;
        taskArea.Children.Add(current);taskArea.Children.Add(progress);taskArea.Children.Add(counts);
        start.HorizontalAlignment=HorizontalAlignment.Right;
        var actions=new Grid {ColumnSpacing=24};
        actions.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});actions.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        exclusions.AddButton.HorizontalAlignment=HorizontalAlignment.Left;
        actions.Children.Add(exclusions.AddButton);
        var buttons=Scroll(Ui.Row(control,cancel,refresh,start));Grid.SetColumn(buttons,1);actions.Children.Add(buttons);
        actions.RowDefinitions.Add(new(){Height=GridLength.Auto});actions.RowDefinitions.Add(new(){Height=GridLength.Auto});
        actions.SizeChanged+=(_,_)=>{var narrow=actions.ActualWidth<560;Grid.SetRow(buttons,narrow?1:0);Grid.SetColumn(buttons,narrow?0:1);Grid.SetColumnSpan(buttons,narrow?2:1);actions.RowSpacing=narrow?8:0;};
        var heading=L.Text("ui.exclusions.title");heading.Style=(Style)Application.Current.Resources["CapSettingsSectionTitle"];
        var hint=L.Text("ui.exclusions.hint",true);
        var exclusionHeader=Ui.Column(heading,hint);exclusionHeader.Spacing=3;
        Options=Ui.Column(exclusionHeader,exclusions,actions);
        Content=status;Details=Ui.Column(taskArea,error);
        exclusions.Changed+=Render;exclusions.Failure+=text=>{L.Message(error,TextBlock.TextProperty,text);Render();};
        Loaded+=(_,_)=>{
            if(listening)return;listening=true;
            services.Metadata.Changed+=Changed;services.ConnectionChanged+=ConnectionChanged;services.IndexStatusChanged+=IndexChanged;
            if(Connected)Run(()=>InvokeAsync("status"));else Render();
        };
        Unloaded+=(_,_)=>{listening=false;services.Metadata.Changed-=Changed;services.ConnectionChanged-=ConnectionChanged;services.IndexStatusChanged-=IndexChanged;progress.IsIndeterminate=false;};
        Render();
    }
    private bool Connected=>services.Core?.IsConnected==true&&services.Core.Supports(MetadataBuildOperations.Attach);
    private static ScrollViewer Scroll(UIElement content)=>new(){Content=content,HorizontalScrollBarVisibility=ScrollBarVisibility.Auto,VerticalScrollBarVisibility=ScrollBarVisibility.Disabled};
    private Button Action(string title,Func<Task> work)=>L.Button(title,()=>Run(work));
    private async void Run(Func<Task> action)
    {
        if(busy)return;busy=true;L.Literal(error,TextBlock.TextProperty,"");Render();
        try{await action();}catch(Exception failure){L.Message(error,TextBlock.TextProperty,FailureText.From(failure));}
        finally{busy=false;if(listening){if(reload&&Connected){reload=false;Run(()=>InvokeAsync("status"));}else Render();}}
    }
    private async Task InvokeAsync(string operation)=>await services.Metadata.InvokeAsync(operation);
    private void Changed(JsonElement result,MetadataTaskStatus _)=>DispatcherQueue.TryEnqueue(()=>{
        if(!listening)return;state=MetadataPanelState.Read(result);L.Literal(error,TextBlock.TextProperty,"");Render();
    });
    private void IndexChanged(CatalogStatusResponse _)=>DispatcherQueue.TryEnqueue(()=>{if(listening)Render();});
    private void ConnectionChanged()=>DispatcherQueue.TryEnqueue(()=>{
        if(!listening)return;state=null;L.Literal(error,TextBlock.TextProperty,"");reload=Connected&&busy;
        if(Connected&&!busy)Run(()=>InvokeAsync("status"));else Render();
    });
    private void Render()
    {
        var connected=Connected;var ready=connected&&state is not null&&!busy;
        exclusions.SetBusy(busy);
        var volumes=services.Volumes.Where(volume=>volume.Selected&&volume.Queryable).Select(volume=>volume.DisplayName).ToArray();
        start.IsEnabled=ready&&!exclusions.Busy&&volumes.Length>0&&state?.CanPause!=true&&state?.Progress.Phase!="pausing"&&state?.Pending==0;
        L.Bind(control,Button.ContentProperty,MaintenanceText.ControlKey(state));control.IsEnabled=ready&&(state!.CanPause||state.CanResume);
        cancel.IsEnabled=ready&&state!.CanCancel;refresh.IsEnabled=connected&&!busy;
        control.Visibility=state is {} task&&(task.CanPause||task.CanResume||task.Progress.Phase=="pausing")?Visibility.Visible:Visibility.Collapsed;
        cancel.Visibility=state?.CanCancel==true?Visibility.Visible:Visibility.Collapsed;
        start.Visibility=state is {} active&&(active.CanPause||active.CanResume||active.CanCancel||active.Progress.Phase=="pausing")?Visibility.Collapsed:Visibility.Visible;
        L.Bind(status,TextBlock.TextProperty,!connected?"ui.metadata.disconnected":state is {} currentState?MaintenanceText.TitleKey(currentState):"ui.metadata.reading");
        status.Visibility=!connected||state is null||state.ShowTaskArea?Visibility.Visible:Visibility.Collapsed;
        taskArea.Visibility=connected&&state?.ShowTaskArea==true?Visibility.Visible:Visibility.Collapsed;
        if(state is {Directory:{} path} directoryState)L.Bind(current,TextBlock.TextProperty,directoryState.Pending>1?"ui.metadata.currentQueued":"ui.metadata.current",()=>new Dictionary<string,object?>{{"path",path},{"count",directoryState.Pending-1}});else L.Literal(current,TextBlock.TextProperty,"");
        current.Visibility=connected&&state?.Pending>0?Visibility.Visible:Visibility.Collapsed;ToolTipService.SetToolTip(current,state?.Directory);
        if(state is {} countState)L.Computed(counts,()=>MaintenanceText.Counts(countState,AppLanguage.Session));else L.Literal(counts,TextBlock.TextProperty,"");counts.Visibility=connected&&state?.ShowCounts==true?Visibility.Visible:Visibility.Collapsed;
        progress.Visibility=connected&&state?.ShowProgress==true?Visibility.Visible:Visibility.Collapsed;
        progress.Maximum=1;progress.Value=state?.Progress.Fraction??0;
        progress.IsIndeterminate=listening&&connected&&state?.CanPause==true&&state.Progress.Fraction is null;
        if(string.IsNullOrEmpty(error.Text)&&state?.Progress.ErrorCode is {} code)L.Computed(error,()=>MaintenanceText.Error(code,AppLanguage.Session));
        ToolTipService.SetToolTip(error,state?.Progress.ErrorCode);
        error.Visibility=connected&&!string.IsNullOrEmpty(error.Text)?Visibility.Visible:Visibility.Collapsed;
    }
}
