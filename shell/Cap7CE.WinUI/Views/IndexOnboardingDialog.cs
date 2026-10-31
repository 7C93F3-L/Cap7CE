using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Localization;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Views;

internal enum IndexOnboardingChoice { Later,Start,Custom,Never }

internal sealed class IndexOnboardingDialog
{
    private readonly ContentDialog dialog;
    private IndexOnboardingChoice choice;
    private bool saving;
    public IndexOnboardingDialog(XamlRoot root,Func<Task> never)
    {
        dialog=L.Dialog(root,"ui.indexPrompt.title",null,"ui.indexPrompt.start","ui.indexPrompt.later");
        dialog.DefaultButton=ContentDialogButton.Primary;
        L.Bind(dialog,ContentDialog.SecondaryButtonTextProperty,"ui.indexPrompt.custom");
        var dismiss=new HyperlinkButton {HorizontalAlignment=HorizontalAlignment.Right,Padding=new(0)};
        dismiss.Resources.MergedDictionaries.Add(new ResourceDictionary {Source=new Uri("ms-appx:///Themes/IndexOnboardingResources.xaml")});
        dismiss.Style=(Style)dismiss.Resources["IndexOnboardingDismissStyle"];
        L.Bind(dismiss,ContentControl.ContentProperty,"ui.indexPrompt.never");
        dismiss.FontSize=13;dismiss.VerticalAlignment=VerticalAlignment.Center;
        var title=L.Text("ui.indexPrompt.title");title.FontSize=20;title.FontWeight=Microsoft.UI.Text.FontWeights.SemiBold;
        var header=new Grid{ColumnSpacing=24};
        header.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});header.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        header.Children.Add(title);Grid.SetColumn(dismiss,1);header.Children.Add(dismiss);
        L.Literal(dialog,ContentDialog.TitleProperty,header);
        var error=L.Text("ui.indexPrompt.saveFailed",true);error.Visibility=Visibility.Collapsed;
        dismiss.Click+=async(_,_)=>{
            saving=true;dialog.IsPrimaryButtonEnabled=dialog.IsSecondaryButtonEnabled=dismiss.IsEnabled=false;
            try{await never();saving=false;choice=IndexOnboardingChoice.Never;dialog.Hide();}
            catch{saving=false;error.Visibility=Visibility.Visible;dialog.IsPrimaryButtonEnabled=dialog.IsSecondaryButtonEnabled=dismiss.IsEnabled=true;}
        };
        var body=Ui.Column(L.Text("ui.indexPrompt.description",true),error);body.Spacing=12;
        // The native title presenter is left-aligned; match the measured body width.
        body.SizeChanged+=(_,e)=>header.Width=e.NewSize.Width;
        dialog.Content=body;
        dialog.Closing+=(_,e)=>{if(saving)e.Cancel=true;};
    }
    public async Task<IndexOnboardingChoice> ShowAsync()=>await dialog.ShowAsync() switch{
        ContentDialogResult.Primary=>IndexOnboardingChoice.Start,ContentDialogResult.Secondary=>IndexOnboardingChoice.Custom,_=>choice};
    public void Hide(){saving=false;dialog.Hide();}
}
