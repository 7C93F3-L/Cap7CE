using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
namespace Cap7CE.WinUI.Controls;
// Owns a local edit draft. Only Save invokes the supplied write operation.
internal sealed class DetailsKeywordEditor : UserControl
{
    private readonly Func<AssetItem,CancellationToken,Task<ManualKeywords>> read;
    private readonly Func<AssetItem,string[],string?,Task<ManualKeywords>> write;
    private readonly Action<string> notice;
    private readonly DetailsCard card=new("添加关键词");
    private readonly TextBlock words=Ui.Text("尚未添加关键词",true),status=Ui.Text("",true);
    private readonly TextBox input=new(){AcceptsReturn=true,TextWrapping=TextWrapping.Wrap,MinHeight=90,PlaceholderText="每行一个关键词",CornerRadius=new(8)};
    private readonly StackPanel actions,editorActions;
    private readonly Button edit,retry,save,cancel;
    private CancellationTokenSource pending=new();
    private AssetItem? item;
    private ManualKeywords snapshot=new([],null);
    private bool ready,saving,editing,editRequested,readFailed;
    public DetailsKeywordEditor(Func<AssetItem,CancellationToken,Task<ManualKeywords>> read,Func<AssetItem,string[],string?,Task<ManualKeywords>> write,Action<string> notice)
    {
        this.read=read;this.write=write;this.notice=notice;
        edit=Ui.Button("编辑",Edit);retry=Ui.Button("重新读取",()=>_=ReadAsync());
        var automatic=Ui.Button("自动添加",()=>{});automatic.IsEnabled=false;ToolTipService.SetToolTip(automatic,"当前不可用");
        actions=Ui.Row(edit,automatic);actions.Spacing=4;
        save=Ui.Button("保存",()=>_=SaveAsync());cancel=Ui.Button("取消",CancelDraft);
        var clear=Ui.Button("清空",()=>input.Text="");editorActions=Ui.Row(clear,save,cancel);
        foreach(var button in new[]{edit,automatic,retry,clear,save,cancel}){button.MinWidth=0;button.FontSize=12;button.Padding=new(8,4,8,4);}
        words.IsTextSelectionEnabled=true;
        input.KeyDown+=(_,e)=>{if(e.Key==Windows.System.VirtualKey.Escape&&!saving){e.Handled=true;CancelDraft();}};
        card.Body.Children.Add(words);card.Body.Children.Add(input);card.Body.Children.Add(actions);card.Body.Children.Add(editorActions);card.Body.Children.Add(status);card.Body.Children.Add(retry);
        Content=card;Show();
    }
    public void SetItem(AssetItem? value)
    {
        Stop();item=value;snapshot=new([],null);ready=saving=editing=editRequested=readFailed=false;
        status.Text=value is null?"当前不可用":"读取中…";input.Text="";Show();
    }
    public void RequestEdit(){editRequested=true;if(ready)Edit();}
    public async Task ReadAsync()
    {
        if(item is not {} target||saving)return;
        pending.Cancel();pending.Dispose();pending=new();var token=pending.Token;
        ready=readFailed=editing=false;status.Text="读取中…";Show();
        try {
            var result=await read(target,token);
            if(token.IsCancellationRequested||item!=target)return;
            snapshot=result;ready=true;status.Text="";if(editRequested)Edit();else Show();
        }
        catch(OperationCanceledException){}
        catch(Exception error){if(!token.IsCancellationRequested&&item==target){readFailed=true;status.Text="读取失败，可重新读取";ToolTipService.SetToolTip(status,error.Message);Show();}}
    }
    private void Edit()
    {if(!ready||saving)return;editRequested=false;editing=true;input.Text=string.Join(Environment.NewLine,snapshot.Words);Show();input.Focus(FocusState.Programmatic);}
    private void CancelDraft(){editing=false;status.Text="";Show();}
    private async Task SaveAsync()
    {
        if(item is not {} target||!ready||saving)return;
        var revision=snapshot.Revision;var token=pending.Token;
        var values=input.Text.Split(['\r','\n','，',','],StringSplitOptions.RemoveEmptyEntries).Select(value=>value.Trim()).Where(value=>value.Length>0).Distinct().ToArray();
        saving=true;status.Text="保存中…";Show();
        try {
            var result=await write(target,values,revision);
            if(token.IsCancellationRequested||item!=target)return;
            snapshot=result;editing=false;status.Text="已保存";notice("关键词已保存");
        }
        catch(Exception error){if(!token.IsCancellationRequested&&item==target){readFailed=true;status.Text=error.Message;}}
        finally {if(!token.IsCancellationRequested&&item==target){saving=false;Show();}}
    }
    private void Show()
    {
        words.Text=ready?(snapshot.Words.Length>0?string.Join("  ·  ",snapshot.Words):"尚未添加关键词"):"—";
        words.Visibility=editing?Visibility.Collapsed:Visibility.Visible;input.Visibility=editorActions.Visibility=editing?Visibility.Visible:Visibility.Collapsed;
        actions.Visibility=editing?Visibility.Collapsed:Visibility.Visible;
        status.Visibility=status.Text.Length>0?Visibility.Visible:Visibility.Collapsed;
        retry.Visibility=readFailed?Visibility.Visible:Visibility.Collapsed;
        edit.IsEnabled=ready&&!saving;retry.IsEnabled=item is not null&&!saving;save.IsEnabled=cancel.IsEnabled=!saving;input.IsReadOnly=saving;
        foreach(var button in editorActions.Children.OfType<Button>())button.IsEnabled=!saving;
    }
    public void Stop()=>pending.Cancel();
}
