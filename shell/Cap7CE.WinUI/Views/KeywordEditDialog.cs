using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Views;

// A compact host for the same draft, revision checks and writer as the details pane.
internal static class KeywordEditDialog
{
    public static async Task<bool> ShowAsync(XamlRoot root,ShellServices services,IReadOnlyList<AssetItem> items,Action<UiMessage> notice)
    {
        var service=new KeywordSelectionService(services);var changed=false;
        async Task<KeywordSelectionSaveResult<AssetItem>> Write(KeywordSelectionSnapshot<AssetItem> original,string[] words,CancellationToken token)
        {
            var result=await service.SaveAsync(original,words,token);changed|=result.Succeeded>0;return result;
        }
        var editor=new DetailsKeywordEditor(service.ReadAsync,Write,notice,_=>{},dialogMode:true);
        var scroll=new ScrollViewer{Content=editor,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};
        var dialog=L.Dialog(root,"menu.editKeywords",null,"ui.keywords.save",ContentDialogButton.Primary);
        dialog.Content=scroll;dialog.IsPrimaryButtonEnabled=false;
        dialog.Resources["ContentDialogMaxWidth"]=360d;dialog.Resources["ContentDialogMinWidth"]=0d;dialog.Resources["ContentDialogMinHeight"]=0d;
        dialog.Resources["ContentDialogPadding"]=new Thickness(16,10,16,10);
        dialog.Resources["ContentDialogTitleMargin"]=new Thickness(0,0,0,8);
        var clear=new HyperlinkButton{Padding=new(0,0,3,0),FontSize=13,VerticalAlignment=VerticalAlignment.Center,HorizontalAlignment=HorizontalAlignment.Right};
        clear.Resources.MergedDictionaries.Add(new ResourceDictionary{Source=new Uri("ms-appx:///Themes/DialogTextActionResources.xaml")});
        clear.Style=(Style)clear.Resources["DialogTextActionStyle"];L.Bind(clear,ContentControl.ContentProperty,"ui.keywords.clearAll");
        clear.Click+=(_,_)=>editor.ClearDraft();
        var title=L.Text("menu.editKeywords");title.FontSize=20;title.FontWeight=Microsoft.UI.Text.FontWeights.SemiBold;title.TextTrimming=TextTrimming.CharacterEllipsis;
        var header=new Grid{ColumnSpacing=8};
        header.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});header.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        header.Children.Add(title);Grid.SetColumn(clear,1);header.Children.Add(clear);L.Literal(dialog,ContentDialog.TitleProperty,header);
        void Resize(XamlRoot sender,XamlRootChangedEventArgs args){
            scroll.Width=Math.Min(328,Math.Max(0,root.Size.Width-64));
            header.Width=scroll.Width;
            scroll.MaxHeight=Math.Max(32,root.Size.Height-136);
        }
        editor.StateChanged+=()=>{dialog.IsPrimaryButtonEnabled=editor.CanSave;clear.IsEnabled=editor.CanClear;};
        editor.SetItems(items);editor.RequestEdit();
        dialog.Opened+=async(_,_)=>await editor.ReadAsync();
        dialog.PrimaryButtonClick+=async(_,e)=>{e.Cancel=true;if(editor.CanSave&&await editor.SaveForDialogAsync())dialog.Hide();};
        dialog.Closing+=(_,e)=>{if(editor.Saving)e.Cancel=true;};
        Resize(root,null!);root.Changed+=Resize;
        try{await dialog.ShowAsync();}
        finally{root.Changed-=Resize;editor.Stop();if(changed)services.RefreshViews();}
        return changed;
    }
}
