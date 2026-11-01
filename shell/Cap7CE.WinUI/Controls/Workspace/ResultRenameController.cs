using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.System;
using L=Cap7CE.WinUI.Localization.LanguageUi;

namespace Cap7CE.WinUI.Controls;

// Stable modal editor; execution stays in the shared file-operation coordinator.
internal sealed class ResultRenameController : IDisposable
{
    private readonly ResultsView owner;
    private readonly FileCommands commands;
    private ContentDialog? dialog;
    private AssetItem[] targets=[];
    private bool submitting;
    public ResultRenameController(ResultsView owner,FileCommands commands)
    {
        this.owner=owner;this.commands=commands;
        commands.RenameRequested+=Begin;owner.Unloaded+=Unloaded;owner.SelectionChanged+=SelectionChanged;
    }
    private bool Matches(IReadOnlyList<AssetItem> items)=>items.Count==targets.Length&&targets.All(items.Contains);
    private void Begin(IReadOnlyList<AssetItem> items)
    {
        var snapshot=items.ToArray();
        owner.DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low,()=>{
            if(owner.IsLoaded&&snapshot.Length==owner.Selection.Count&&snapshot.All(owner.Selection.Contains))commands.Run(()=>OpenAsync(snapshot));
        });
    }
    private async Task OpenAsync(AssetItem[] items)
    {
        if(dialog is not null||!commands.CanRename(items)||owner.XamlRoot is not {} root)return;
        var first=items[0];targets=items;
        var editor=new TextBox{Text=items.Length>1&&!first.Entry.IsDirectory?Path.GetFileNameWithoutExtension(first.FullPath):Path.GetFileName(first.FullPath),
            AcceptsReturn=false,TextWrapping=TextWrapping.Wrap,MaxHeight=96,MinHeight=32,IsSpellCheckEnabled=false,HorizontalAlignment=HorizontalAlignment.Stretch};
        L.Label(editor,"menu.rename");
        var keys=L.Text("ui.rename.hint");keys.Style=(Style)Application.Current.Resources["CapRenameKeyHint"];
        var title=L.Text("menu.rename");title.FontSize=20;title.FontWeight=Microsoft.UI.Text.FontWeights.SemiBold;
        var header=new Grid{ColumnSpacing=12};header.ColumnDefinitions.Add(new(){Width=GridLength.Auto});header.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        header.Children.Add(title);Grid.SetColumn(keys,1);header.Children.Add(keys);
        var error=Ui.Text("",true);error.Visibility=Visibility.Collapsed;
        var panel=Ui.Column(editor,error);panel.Spacing=8;panel.Width=Math.Min(312,Math.Max(0,root.Size.Width-64));
        var current=L.Dialog(root,"menu.rename",null,"menu.rename");
        current.DefaultButton=ContentDialogButton.Primary;current.Content=panel;
        current.Resources["ContentDialogMaxWidth"]=360d;current.Resources["ContentDialogMinWidth"]=0d;current.Resources["ContentDialogMinHeight"]=0d;
        header.Width=panel.Width;L.Literal(current,ContentDialog.TitleProperty,header);
        if(items.Length>1){
            L.Bind(title,TextBlock.TextProperty,"ui.rename.batchTitle",()=>new Dictionary<string,object?>{{"count",items.Length}});
            panel.Children.Insert(1,L.Text("ui.rename.batchDescription",true));
        }
        dialog=current;
        current.Opened+=(_,_)=>{editor.Focus(FocusState.Programmatic);editor.Select(0,items.Length>1||first.Entry.IsDirectory?editor.Text.Length:Path.GetFileNameWithoutExtension(editor.Text).Length);};
        // Cancel native auto-close immediately; SubmitAsync owns asynchronous completion.
        current.PrimaryButtonClick+=async(_,e)=>{e.Cancel=true;await SubmitAsync(current,editor,error,items);};
        current.Closing+=(_,e)=>{if(submitting&&ReferenceEquals(dialog,current))e.Cancel=true;};
        editor.PreviewKeyDown+=async(_,e)=>{if(e.Key==VirtualKey.Enter){e.Handled=true;await SubmitAsync(current,editor,error,items);}};
        void Resize(XamlRoot sender,XamlRootChangedEventArgs args){panel.Width=Math.Min(312,Math.Max(0,root.Size.Width-64));header.Width=panel.Width;}
        root.Changed+=Resize;
        try{await current.ShowAsync();}
        finally{root.Changed-=Resize;if(ReferenceEquals(dialog,current)){dialog=null;targets=[];submitting=false;}}
    }
    private async Task SubmitAsync(ContentDialog current,TextBox editor,TextBlock error,AssetItem[] items)
    {
        if(submitting||!ReferenceEquals(dialog,current))return;
        if(!Matches(owner.Selection)){Close();return;}
        submitting=true;current.IsPrimaryButtonEnabled=false;editor.IsReadOnly=true;error.Visibility=Visibility.Collapsed;
        try{await commands.RenameAsync(items,editor.Text);if(ReferenceEquals(dialog,current))Close();}
        catch(Exception failure){
            if(ReferenceEquals(dialog,current)&&Matches(owner.Selection)){L.Message(error,TextBlock.TextProperty,FailureText.From(failure));error.Visibility=Visibility.Visible;}
            else {if(ReferenceEquals(dialog,current))Close();commands.Run(()=>Task.FromException(failure));}
        }
        finally{
            if(ReferenceEquals(dialog,current)){submitting=false;current.IsPrimaryButtonEnabled=true;editor.IsReadOnly=false;editor.Focus(FocusState.Programmatic);}
        }
    }
    private void SelectionChanged(IReadOnlyList<AssetItem> items){if(dialog is not null&&!submitting&&!Matches(items))Close();}
    private void Unloaded(object sender,RoutedEventArgs args)=>Close();
    private void Close(){var previous=dialog;dialog=null;targets=[];submitting=false;previous?.Hide();}
    public void Dispose(){Close();commands.RenameRequested-=Begin;owner.Unloaded-=Unloaded;owner.SelectionChanged-=SelectionChanged;}
}
