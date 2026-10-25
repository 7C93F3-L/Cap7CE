using Cap7CE.WinUI.Controls;
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
        var reconnect=Ui.Button("重新连接Core",()=>{});
        var install=Ui.Button("安装/修复索引服务",()=>{});
        Section=new(Ui.Row(reconnect,install),status){Visibility=Visibility.Collapsed};
        void Report(string text){status.Text=text;Section.Visibility=Visibility.Visible;}
        reconnect.Click+=async(_,_)=>{
            install.IsEnabled=reconnect.IsEnabled=false;
            try{await services.ConnectAsync();Report("后台服务已重新连接。");}
            catch(Exception error){Report(error.Message);}
            finally{install.IsEnabled=reconnect.IsEnabled=true;}
        };
        install.Click+=async(_,_)=>{
            var dialog=new ContentDialog {XamlRoot=owner.Content.XamlRoot,Title="配置Core与索引服务",Content="会暂停当前Core任务，并请求管理员授权安装或修复索引服务。保留现有Catalog与素材；请先关闭其他Cap7CE程序。Reader服务需要.NET 10 x64运行时。",PrimaryButtonText="安装/修复",CloseButtonText="取消",DefaultButton=ContentDialogButton.Close};
            if(await dialog.ShowAsync()!=ContentDialogResult.Primary)return;
            install.IsEnabled=reconnect.IsEnabled=false;
            try {
                if(!File.Exists(NativeCoreSetup.Executable(services.Root)))throw new IOException("Core安装组件缺失，请重新构建或解压完整程序包。");
                await services.DisconnectAsync();await NativeCoreSetup.RunAsync(services.Root,repair:true);await services.ConnectAsync();
                Report("索引服务配置完成。");
            }catch(Exception error){Report(error.Message);}
            finally{install.IsEnabled=reconnect.IsEnabled=true;}
        };
    }
}
