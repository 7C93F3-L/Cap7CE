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
    private Storyboard? transition;
    public void Reset(){parent=null;entry=null;transition?.Stop();transition=null;body.ContentTransitions=null;}
    private void Show(object content,double horizontalOffset)
    {
        transition?.Stop();transition=null;body.ContentTransitions=null;body.Content=content;
        if(!new Windows.UI.ViewManagement.UISettings().AnimationsEnabled)return;
        // Explicit navigation only: never leave a layout-triggered transition on the host.
        var storyboard=new Storyboard();
        var move=new RepositionThemeAnimation{FromHorizontalOffset=horizontalOffset,FromVerticalOffset=0};
        var fade=new FadeInThemeAnimation();
        Storyboard.SetTarget(move,body);Storyboard.SetTarget(fade,body);
        storyboard.Children.Add(move);storyboard.Children.Add(fade);
        transition=storyboard;storyboard.Begin();
    }
    public void Open(string title,Func<UIElement> create)
    {
        if(parent is not null)return;
        Services.SessionDiagnostics.Record("trace.settings.subpage.open",new{title});var content=create();parent=body.Content;offset=scroll.VerticalOffset;
        entry=Microsoft.UI.Xaml.Input.FocusManager.GetFocusedElement(body.XamlRoot) as Button;
        var back=LanguageUi.Tool("\uE72B","common.back",Back);
        var heading=LanguageUi.Text(title);heading.Style=(Style)Application.Current.Resources["CapSettingsPageTitle"];
        var header=Ui.Row(back,heading);header.Spacing=12;
        var page=Ui.Column(header,content);page.Spacing=24;
        Show(page,24);scroll.ChangeView(null,0,null,true);
        back.Loaded+=(_,_)=>back.Focus(FocusState.Programmatic);
    }
    private void Back()
    {
        if(parent is null)return;
        Services.SessionDiagnostics.Record("trace.settings.subpage.back");var previous=parent;var previousOffset=offset;var previousEntry=entry;Reset();Show(previous,-24);
        body.DispatcherQueue.TryEnqueue(()=>{if(!ReferenceEquals(body.Content,previous))return;scroll.ChangeView(null,previousOffset,null,true);previousEntry?.Focus(FocusState.Programmatic);});
    }
}
