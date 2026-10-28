using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Localization;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;

internal sealed class WorkspaceNotice : UserControl, IDisposable
{
    private readonly TextBlock message=new(){TextTrimming=TextTrimming.CharacterEllipsis,VerticalAlignment=VerticalAlignment.Center,FontSize=12};
    private readonly ProgressBar progress=new(){Height=3,Width=120,VerticalAlignment=VerticalAlignment.Center,Visibility=Visibility.Collapsed};
    private readonly DispatcherQueueTimer delay,expiry;
    private bool busy,busyShown,disposed;
    private UiMessage? notice;
    private UiMessage? task;
    private UiMessage? indexTask;
    private double? indexFraction;
    private UiMessage? metadataTask;
    private double? metadataFraction;
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
        L.Label(close,"main.closeNotice");
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

    public void ShowMessage(UiMessage text)
    {
        if(disposed||string.IsNullOrWhiteSpace(text.Render(AppLanguage.Session))||notice?.Render(AppLanguage.Session)==text.Render(AppLanguage.Session))return;
        notice=text;expiry.Stop();expiry.Start();Render();
    }
    public void SetTask(UiMessage text,int processed,int total,bool indeterminate,bool cancelling)
    {
        task=text;taskMaximum=Math.Max(1,total);taskValue=Math.Clamp(processed,0,taskMaximum);
        taskIndeterminate=indeterminate;taskCancelling=cancelling;Render();
    }
    public void ClearTask(){task=null;Render();}
    public void SetIndexTask(UiMessage? text,double? fraction=null){indexTask=text;indexFraction=fraction;Render();}
    public void SetMetadataTask(UiMessage? text,double? fraction=null){metadataTask=text;metadataFraction=fraction;Render();}

    private void Render()
    {
        if(disposed)return;
        var background=task is null&&(indexTask is not null||metadataTask is not null);
        var backgroundText=indexTask??metadataTask;
        var fraction=indexTask is not null?indexFraction:metadataFraction;
        var loading=notice is null&&busyShown;
        Visibility=task is not null||background||notice is not null||loading?Visibility.Visible:Visibility.Collapsed;
        if((task??backgroundText??notice) is {} text){L.Computed(message,()=>text.Render(AppLanguage.Session));L.Bind(message,ToolTipService.ToolTipProperty,"ui.common.text",()=>new Dictionary<string,object?>{{"text",text.Render(AppLanguage.Session)}});}
        else {L.Bind(message,TextBlock.TextProperty,"main.querying");L.Literal(message,ToolTipService.ToolTipProperty,null);}
        progress.Visibility=task is not null||background||loading?Visibility.Visible:Visibility.Collapsed;
        progress.Maximum=task is not null?taskMaximum:1;progress.Value=task is not null?taskValue:background?Math.Clamp(fraction??0,0,1):0;
        progress.IsIndeterminate=task is not null?taskIndeterminate:background?fraction is null:loading;
        close.Visibility=background?Visibility.Collapsed:Visibility.Visible;
        close.IsEnabled=task is null||!taskCancelling;
        L.Label(close,task is not null?"main.cancelRecognition":"main.closeNotice");
    }

    public void Dispose(){disposed=true;delay.Stop();expiry.Stop();progress.IsIndeterminate=false;LanguageBinding.Clear(message,TextBlock.TextProperty);LanguageBinding.Clear(message,ToolTipService.ToolTipProperty);notice=task=indexTask=metadataTask=null;}
}
