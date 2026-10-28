using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Localization;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Views;

internal sealed class CoreMaintenanceView
{
    public SettingsSection Section {get;}
    public CoreMaintenanceView(ShellServices services,Window owner)
    {
        var status=Ui.Text("",true);
        var reconnect=L.Button("ui.maintenance.reconnect",()=>{});
        var install=L.Button("ui.maintenance.install",()=>{});
        Section=new(Ui.Row(reconnect,install),status){Visibility=Visibility.Collapsed};
        void Report(string text){L.Literal(status,TextBlock.TextProperty,text);Section.Visibility=Visibility.Visible;}
        void ReportResource(string key){L.Bind(status,TextBlock.TextProperty,key);Section.Visibility=Visibility.Visible;}
        reconnect.Click+=async(_,_)=>{
            install.IsEnabled=reconnect.IsEnabled=false;
            try{await services.ConnectAsync();ReportResource("ui.maintenance.reconnected");}
            catch(Exception error){Report(error.Message);}
            finally{install.IsEnabled=reconnect.IsEnabled=true;}
        };
        install.Click+=async(_,_)=>{
            var dialog=L.Dialog(owner.Content.XamlRoot,"ui.maintenance.setupTitle","ui.maintenance.setupDescription","ui.maintenance.setupAction");
            if(await dialog.ShowAsync()!=ContentDialogResult.Primary)return;
            install.IsEnabled=reconnect.IsEnabled=false;
            try {
                if(!File.Exists(NativeCoreSetup.Executable(services.Root)))throw new IOException(AppLanguage.Text("ui.maintenance.missingSetup"));
                await services.DisconnectAsync();await NativeCoreSetup.RunAsync(services.Root,repair:true);await services.ConnectAsync();
                ReportResource("ui.maintenance.configured");
            }catch(Exception error){Report(error.Message);}
            finally{install.IsEnabled=reconnect.IsEnabled=true;}
        };
    }
}
