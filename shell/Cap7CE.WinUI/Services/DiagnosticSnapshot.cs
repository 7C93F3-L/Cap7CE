using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;
internal static class DiagnosticSnapshot
{
    public static string NotificationState(ShellServices services)
    {try{return !services.Preferences.Current.Notifications?"disabled":services.Notifications.IsAllowed?"allowed":"blocked";}catch{return "unknown";}}
    public static object Capture(ShellServices services,string reader)
    {
        var notification=NotificationState(services);
        return new{capturedAt=DateTimeOffset.Now,shell="WinUI",version=NativeVersion.Text,os=Environment.OSVersion.VersionString,
            architecture=System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture.ToString(),appId=ApplicationIdentity.AppUserModelId,
            dataRoot=PreferenceStore.DataRoot,productData=PreferenceStore.ProductData,coreConnected=services.Core?.IsConnected==true,reader,
            language=Localization.AppLanguage.Session.Current,edgeMode=services.Preferences.Current.EdgeCollapseEnabled,notification,
            shortcuts=ShortcutCatalog.All.Select(action=>new{id=action.Id,status=services.Shortcuts?.Status(action)??"unknown"}).ToArray(),
            workers=new{visuals=services.Visuals.Diagnostics,providers=services.Providers.Diagnostics,models=services.Models.Diagnostics,office=services.Office.Diagnostics,metadata=services.StoredMetadata.Diagnostics}};
    }
}
