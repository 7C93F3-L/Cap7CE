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
    // The native ProgressBar template uses MinHeight as its drawing surface height.
    private readonly ProgressBar progress=new(){Height=3,MinHeight=3,HorizontalAlignment=HorizontalAlignment.Stretch,VerticalAlignment=VerticalAlignment.Bottom,Visibility=Visibility.Collapsed};
    private readonly DispatcherQueueTimer delay,expiry;
    private bool busy,busyShown,disposed,pointerInside,showingNotice;
    private UiMessage? notice,commandNotice,fileTask;
    public void SetFileTask(UiMessage? text){fileTask=text;Render();}
    private bool commandCancellable;
    public event Action? ConfirmationCancelled;
    public void SetCommandConfirmation(UiMessage? text,bool cancellable=true){commandNotice=text;commandCancellable=cancellable;Render();}
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
        row.ColumnDefinitions.Add(new(){Width=new(22)});
        row.RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});row.RowDefinitions.Add(new(){Height=new(8)});
        close=new Button {Content="×",Width=22,Height=22,MinWidth=0,MinHeight=0,Padding=new(0),Style=(Style)Application.Current.Resources["CapToolButton"]};
        L.Label(close,"main.closeNotice");
        row.Children.Add(message);Grid.SetRow(progress,1);Grid.SetColumnSpan(progress,2);row.Children.Add(progress);Grid.SetColumn(close,1);row.Children.Add(close);
        Content=new Border {Style=(Style)Application.Current.Resources["CapWorkspaceNotice"],Child=row};
        delay=DispatcherQueue.CreateTimer();delay.IsRepeating=false;delay.Interval=TimeSpan.FromMilliseconds(300);
        delay.Tick+=(_,_)=>{if(!disposed&&busy){busyShown=true;Render();}};
        expiry=DispatcherQueue.CreateTimer();expiry.IsRepeating=false;expiry.Interval=TimeSpan.FromSeconds(5);
        expiry.Tick+=(_,_)=>{if(showingNotice&&!pointerInside){notice=null;Render();}};
        PointerEntered+=(_,_)=>{pointerInside=true;UpdateExpiry();};
        PointerExited+=(_,e)=>{
            var point=e.GetCurrentPoint(this).Position;
            if(point.X<0||point.X>=ActualWidth||point.Y<0||point.Y>=ActualHeight){pointerInside=false;UpdateExpiry();}
        };
        Unloaded+=(_,_)=>{pointerInside=false;expiry.Stop();};
        Loaded+=(_,_)=>Render();
        close.Click+=(_,_)=>{if(commandNotice is not null){ConfirmationCancelled?.Invoke();return;}if(task is not null){CancelTaskRequested?.Invoke();return;}notice=null;busyShown=false;delay.Stop();expiry.Stop();Render();};
    }

    public void SetBusy(bool value)
    {
        if(disposed||busy==value)return;
        busy=value;busyShown=false;delay.Stop();if(value)delay.Start();Render();
    }

    public void ShowMessage(UiMessage text)
    {
        if(disposed||string.IsNullOrWhiteSpace(text.Render(AppLanguage.Session))||notice?.Render(AppLanguage.Session)==text.Render(AppLanguage.Session))return;
        notice=text;expiry.Stop();Render();
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
        var currentCommand=fileTask??commandNotice;var cancellable=fileTask is null&&commandCancellable;
        var confirming=currentCommand is not null;
        var foregroundTask=!confirming&&task is not null;
        var background=!confirming&&!foregroundTask&&(indexTask is not null||metadataTask is not null);
        var backgroundText=indexTask??metadataTask;
        var fraction=indexTask is not null?indexFraction:metadataFraction;
        showingNotice=!confirming&&!foregroundTask&&!background&&notice is not null;
        var loading=!confirming&&!foregroundTask&&!background&&!showingNotice&&busyShown;
        Visibility=confirming||foregroundTask||background||showingNotice||loading?Visibility.Visible:Visibility.Collapsed;
        if((currentCommand??task??backgroundText??notice) is {} text){L.Computed(message,()=>text.Render(AppLanguage.Session));L.Bind(message,ToolTipService.ToolTipProperty,"ui.common.text",()=>new Dictionary<string,object?>{{"text",text.Render(AppLanguage.Session)}});}
        else {L.Bind(message,TextBlock.TextProperty,"main.querying");L.Literal(message,ToolTipService.ToolTipProperty,null);}
        progress.Visibility=foregroundTask||background||loading||confirming&&!cancellable?Visibility.Visible:Visibility.Collapsed;
        progress.Maximum=foregroundTask?taskMaximum:1;progress.Value=foregroundTask?taskValue:background?Math.Clamp(fraction??0,0,1):0;
        progress.IsIndeterminate=foregroundTask?taskIndeterminate:background?fraction is null:loading||confirming&&!cancellable;
        close.Visibility=background||confirming&&!cancellable?Visibility.Collapsed:Visibility.Visible;
        close.IsEnabled=confirming||!foregroundTask||!taskCancelling;
        L.Label(close,foregroundTask?"main.cancelRecognition":"main.closeNotice");
        UpdateExpiry();
    }
    private void UpdateExpiry()
    {
        if(disposed||!IsLoaded||!showingNotice||pointerInside){expiry.Stop();return;}
        // Repeated task snapshots do not restart an already visible message's timer.
        if(!expiry.IsRunning)expiry.Start();
    }

    public void Dispose(){disposed=true;delay.Stop();expiry.Stop();progress.IsIndeterminate=false;LanguageBinding.Clear(message,TextBlock.TextProperty);LanguageBinding.Clear(message,ToolTipService.ToolTipProperty);fileTask=commandNotice=notice=task=indexTask=metadataTask=null;ConfirmationCancelled=null;}
}
