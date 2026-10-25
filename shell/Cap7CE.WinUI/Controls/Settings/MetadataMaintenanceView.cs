using Cap7CE.Core.Protocol;
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
    private readonly TextBlock scope=Ui.Text("处理范围：读取中…",true);
    private readonly TextBlock status=Ui.Text("正在读取任务状态…");
    private readonly TextBlock current=Ui.Text("",true),counts=Ui.Text("",true),error=Ui.Text("",true);
    private readonly ProgressBar progress=new(){Height=4,HorizontalAlignment=HorizontalAlignment.Stretch};
    private readonly StackPanel taskArea=Ui.Column();
    private readonly Button start,control,cancel,refresh;
    private MetadataPanelState? state;
    private bool listening,busy,reload;
    public MetadataMaintenanceView(ShellServices services,Window owner)
    {
        this.services=services;exclusions=new(services,owner);
        start=Action("开始提取",()=>MetadataBatchService.StartAsync(services,exclusions.Snapshot()));
        start.Style=(Style)Application.Current.Resources["AccentButtonStyle"];
        control=Action("暂停",()=>InvokeAsync(state?.CanResume==true?"resume":"pause"));
        cancel=Action("取消队列",()=>InvokeAsync("cancelDirectories"));refresh=Action("刷新",()=>InvokeAsync("status"));
        ToolTipService.SetToolTip(cancel,"停止当前目录并清空排队目录，已提取的结果保留。");
        var tools=new Grid {ColumnSpacing=16};tools.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});tools.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        tools.Children.Add(Scroll(Ui.Row(control,cancel)));Grid.SetColumn(refresh,1);tools.Children.Add(refresh);
        current.TextWrapping=TextWrapping.NoWrap;current.TextTrimming=TextTrimming.CharacterEllipsis;
        taskArea.Children.Add(current);taskArea.Children.Add(progress);taskArea.Children.Add(counts);taskArea.Children.Add(tools);
        start.HorizontalAlignment=HorizontalAlignment.Right;
        var actions=new Grid {ColumnSpacing=24};
        actions.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});actions.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        exclusions.AddButton.HorizontalAlignment=HorizontalAlignment.Left;
        actions.Children.Add(exclusions.AddButton);Grid.SetColumn(start,1);actions.Children.Add(start);
        Content=Ui.Column(scope,exclusions,actions,status,taskArea,error);
        exclusions.Changed+=Render;exclusions.Failure+=text=>{error.Text=text;Render();};
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
    private Button Action(string title,Func<Task> work)=>Ui.Button(title,()=>Run(work));
    private async void Run(Func<Task> action)
    {
        if(busy)return;busy=true;error.Text="";Render();
        try{await action();}catch(Exception failure){error.Text=MetadataPanelState.DescribeError(failure.Message);}
        finally{busy=false;if(listening){if(reload&&Connected){reload=false;Run(()=>InvokeAsync("status"));}else Render();}}
    }
    private async Task InvokeAsync(string operation)=>await services.Metadata.InvokeAsync(operation);
    private void Changed(JsonElement result,MetadataTaskStatus _)=>DispatcherQueue.TryEnqueue(()=>{
        if(!listening)return;state=MetadataPanelState.Read(result);error.Text="";Render();
    });
    private void IndexChanged(CatalogStatusResponse _)=>DispatcherQueue.TryEnqueue(()=>{if(listening)Render();});
    private void ConnectionChanged()=>DispatcherQueue.TryEnqueue(()=>{
        if(!listening)return;state=null;error.Text="";reload=Connected&&busy;
        if(Connected&&!busy)Run(()=>InvokeAsync("status"));else Render();
    });
    private void Render()
    {
        var connected=Connected;var ready=connected&&state is not null&&!busy;
        exclusions.SetBusy(busy);
        var volumes=services.Volumes.Where(volume=>volume.Selected&&volume.Queryable).Select(volume=>volume.DisplayName).ToArray();
        scope.Text="提取磁盘："+(connected?(volumes.Length>0?string.Join("、",volumes):"暂无可用磁盘"):"等待连接");
        start.IsEnabled=ready&&!exclusions.Busy&&volumes.Length>0&&state?.CanPause!=true&&state?.Progress.Phase!="pausing"&&state?.Pending==0;
        control.Content=state?.ControlText??"暂停";control.IsEnabled=ready&&(state!.CanPause||state.CanResume);
        cancel.IsEnabled=ready&&state!.CanCancel;refresh.IsEnabled=connected&&!busy;
        status.Text=!connected?"元数据服务未连接或不可用，请到“诊断 → 服务维护”中重新连接。":state?.Title??"正在读取任务状态…";
        status.Visibility=!connected||state is null||state.ShowTaskArea?Visibility.Visible:Visibility.Collapsed;
        taskArea.Visibility=connected&&state?.ShowTaskArea==true?Visibility.Visible:Visibility.Collapsed;
        current.Text=state?.Directory is {} path?"当前目录："+path+(state.Pending>1?$" · 另有 {state.Pending-1} 个目录排队":""):"";
        current.Visibility=connected&&state?.Pending>0?Visibility.Visible:Visibility.Collapsed;ToolTipService.SetToolTip(current,state?.Directory);
        counts.Text=state?.Counts??"";counts.Visibility=connected&&state?.ShowCounts==true?Visibility.Visible:Visibility.Collapsed;
        progress.Visibility=connected&&state?.ShowProgress==true?Visibility.Visible:Visibility.Collapsed;
        progress.Maximum=1;progress.Value=state?.Progress.Fraction??0;
        progress.IsIndeterminate=listening&&connected&&state?.CanPause==true&&state.Progress.Fraction is null;
        if(string.IsNullOrEmpty(error.Text)&&state?.Progress.ErrorCode is {} code)error.Text=MetadataPanelState.DescribeError(code);
        ToolTipService.SetToolTip(error,state?.Progress.ErrorCode);
        error.Visibility=connected&&!string.IsNullOrEmpty(error.Text)?Visibility.Visible:Visibility.Collapsed;
    }
}
