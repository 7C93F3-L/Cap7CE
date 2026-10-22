using Microsoft.Windows.AppNotifications;
using Microsoft.Windows.AppNotifications.Builder;

namespace Cap7CE.WinUI.Services;

internal sealed class NativeNotifications : IDisposable
{
    private bool registered;
    public void Configure(bool enabled)
    {
        if(enabled&&!registered){AppNotificationManager.Default.Register();registered=true;}
    }
    public void Show(string message,bool enabled)
    {
        if(!enabled)return;Configure(true);
        AppNotificationManager.Default.Show(new AppNotificationBuilder().AddText("Cap7CE").AddText(message).BuildNotification());
    }
    public void Dispose(){if(registered){AppNotificationManager.Default.Unregister();registered=false;}}
}
