using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media.Animation;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Localization;

namespace Cap7CE.WinUI.Views;
// Only settings content is replaced; the application window/navigation state is untouched.
internal sealed class SettingsSubpageNavigation(ContentControl body,ScrollViewer scroll)
{
    private object? parent;
    private double offset;
    private Button? entry;
    public void Reset(){parent=null;entry=null;body.ContentTransitions=null;}
    private void Transition(double horizontalOffset)
    {
        body.ContentTransitions=new Windows.UI.ViewManagement.UISettings().AnimationsEnabled
            ?new TransitionCollection{new ContentThemeTransition{HorizontalOffset=horizontalOffset,VerticalOffset=0}}
            :null;
    }
    public void Open(string title,Func<UIElement> create)
    {
        if(parent is not null)return;
        var content=create();parent=body.Content;offset=scroll.VerticalOffset;
        entry=Microsoft.UI.Xaml.Input.FocusManager.GetFocusedElement(body.XamlRoot) as Button;
        var back=LanguageUi.Tool("\uE72B","common.back",Back);
        var heading=LanguageUi.Text(title);heading.Style=(Style)Application.Current.Resources["CapSettingsPageTitle"];
        var header=Ui.Row(back,heading);header.Spacing=12;
        var page=Ui.Column(header,content);page.Spacing=24;
        Transition(24);body.Content=page;scroll.ChangeView(null,0,null,true);
        back.Loaded+=(_,_)=>back.Focus(FocusState.Programmatic);
    }
    private void Back()
    {
        if(parent is null)return;
        var previous=parent;var previousOffset=offset;var previousEntry=entry;Reset();Transition(-24);body.Content=previous;
        body.DispatcherQueue.TryEnqueue(()=>{if(!ReferenceEquals(body.Content,previous))return;scroll.ChangeView(null,previousOffset,null,true);previousEntry?.Focus(FocusState.Programmatic);});
    }
}
