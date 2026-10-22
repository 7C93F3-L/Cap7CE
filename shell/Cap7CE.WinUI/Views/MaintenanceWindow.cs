using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Views;

internal sealed class MaintenanceWindow : Window
{
    private readonly MetadataMaintenanceView metadata;
    public void SetDirectory(string path)=>metadata.SetDirectory(path);
    public MaintenanceWindow(ShellServices services)
    {
        SettingsWindowGeometry.ApplyInitial(this);
        var status=Ui.Text("Core产品宿主：目录索引与属性任务",true);
        var reconnect=Ui.Button("重新连接Core",()=>{});
        var install=Ui.Button("安装/修复索引服务",()=>{});
        var root=new Grid();
        metadata=new(services,this);
        var index=new IndexMaintenanceView(services);
        AppWindow.Changed+=(_,_)=>{if(AppWindow.Presenter is Microsoft.UI.Windowing.OverlappedPresenter {State:Microsoft.UI.Windowing.OverlappedPresenterState.Minimized}){index.StopMonitoring();metadata.StopMonitoring();}};
        reconnect.Click+=async(_,_)=>{reconnect.IsEnabled=false;try{await services.ConnectAsync();status.Text="Core已连接，请刷新下方状态。";}catch(Exception e){status.Text=e.Message;}finally{reconnect.IsEnabled=true;}};
        install.Click+=async(_,_)=>{
            var dialog=new ContentDialog {XamlRoot=root.XamlRoot,Title="配置Core与索引服务",Content="会暂停当前Core任务，并请求管理员授权安装或修复索引服务。保留现有Catalog与素材；请先关闭其他Cap7CE程序。Reader服务需要.NET 10 x64运行时。",PrimaryButtonText="安装/修复",CloseButtonText="取消",DefaultButton=ContentDialogButton.Close};
            if(await dialog.ShowAsync()!=ContentDialogResult.Primary)return;
            install.IsEnabled=reconnect.IsEnabled=false;
            try {
                if(!File.Exists(NativeCoreSetup.Executable(services.Root)))throw new IOException("Core安装组件缺失，请重新构建或解压完整程序包。");
                await services.DisconnectAsync();await NativeCoreSetup.RunAsync(services.Root,repair:true);await services.ConnectAsync();status.Text="Core配置完成，请刷新磁盘状态。";
            } catch(Exception e){status.Text=e.Message;}
            finally{install.IsEnabled=reconnect.IsEnabled=true;}
        };
        var column=Ui.Column(Ui.Row(Ui.Heading("索引与属性任务"),reconnect,install),status,
            new SettingsCard("目录索引","文件名与目录结构，由Core和Reader维护。",index,true),
            new SettingsCard("文件属性","按明确指定的范围读取内容并提取属性。单文件入口会预填其所在目录，请确认范围。",metadata,true));
        column.Margin=new(20);column.MaxWidth=1040;
        var scroll=new ScrollViewer {Content=column,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled};IdleScrollBars.Attach(scroll);
        root.Children.Add(scroll);Content=root;
        var closed=false;
        void Apply()=>DispatcherQueue.TryEnqueue(()=>{if(!closed)ThemeService.Apply(this,root,services.Preferences.Current);});
        services.Preferences.Changed+=Apply;Closed+=(_,_)=>{closed=true;services.Preferences.Changed-=Apply;};Apply();
    }
}
