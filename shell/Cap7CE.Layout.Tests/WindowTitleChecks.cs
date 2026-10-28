using Cap7CE.WinUI.Localization;
using Microsoft.UI.Xaml;

internal static class WindowTitleChecks
{
    public static void Run()
    {
        var previous=AppLanguage.Session.Current;
        var window=new Window();
        try {
            AppLanguage.Apply("zh-CN");WindowTitleBinding.Attach(window,"ui.window.settingsTitle");
            Require(window.Title=="Cap7CE — 设置");
            AppLanguage.Apply("en-US");Require(window.Title=="Cap7CE — Settings");
            window.DispatcherQueue.HasThreadAccess=false;AppLanguage.Apply("zh-CN");
            Require(window.Title=="Cap7CE — Settings");window.DispatcherQueue.Drain();Require(window.Title=="Cap7CE — 设置");
            AppLanguage.Apply("en-US");window.Close();window.DispatcherQueue.Drain();
            window.DispatcherQueue.HasThreadAccess=true;AppLanguage.Apply("zh-CN");
            Console.WriteLine("Window title binding passed: bilingual refresh, UI dispatch, queued updates after close and unsubscribe.");
        }finally{window.Close();AppLanguage.Apply(previous);}
    }
    private static void Require(bool value){if(!value)throw new Exception("Window title binding mismatch.");}
}
