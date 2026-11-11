using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Localization;
internal static class TrayChecks
{
    public static async Task RunAsync()
    {
        var checks=0;void Check(bool value,string message){checks++;if(!value)throw new Exception(message);}
        Check(System.Runtime.InteropServices.Marshal.SizeOf<TrayNative.IconData>()==(IntPtr.Size==8?976:956),"Shell notification ABI must match the Unicode Windows structure.");
        Check(new ShellPreferences().TrayIconEnabled&&new ShellPreferences().ShowMainOnStartup,"Both tray options default on.");
        foreach(var enabled in new[]{false,true})foreach(var registered in new[]{false,true})foreach(var exiting in new[]{false,true}){
            var hide=TrayPolicy.HideOnClose(enabled,registered,exiting);
            Check(!hide||enabled&&registered&&!exiting,"No close can hide an app without a working tray or swallow explicit exit.");
            if(enabled&&registered&&!exiting)Check(hide,"A healthy tray close keeps background work alive.");
        }
        Check(TrayPolicy.ShowOnStartup(false,true,false),"A second launch must reveal a background instance.");
        Check(TrayPolicy.ShowOnStartup(false,false,true),"Registration failure must reveal a window.");
        Check(!TrayPolicy.ShowOnStartup(false,false,false),"Background launch must not activate the window.");
        foreach(var state in new[]{"unloaded","unknown","stopped","starting","running","stopping","failed"})foreach(var busy in new[]{false,true}){
            Check(TrayPolicy.CanStartRuntime(state,busy)==(!busy&&(state=="unloaded"||state=="stopped")),"Only unstarted or confirmed stopped owners allow Start.");
            Check(TrayPolicy.CanStopRuntime(state,busy)==(!busy&&state=="running"),"Unknown, unstarted and busy owners never imply a running service.");
        }
        var folder=Path.Combine(Path.GetTempPath(),"Cap7CE-tray-check-"+Guid.NewGuid().ToString("N"));var language=AppLanguage.Session.Current;
        try{
            Directory.CreateDirectory(folder);var path=Path.Combine(folder,"prefs.json");await File.WriteAllTextAsync(path,"{\"language\":\"zh-CN\",\"notifications\":true}");
            var store=new PreferenceStore(path,null);await store.LoadAsync();Check(store.Current.TrayIconEnabled&&store.Current.ShowMainOnStartup&&store.Current.Notifications,"Old preferences retain defaults and unrelated values.");
            await store.UpdateAsync(p=>p with{TrayIconEnabled=false,ShowMainOnStartup=false});
            var reload=new PreferenceStore(path,null);await reload.LoadAsync();Check(!reload.Current.TrayIconEnabled&&!reload.Current.ShowMainOnStartup&&reload.Current.Notifications,"The two switches persist independently of other options.");
        }finally{AppLanguage.Apply(language);if(Directory.Exists(folder))Directory.Delete(folder,true);}
        Console.WriteLine($"Tray close/startup policy and isolated preferences: {checks} checks passed.");
    }
}
