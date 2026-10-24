using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;

internal sealed class WorkspaceNotice : UserControl, IDisposable
{
    private readonly TextBlock message=new(){TextTrimming=TextTrimming.CharacterEllipsis,VerticalAlignment=VerticalAlignment.Center,FontSize=12};
    private readonly ProgressBar progress=new(){Height=3,Width=120,VerticalAlignment=VerticalAlignment.Center,Visibility=Visibility.Collapsed};
    private readonly DispatcherQueueTimer delay,expiry;
    private bool busy,busyShown,disposed;
    private string? notice;
    private string? task;
    private string? indexTask;
    private double? indexFraction;
    private double taskValue,taskMaximum=1;
    private bool taskIndeterminate,taskCancelling;
    private readonly Button close;
    public event Action? CancelTaskRequested;

    public WorkspaceNotice()
    {
        Visibility=Visibility.Collapsed;
        HorizontalContentAlignment=HorizontalAlignment.Stretch;
        var row=new Grid {ColumnSpacing=10};row.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        row.ColumnDefinitions.Add(new(){Width=GridLength.Auto});row.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        close=new Button {Content="×",Width=22,Height=22,MinWidth=0,MinHeight=0,Padding=new(0),Style=(Style)Application.Current.Resources["CapToolButton"]};
        AutomationProperties.SetName(close,"关闭临时提醒");
        row.Children.Add(message);Grid.SetColumn(progress,1);row.Children.Add(progress);Grid.SetColumn(close,2);row.Children.Add(close);
        Content=new Border {Style=(Style)Application.Current.Resources["CapWorkspaceNotice"],Child=row};
        SizeChanged+=(_,_)=>progress.MaxWidth=Math.Max(0,ActualWidth*.22);
        delay=DispatcherQueue.CreateTimer();delay.IsRepeating=false;delay.Interval=TimeSpan.FromMilliseconds(300);
        delay.Tick+=(_,_)=>{if(!disposed&&busy){busyShown=true;Render();}};
        expiry=DispatcherQueue.CreateTimer();expiry.IsRepeating=false;expiry.Interval=TimeSpan.FromSeconds(5);
        expiry.Tick+=(_,_)=>{notice=null;Render();};
        close.Click+=(_,_)=>{if(task is not null){CancelTaskRequested?.Invoke();return;}notice=null;busyShown=false;delay.Stop();expiry.Stop();Render();};
    }

    public void SetBusy(bool value)
    {
        if(disposed||busy==value)return;
        busy=value;busyShown=false;delay.Stop();if(value)delay.Start();Render();
    }

    public void ShowMessage(string text)
    {
        if(disposed||string.IsNullOrWhiteSpace(text)||notice==text)return;
        notice=text;expiry.Stop();expiry.Start();Render();
    }
    public void SetTask(string text,int processed,int total,bool indeterminate,bool cancelling)
    {
        task=text;taskMaximum=Math.Max(1,total);taskValue=Math.Clamp(processed,0,taskMaximum);
        taskIndeterminate=indeterminate;taskCancelling=cancelling;Render();
    }
    public void ClearTask(){task=null;Render();}
    public void SetIndexTask(string? text,double? fraction=null){indexTask=text;indexFraction=fraction;Render();}

    private void Render()
    {
        if(disposed)return;
        var indexing=task is null&&indexTask is not null;
        var loading=notice is null&&busyShown;
        Visibility=task is not null||indexing||notice is not null||loading?Visibility.Visible:Visibility.Collapsed;
        message.Text=task??indexTask??notice??"正在查询…";ToolTipService.SetToolTip(message,task??indexTask??notice);
        progress.Visibility=task is not null||indexing||loading?Visibility.Visible:Visibility.Collapsed;
        progress.Maximum=task is not null?taskMaximum:1;progress.Value=task is not null?taskValue:indexing?Math.Clamp(indexFraction??0,0,1):0;
        progress.IsIndeterminate=task is not null?taskIndeterminate:indexing?indexFraction is null:loading;
        close.Visibility=indexing?Visibility.Collapsed:Visibility.Visible;
        close.IsEnabled=task is null||!taskCancelling;
        var closeLabel=task is not null?"取消识别":"关闭临时提醒";
        AutomationProperties.SetName(close,closeLabel);ToolTipService.SetToolTip(close,closeLabel);
    }

    public void Dispose(){disposed=true;delay.Stop();expiry.Stop();progress.IsIndeterminate=false;}
}
