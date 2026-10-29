using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Localization;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
namespace Cap7CE.WinUI.Controls;

// Local tag/input draft. Only an explicit Save invokes the supplied writer.
internal sealed class DetailsKeywordEditor:UserControl
{
    private readonly Func<IReadOnlyList<AssetItem>,CancellationToken,Task<KeywordSelectionSnapshot<AssetItem>>> read;
    private readonly Func<KeywordSelectionSnapshot<AssetItem>,string[],CancellationToken,Task<KeywordSelectionSaveResult<AssetItem>>> write;
    private readonly Action<UiMessage> notice;
    private readonly DetailsCard card=new("ui.keywords.add",true);
    private readonly KeywordDraft draft=new();
    private readonly KeywordWrapPanel tags=new();
    private readonly TextBlock empty=L.Text("ui.keywords.empty",true),status=Ui.Text("",true);
    private readonly TextBox input=new(){AcceptsReturn=true,TextWrapping=TextWrapping.Wrap,MinHeight=56,MaxHeight=100,CornerRadius=new(6),FontSize=12};
    private readonly Grid actions=new(){ColumnSpacing=6,RowSpacing=6};
    private readonly StackPanel editorActions;
    private readonly Button retry,save,cancel,clear,automatic;
    private CancellationTokenSource pending=new();
    private IReadOnlyList<AssetItem> items=[];
    private KeywordSelectionSnapshot<AssetItem> snapshot=new([],[]);
    private bool ready,saving,focusRequested,readFailed,automaticBusy,refreshPending;
    public DetailsKeywordEditor(Func<IReadOnlyList<AssetItem>,CancellationToken,Task<KeywordSelectionSnapshot<AssetItem>>> read,Func<KeywordSelectionSnapshot<AssetItem>,string[],CancellationToken,Task<KeywordSelectionSaveResult<AssetItem>>> write,Action<UiMessage> notice,Action<IReadOnlyList<AssetItem>> generate)
    {
        this.read=read;this.write=write;this.notice=notice;L.Bind(input,TextBox.PlaceholderTextProperty,"ui.keywords.placeholder");
        retry=L.Button("ui.keywords.reload",()=>{draft.Cancel();input.Text="";_=ReadAsync();});
        L.Bind(retry,ToolTipService.ToolTipProperty,"ui.keywords.reloadHint");
        automatic=Ui.Button("",()=>{if(items.Count>0&&!draft.Dirty){var target=items;generate(target);}});
        var automaticLabel=L.Text("ui.keywords.automatic");automaticLabel.VerticalAlignment=VerticalAlignment.Center;automaticLabel.TextWrapping=TextWrapping.NoWrap;
        var automaticIcon=AiActionIcon.Attach(automatic,14);automaticIcon.VerticalAlignment=VerticalAlignment.Center;
        var automaticContent=Ui.Row(automaticIcon,automaticLabel);automaticContent.Spacing=5;automatic.Content=automaticContent;
        L.Bind(automatic,Microsoft.UI.Xaml.Automation.AutomationProperties.NameProperty,"ui.keywords.automatic");
        save=L.Button("ui.keywords.save",()=>_=SaveAsync());cancel=L.Button("common.cancel",CancelDraft);
        clear=L.Button("ui.keywords.clear",()=>{draft.Clear();input.Text="";L.Literal(status,TextBlock.TextProperty,"");RenderTags();Show();});
        editorActions=Ui.Row(clear,cancel,save);editorActions.Spacing=4;
        actions.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});actions.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        actions.RowDefinitions.Add(new(){Height=GridLength.Auto});actions.RowDefinitions.Add(new(){Height=GridLength.Auto});
        automatic.HorizontalAlignment=HorizontalAlignment.Right;Grid.SetColumn(automatic,1);actions.Children.Add(editorActions);actions.Children.Add(automatic);
        actions.SizeChanged+=(_,_)=>{var narrow=actions.ActualWidth<210;Grid.SetRow(automatic,narrow?1:0);Grid.SetColumn(automatic,narrow?0:1);Grid.SetColumnSpan(editorActions,narrow?2:1);};
        foreach(var button in new[]{automatic,retry,clear,save,cancel}){button.MinWidth=0;button.FontSize=12;button.Padding=new(8,4,8,4);}
        input.TextChanged+=(_,_)=>{draft.Input=input.Text;Show();};
        input.KeyDown+=(_,e)=>{if(e.Key==Windows.System.VirtualKey.Escape&&!saving&&draft.Dirty){e.Handled=true;CancelDraft();}};
        card.Body.Children.Add(tags);card.Body.Children.Add(empty);card.Body.Children.Add(input);card.Body.Children.Add(actions);card.Body.Children.Add(status);card.Body.Children.Add(retry);
        Content=card;Show();
    }
    public void SetItems(IReadOnlyList<AssetItem> value)
    {
        Stop();items=value.Where(item=>!item.Entry.IsDirectory).ToArray();snapshot=new([],[]);draft.Reset([]);ready=saving=focusRequested=readFailed=refreshPending=false;
        L.Literal(status,ToolTipService.ToolTipProperty,null);L.Bind(status,TextBlock.TextProperty,items.Count==0?"ui.keywords.unavailable":"ui.keywords.reading");input.Text="";RenderTags();Show();
    }
    public void RequestEdit(){focusRequested=true;if(ready){focusRequested=false;input.Focus(FocusState.Programmatic);}}
    public void SetAutomaticBusy(bool value){automaticBusy=value;Show();}
    public async Task ReadAsync()
    {
        if(items.Count==0)return;var target=items;
        if(saving){refreshPending=true;return;}
        if(draft.Dirty){refreshPending=true;return;}
        pending.Cancel();pending.Dispose();pending=new();var token=pending.Token;
        ready=readFailed=false;L.Literal(status,ToolTipService.ToolTipProperty,null);L.Bind(status,TextBlock.TextProperty,"ui.keywords.reading");Show();
        try {
            var result=await read(target,token);
            if(token.IsCancellationRequested||!ReferenceEquals(items,target))return;
            snapshot=result;draft.Reset(result.Words);input.Text="";ready=true;refreshPending=false;L.Literal(status,TextBlock.TextProperty,"");RenderTags();Show();
            if(focusRequested){focusRequested=false;input.Focus(FocusState.Programmatic);}
        }
        catch(OperationCanceledException){}
        catch(Exception error){if(!token.IsCancellationRequested&&ReferenceEquals(items,target)){readFailed=true;L.Bind(status,TextBlock.TextProperty,"ui.keywords.readFailed");L.Message(status,ToolTipService.ToolTipProperty,FailureText.From(error));Show();}}
    }
    private void RenderTags()
    {
        tags.Children.Clear();
        foreach(var word in draft.Words)tags.Children.Add(new KeywordChip(word,()=>{
            if(!ready||saving)return;draft.Remove(word);L.Literal(status,TextBlock.TextProperty,"");RenderTags();Show();
        }));
    }
    private void CancelDraft()
    {
        draft.Cancel();input.Text="";L.Literal(status,TextBlock.TextProperty,"");RenderTags();Show();
        if(refreshPending||readFailed)_=ReadAsync();
    }
    private async Task SaveAsync()
    {
        if(items.Count==0||!ready||saving||!draft.Dirty)return;var target=items;
        var token=pending.Token;var reload=false;
        try {
            var values=draft.SaveWords();saving=true;L.Bind(status,TextBlock.TextProperty,"ui.keywords.saving");Show();
            var result=await write(snapshot,values,token);
            if(token.IsCancellationRequested||!ReferenceEquals(items,target))return;
            if(result.Failed>0){readFailed=true;L.Bind(status,TextBlock.TextProperty,"ui.keywords.partial",()=>new Dictionary<string,object?>{{"count",result.Failed}});notice(UiMessage.Key("ui.keywords.saveSummary",new Dictionary<string,object?>{{"succeeded",result.Succeeded},{"failed",result.Failed}}));return;}
            snapshot=result.Snapshot;draft.Reset(snapshot.Words);input.Text="";reload=refreshPending;refreshPending=readFailed=false;L.Literal(status,TextBlock.TextProperty,"");RenderTags();notice(UiMessage.Key(items.Count==1?"ui.keywords.saved":"ui.keywords.savedFiles",new Dictionary<string,object?>{{"count",result.Succeeded}}));
        }
        catch(Exception error){if(!token.IsCancellationRequested&&ReferenceEquals(items,target)){readFailed=true;L.Message(status,TextBlock.TextProperty,FailureText.From(error));}}
        finally{if(!token.IsCancellationRequested&&ReferenceEquals(items,target)){saving=false;Show();if(reload)_=ReadAsync();}}
    }
    private void Show()
    {
        var dirty=draft.Dirty;
        tags.Visibility=draft.Words.Count>0?Visibility.Visible:Visibility.Collapsed;
        tags.IsHitTestVisible=ready&&!saving;empty.Visibility=draft.Words.Count==0?Visibility.Visible:Visibility.Collapsed;
        if(ready)L.Bind(empty,TextBlock.TextProperty,items.Count>1?"ui.keywords.noCommon":"ui.keywords.empty");else L.Literal(empty,TextBlock.TextProperty,"—");
        input.IsEnabled=ready;input.IsReadOnly=saving;
        editorActions.Visibility=dirty?Visibility.Visible:Visibility.Collapsed;
        status.Visibility=status.Text.Length>0?Visibility.Visible:Visibility.Collapsed;retry.Visibility=readFailed?Visibility.Visible:Visibility.Collapsed;
        retry.IsEnabled=items.Count>0&&!saving;clear.IsEnabled=cancel.IsEnabled=save.IsEnabled=ready&&!saving;
        var canGenerate=items.Count>1||items.Any(item=>FormatRegistry.Find(item.Entry.Extension)?.CanAIIndex==true);
        automatic.IsEnabled=items.Count>0&&canGenerate&&!saving&&!automaticBusy&&!dirty;
        L.Bind(automatic,ToolTipService.ToolTipProperty,dirty?"ui.keywords.saveFirst":automaticBusy?"ui.keywords.recognizing":items.Count==0?"ui.keywords.selectFiles":canGenerate?"ui.keywords.generateHint":"ui.keywords.unsupported");
    }
    public void Stop()=>pending.Cancel();
}
