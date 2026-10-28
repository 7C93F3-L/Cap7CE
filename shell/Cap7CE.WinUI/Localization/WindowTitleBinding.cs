using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI.Localization;

// Window is not a FrameworkElement; its title has a window lifetime, not a page lifetime.
internal static class WindowTitleBinding
{
    public static void Attach(Window window,string key)
    {
        var closed=false;
        void Refresh()
        {
            if(closed)return;
            if(window.DispatcherQueue.HasThreadAccess)window.Title=AppLanguage.Text(key);
            else window.DispatcherQueue.TryEnqueue(()=>{if(!closed)window.Title=AppLanguage.Text(key);});
        }
        void Closed(object sender,WindowEventArgs args)
        {closed=true;AppLanguage.Session.Changed-=Refresh;window.Closed-=Closed;}
        window.Closed+=Closed;AppLanguage.Session.Changed+=Refresh;Refresh();
    }
}
