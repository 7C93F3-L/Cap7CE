using Microsoft.Windows.AppNotifications;
using Microsoft.Windows.AppNotifications.Builder;

namespace Cap7CE.WinUI.Services;

internal sealed class NativeNotifications : IDisposable
{
    private bool registered;
    public event Action? Invoked;
    public bool IsAllowed=>registered&&AppNotificationManager.Default.Setting==AppNotificationSetting.Enabled;
    public void Configure(bool enabled)
    {
        if(!enabled||registered)return;
        var manager=AppNotificationManager.Default;manager.NotificationInvoked+=OnInvoked;
        try{manager.Register();registered=true;}
        catch{manager.NotificationInvoked-=OnInvoked;throw;}
    }
    public async Task SetEnabledAsync(PreferenceStore preferences,bool enabled)
    {Configure(enabled);await preferences.UpdateAsync(value=>value with{Notifications=enabled});}
    private void OnInvoked(AppNotificationManager sender,AppNotificationActivatedEventArgs args)=>Invoked?.Invoke();
    public void Show(string message,bool enabled)
    {
        if(!enabled)return;Configure(true);
        AppNotificationManager.Default.Show(new AppNotificationBuilder().AddText(ApplicationIdentity.Name).AddText(message).BuildNotification());
    }
    public void Dispose()
    {
        if(!registered)return;
        var manager=AppNotificationManager.Default;manager.NotificationInvoked-=OnInvoked;
        try{manager.Unregister();}finally{registered=false;Invoked=null;}
    }
}
