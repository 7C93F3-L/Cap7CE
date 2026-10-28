using Cap7CE.WinUI.Services;
using Microsoft.Windows.AppNotifications;

internal static class NotificationChecks
{
    public static async Task RunAsync()
    {
        var manager=AppNotificationManager.Default;manager.Reset();var checks=0;
        void Check(bool condition,string message){checks++;if(!condition)throw new Exception(message);}
        var directory=Path.Combine(Path.GetTempPath(),"Cap7CE-notification-check-"+Guid.NewGuid().ToString("N"));
        var language=Cap7CE.WinUI.Localization.AppLanguage.Session.Current;
        try
        {
            var store=new PreferenceStore(Path.Combine(directory,"preferences.json"),null);
            await store.LoadAsync();using var service=new NativeNotifications();var clicks=0;service.Invoked+=()=>clicks++;
            service.Show("disabled",false);Check(manager.Registered==0&&manager.Sent==0,"Disabled notifications must do no OS work.");
            await Task.WhenAll(service.SetEnabledAsync(store,true),store.UpdateAsync(p=>p with{AlwaysOnTop=true}));
            Check(store.Current.Notifications&&store.Current.AlwaysOnTop,"Notification save must preserve concurrent preference changes.");
            Check(manager.Registered==1&&manager.HandlerPresentOnRegister,"Activation handler must precede registration.");
            service.Show("one",store.Current.Notifications);service.Configure(true);
            Check(manager.Sent==1&&manager.Registered==1,"Repeated configure must not duplicate registration.");
            manager.Click();Check(clicks==1,"Notification click must reach the activation owner.");
            manager.Setting=AppNotificationSetting.DisabledForApplication;Check(!service.IsAllowed,"Respect the OS notification setting.");
            await service.SetEnabledAsync(store,false);service.Show("disabled",store.Current.Notifications);
            Check(manager.Sent==1&&!store.Current.Notifications,"Disabling must prevent new notifications.");
            service.Dispose();manager.Click();Check(clicks==1&&manager.Unregistered==1,"Dispose must detach activation and unregister once.");
            manager.Reset();manager.FailRegister=true;using var retry=new NativeNotifications();retry.Invoked+=()=>clicks++;
            try{await retry.SetEnabledAsync(store,true);throw new Exception("Expected registration failure.");}catch(IOException){}
            manager.Click();Check(clicks==1&&!store.Current.Notifications,"Failed registration must leave preference and event subscriptions unchanged.");
            manager.FailRegister=false;await retry.SetEnabledAsync(store,true);manager.Click();
            Check(clicks==2&&store.Current.Notifications,"Retry must register one activation handler.");
            var file=Path.Combine(directory,"blocker");await File.WriteAllTextAsync(file,"block directory creation");
            var broken=new PreferenceStore(Path.Combine(file,"preferences.json"),null);
            try{await retry.SetEnabledAsync(broken,true);throw new Exception("Expected save failure.");}catch(IOException){}
            Check(!broken.Current.Notifications,"Save failure must not enable future task notifications.");
            retry.Dispose();manager.Reset();
        }
        finally{Cap7CE.WinUI.Localization.AppLanguage.Apply(language);if(Directory.Exists(directory))Directory.Delete(directory,true);}
        Console.WriteLine($"Native notification lifecycle and preference checks: {checks} passed.");
    }
}
