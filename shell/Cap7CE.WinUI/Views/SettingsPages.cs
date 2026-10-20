using System.Diagnostics;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Storage.Pickers;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Controls;

namespace Cap7CE.WinUI.Views;
internal sealed class SettingsPages(ShellServices services, Window owner, Action<string> notice)
{
    private readonly List<(string Category,string Title,string Description,Func<UIElement> Control)> entries=[];
    private bool initialized;
    public UIElement Build(string category,string query)
    {
        if(!initialized){Initialize();initialized=true;}
        var column=Ui.Column(Ui.Heading(query.Length==0?category:"设置搜索"));
        foreach(var row in entries.Where(e=>query.Length==0?e.Category==category:(e.Title+e.Description+e.Category).Contains(query,StringComparison.OrdinalIgnoreCase)))
        {
            var grid=new Grid {ColumnSpacing=20};grid.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});grid.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
            grid.Children.Add(Ui.Column(Ui.Text(row.Title),Ui.Text(row.Description,true)));
            var control=(FrameworkElement)row.Control();Grid.SetColumn(control,1);grid.Children.Add(control);column.Children.Add(Ui.Panel(grid));
        }
        return column;
    }
    private void Add(string category,string title,string description,Func<UIElement> control)=>entries.Add((category,title,description,control));
    private void Run(Func<Task> work)=>Execute(work);
    private async void Execute(Func<Task> work){try{await work();}catch(Exception error){notice(error.Message);}}
    private void Initialize()
    {
        Add("常规","WinUI 工作区","窗口、布局偏好独立保存，收藏与查询复用现有Core。",()=>Ui.Button("打开偏好位置",()=>Open(PreferenceStore.DataRoot)));
        Add("常规","重新连接 Core","连接已有目录；关键词保存仅由明确点击触发，不初始化、不建库。",()=>Ui.Button("重新连接",()=>Run(async()=>{await services.ConnectAsync();notice("Core 已连接，请刷新工作区");})));
        Add("常规","显示隐藏项目","新建标签默认值。",()=>Toggle(services.Preferences.Current.ShowHidden,v=>services.Preferences.SaveAsync(services.Preferences.Current with{ShowHidden=v})));
        Add("常规","包含子文件夹","新建标签默认值；关键词搜索始终覆盖当前目录及子目录。",()=>Toggle(services.Preferences.Current.Recursive,v=>services.Preferences.SaveAsync(services.Preferences.Current with{Recursive=v})));
        Add("外观","窗口材质","主窗口与设置窗口共用选择；菜单和浮层使用亚克力。",()=>Ui.Select(["云母 Mica","云母 Mica Alt"],services.Preferences.Current.Material=="mica-alt"?1:0,i=>Run(()=>services.Preferences.SaveAsync(services.Preferences.Current with{Material=i==0?"mica":"mica-alt"}))));
        Add("外观","明暗主题","跟随系统，或固定浅色/深色。",()=>Ui.Select(["跟随系统","浅色","深色"],Array.IndexOf(new[]{"system","light","dark"},services.Preferences.Current.Theme),i=>Run(()=>services.Preferences.SaveAsync(services.Preferences.Current with{Theme=new[]{"system","light","dark"}[i]}))));
        Add("外观","颜色 1 / 颜色 2","共用强调色与品牌渐变。",Colors);
        Add("外观","界面字号","10–24 px。",()=>Number(services.Preferences.Current.FontSize,10,24,v=>services.Preferences.SaveAsync(services.Preferences.Current with{FontSize=v})));
        Add("外观","素材尺寸","96–280 px；工具条也可直接调整。",()=>Number(services.Preferences.Current.TileSize,96,280,v=>services.Preferences.SaveAsync(services.Preferences.Current with{TileSize=v})));
        Add("外观","缩略图比例","方形裁切或保留原比例。",()=>Toggle(services.Preferences.Current.SquareTiles,v=>services.Preferences.SaveAsync(services.Preferences.Current with{SquareTiles=v})));
        Add("外观","顶部筛选", "显示时间、种类、大小、格式及属性条件。",()=>Toggle(services.Preferences.Current.ShowFilters,v=>services.Preferences.SaveAsync(services.Preferences.Current with{ShowFilters=v})));
        Add("外观","详细信息", "显示选中信息和关键词。",()=>Toggle(services.Preferences.Current.ShowDetails,v=>services.Preferences.SaveAsync(services.Preferences.Current with{ShowDetails=v})));
        Add("缓存与索引","视觉缓存","只管理WinUI实验缓存，不清理Electron现有缓存。",Cache);
        Add("缓存与索引","目录状态","读取当前Catalog状态；不启动全盘重建或属性提取。",Status);
        Add("快捷操作","导航与搜索","Ctrl+T 新标签 · Ctrl+W 关闭标签 · Ctrl+O 打开目录\nCtrl+F 搜索 · Ctrl+L 路径 · F5 刷新 · Alt+←/→ 历史",()=>Ui.Text("当前窗口快捷键"));
        Add("快捷操作","选择与文件","Ctrl+A 全选 · Ctrl+C 复制文件 · Delete 回收站\nSpace 预览 · Enter 打开 · Esc 关闭预览",()=>Ui.Text("复用统一文件动作"));
        Add("运行组件与模型","本地模型与运行组件","读取、选择和手动启动由Core拥有；不会随打开设置自动加载模型。",()=>new ModelSettingsView(services,notice));
        Add("诊断","运行状态","显示当前Core连接和查询磁盘状态。",Status);
        Add("诊断","系统信息","仅导出系统、.NET和架构信息，不包含素材路径或数据库。",()=>Ui.Button("导出…",()=>Run(ExportAsync)));
        Add("关于","Cap7CE · WinUI","1.0.4 · x64 · 原生壳迁移开发版",()=>Ui.Button("项目主页",()=>Open("https://github.com/7C93F3-L/Cap7CE")));
        Add("关于","许可证","沿用项目许可证与现有图标授权。",()=>Ui.Button("查看",()=>Open(Path.Combine(services.Root,"LICENSE"))));
        Add("关于","暂缺项目","停靠/mini、托盘与全局快捷键、建库控制、AI关键词批处理及自动更新尚未迁入。",()=>Ui.Text("后续讨论接入方向"));
    }
    private UIElement Colors()
    {
        var first=new TextBox {Text=services.Preferences.Current.Color1,Width=100};var second=new TextBox {Text=services.Preferences.Current.Color2,Width=100};
        return Ui.Row(first,second,Ui.Button("保存",()=>Run(async()=>{
            if(!System.Text.RegularExpressions.Regex.IsMatch(first.Text,"^#[0-9a-fA-F]{6}$")||!System.Text.RegularExpressions.Regex.IsMatch(second.Text,"^#[0-9a-fA-F]{6}$"))throw new IOException("请输入 #RRGGBB 颜色");
            await services.Preferences.SaveAsync(services.Preferences.Current with{Color1=first.Text,Color2=second.Text});
        })));
    }
    private UIElement Toggle(bool value,Func<bool,Task> change){var toggle=new ToggleSwitch {IsOn=value};toggle.Toggled+=(_,_)=>Run(()=>change(toggle.IsOn));return toggle;}
    private UIElement Number(double value,double min,double max,Func<double,Task> change)
    {var number=new NumberBox {Value=value,Minimum=min,Maximum=max,Width=110,SpinButtonPlacementMode=NumberBoxSpinButtonPlacementMode.Inline};return Ui.Row(number,Ui.Button("应用",()=>Run(()=>change(double.IsFinite(number.Value)?number.Value:value))));}
    private UIElement Cache()
    {
        var result=Ui.Text("点击刷新读取统计",true);
        return Ui.Column(Ui.Row(Ui.Button("刷新",()=>Run(async()=>{var stats=await services.Visuals.RequestAsync("skimStats");result.Text=$"{stats.GetProperty("cacheCount")} 个缓存 · {stats.GetProperty("totalBytes").GetInt64()/1048576d:N1} MB";})),Ui.Button("清理…",()=>Run(async()=>{
            var dialog=new ContentDialog {XamlRoot=((FrameworkElement)owner.Content).XamlRoot,Title="清理WinUI视觉缓存",Content="仅清理验证壳生成的缩略图和预览。",PrimaryButtonText="清理",CloseButtonText="取消",DefaultButton=ContentDialogButton.Close};
            if(await dialog.ShowAsync()!=ContentDialogResult.Primary)return;await services.ReleaseSourcesAsync();await services.Visuals.RequestAsync("clearSkim");result.Text="已清理";
        }))),result);
    }
    private UIElement Status()
    {var result=Ui.Text("",true);return Ui.Column(Ui.Button("刷新状态",()=>Run(async()=>{await services.RefreshVolumesAsync();result.Text=services.Core is null?"未连接":string.Join("\n",services.Volumes.Select(v=>$"{v.DisplayName} · {v.State} · {(v.Queryable?"可查询":"不可查询")}"));})),result);}
    private async Task ExportAsync()
    {
        var picker=new FileSavePicker {SuggestedFileName="Cap7CE-WinUI-System"};picker.FileTypeChoices.Add("文本",new[]{".txt"});
        WinRT.Interop.InitializeWithWindow.Initialize(picker,WinRT.Interop.WindowNative.GetWindowHandle(owner));
        if(await picker.PickSaveFileAsync() is { } file)await Windows.Storage.FileIO.WriteTextAsync(file,$"Cap7CE WinUI 1.0.4\nOS: {Environment.OSVersion}\n.NET: {Environment.Version}\nArchitecture: {System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture}\nLogical processors: {Environment.ProcessorCount}");
    }
    private void Open(string path){try{if(Path.IsPathFullyQualified(path)&&!File.Exists(path)&&!Directory.Exists(path))throw new IOException("位置尚不存在");Process.Start(new ProcessStartInfo(path){UseShellExecute=true});}catch(Exception error){notice(error.Message);}}
}
