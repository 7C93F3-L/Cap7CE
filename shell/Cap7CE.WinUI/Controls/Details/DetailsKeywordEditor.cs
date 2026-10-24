using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
namespace Cap7CE.WinUI.Controls;

// Local tag/input draft. Only an explicit Save invokes the supplied writer.
internal sealed class DetailsKeywordEditor:UserControl
{
    private readonly Func<IReadOnlyList<AssetItem>,CancellationToken,Task<KeywordSelectionSnapshot<AssetItem>>> read;
    private readonly Func<KeywordSelectionSnapshot<AssetItem>,string[],CancellationToken,Task<KeywordSelectionSaveResult<AssetItem>>> write;
    private readonly Action<string> notice;
    private readonly DetailsCard card=new("添加关键词");
    private readonly KeywordDraft draft=new();
    private readonly KeywordWrapPanel tags=new();
    private readonly TextBlock empty=Ui.Text("尚未添加关键词",true),status=Ui.Text("",true);
    private readonly TextBox input=new(){AcceptsReturn=true,TextWrapping=TextWrapping.Wrap,MinHeight=56,MaxHeight=100,PlaceholderText="键入关键词，以逗号分隔",CornerRadius=new(6),FontSize=12};
    private readonly Grid actions=new(){ColumnSpacing=6,RowSpacing=6};
    private readonly StackPanel editorActions;
    private readonly Button retry,save,cancel,clear,automatic;
    private CancellationTokenSource pending=new();
    private IReadOnlyList<AssetItem> items=[];
    private KeywordSelectionSnapshot<AssetItem> snapshot=new([],[]);
    private bool ready,saving,focusRequested,readFailed,automaticBusy,refreshPending;
    public DetailsKeywordEditor(Func<IReadOnlyList<AssetItem>,CancellationToken,Task<KeywordSelectionSnapshot<AssetItem>>> read,Func<KeywordSelectionSnapshot<AssetItem>,string[],CancellationToken,Task<KeywordSelectionSaveResult<AssetItem>>> write,Action<string> notice,Action<IReadOnlyList<AssetItem>> generate)
    {
        this.read=read;this.write=write;this.notice=notice;
        retry=Ui.Button("重新读取",()=>{draft.Cancel();input.Text="";_=ReadAsync();});
        ToolTipService.SetToolTip(retry,"丢弃草稿并重新读取关键词");
        automatic=Ui.Button("自动添加",()=>{if(items.Count>0&&!draft.Dirty){var target=items;generate(target);}});
        var automaticLabel=new TextBlock{Text="自动添加",VerticalAlignment=VerticalAlignment.Center};
        var automaticIcon=new FontIcon{Glyph="\uE945",FontSize=14,VerticalAlignment=VerticalAlignment.Center,IsHitTestVisible=false};
        automaticIcon.SetBinding(FontIcon.ForegroundProperty,new Binding{Source=automaticLabel,Path=new PropertyPath(nameof(TextBlock.Foreground))});
        var automaticContent=Ui.Row(automaticIcon,automaticLabel);automaticContent.Spacing=5;automatic.Content=automaticContent;
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(automatic,"自动添加");
        save=Ui.Button("保存",()=>_=SaveAsync());cancel=Ui.Button("取消",CancelDraft);
        clear=Ui.Button("清空",()=>{draft.Clear();input.Text="";status.Text="";RenderTags();Show();});
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
        status.Text=items.Count==0?"当前不可用":"读取中…";input.Text="";RenderTags();Show();
    }
    public void RequestEdit(){focusRequested=true;if(ready){focusRequested=false;input.Focus(FocusState.Programmatic);}}
    public void SetAutomaticBusy(bool value){automaticBusy=value;Show();}
    public async Task ReadAsync()
    {
        if(items.Count==0)return;var target=items;
        if(saving){refreshPending=true;return;}
        if(draft.Dirty){refreshPending=true;return;}
        pending.Cancel();pending.Dispose();pending=new();var token=pending.Token;
        ready=readFailed=false;status.Text="读取中…";Show();
        try {
            var result=await read(target,token);
            if(token.IsCancellationRequested||!ReferenceEquals(items,target))return;
            snapshot=result;draft.Reset(result.Words);input.Text="";ready=true;refreshPending=false;status.Text="";RenderTags();Show();
            if(focusRequested){focusRequested=false;input.Focus(FocusState.Programmatic);}
        }
        catch(OperationCanceledException){}
        catch(Exception error){if(!token.IsCancellationRequested&&ReferenceEquals(items,target)){readFailed=true;status.Text="读取失败，可重新读取";ToolTipService.SetToolTip(status,error.Message);Show();}}
    }
    private void RenderTags()
    {
        tags.Children.Clear();
        foreach(var word in draft.Words)tags.Children.Add(new KeywordChip(word,()=>{
            if(!ready||saving)return;draft.Remove(word);status.Text="";RenderTags();Show();
        }));
    }
    private void CancelDraft()
    {
        draft.Cancel();input.Text="";status.Text="";RenderTags();Show();
        if(refreshPending||readFailed)_=ReadAsync();
    }
    private async Task SaveAsync()
    {
        if(items.Count==0||!ready||saving||!draft.Dirty)return;var target=items;
        var token=pending.Token;var reload=false;
        try {
            var values=draft.SaveWords();saving=true;status.Text="保存中…";Show();
            var result=await write(snapshot,values,token);
            if(token.IsCancellationRequested||!ReferenceEquals(items,target))return;
            if(result.Failed>0){readFailed=true;status.Text=$"{result.Failed} 个文件未保存，已保留修改，可重试。";notice($"关键词保存：成功 {result.Succeeded}，失败 {result.Failed}");return;}
            snapshot=result.Snapshot;draft.Reset(snapshot.Words);input.Text="";reload=refreshPending;refreshPending=readFailed=false;status.Text="";RenderTags();notice(items.Count==1?"关键词已保存":$"关键词已保存：{result.Succeeded} 个文件");
        }
        catch(Exception error){if(!token.IsCancellationRequested&&ReferenceEquals(items,target)){readFailed=true;status.Text=error.Message;}}
        finally{if(!token.IsCancellationRequested&&ReferenceEquals(items,target)){saving=false;Show();if(reload)_=ReadAsync();}}
    }
    private void Show()
    {
        var dirty=draft.Dirty;
        tags.Visibility=draft.Words.Count>0?Visibility.Visible:Visibility.Collapsed;
        tags.IsHitTestVisible=ready&&!saving;empty.Visibility=draft.Words.Count==0?Visibility.Visible:Visibility.Collapsed;
        empty.Text=ready?(items.Count>1?"暂无共同关键词":"尚未添加关键词"):"—";
        input.IsEnabled=ready;input.IsReadOnly=saving;
        editorActions.Visibility=dirty?Visibility.Visible:Visibility.Collapsed;
        status.Visibility=status.Text.Length>0?Visibility.Visible:Visibility.Collapsed;retry.Visibility=readFailed?Visibility.Visible:Visibility.Collapsed;
        retry.IsEnabled=items.Count>0&&!saving;clear.IsEnabled=cancel.IsEnabled=save.IsEnabled=ready&&!saving;
        var canGenerate=items.Count>1||items.Any(item=>FormatRegistry.Find(item.Entry.Extension)?.CanAIIndex==true);
        automatic.IsEnabled=items.Count>0&&canGenerate&&!saving&&!automaticBusy&&!dirty;
        ToolTipService.SetToolTip(automatic,dirty?"请先保存或取消修改":automaticBusy?"正在识别":items.Count==0?"请选择文件":canGenerate?"使用本地模型添加关键词":"此格式不支持自动添加关键词");
    }
    public void Stop()=>pending.Cancel();
}
