// API substitute for notification lifetime/failure tests; never registers or sends OS notifications.
namespace Microsoft.Windows.AppNotifications
{
    internal enum AppNotificationSetting {Enabled,DisabledForApplication}
    internal sealed class AppNotificationActivatedEventArgs:EventArgs;
    internal sealed class AppNotificationManager
    {
        public static AppNotificationManager Default {get;}=new();
        public event Action<AppNotificationManager,AppNotificationActivatedEventArgs>? NotificationInvoked;
        public AppNotificationSetting Setting {get;set;}
        public int Registered,Unregistered,Sent;
        public bool FailRegister,HandlerPresentOnRegister;
        public void Register(){HandlerPresentOnRegister=NotificationInvoked is not null;if(FailRegister)throw new IOException("fixture registration failure");Registered++;}
        public void Unregister()=>Unregistered++;
        public void Show(object notification)=>Sent++;
        public void Click()=>NotificationInvoked?.Invoke(this,new());
        public void Reset(){NotificationInvoked=null;Setting=AppNotificationSetting.Enabled;Registered=Unregistered=Sent=0;FailRegister=HandlerPresentOnRegister=false;}
    }
}
namespace Microsoft.Windows.AppNotifications.Builder
{
    internal sealed class AppNotificationBuilder
    {
        public AppNotificationBuilder AddText(string value)=>this;
        public object BuildNotification()=>new();
    }
}
namespace Cap7CE.WinUI.Services
{
    internal static class ApplicationIdentity {public const string Name="Cap7CE";}
}
