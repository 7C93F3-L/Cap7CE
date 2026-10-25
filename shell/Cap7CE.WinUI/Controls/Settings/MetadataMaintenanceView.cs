using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Storage.Pickers;
using System.Text.Json;

namespace Cap7CE.WinUI.Controls;

internal sealed class MetadataMaintenanceView : UserControl
{
    private readonly ShellServices services;
    private readonly Window owner;
    private readonly TextBox directory=new(){PlaceholderText="选择要提取的目录（包含子目录）",MinWidth=0};
    private readonly TextBlock status=Ui.Text("正在读取任务状态…");
    private readonly TextBlock current=Ui.Text("",true),counts=Ui.Text("",true),error=Ui.Text("",true);
    private readonly ProgressBar progress=new(){Height=4,HorizontalAlignment=HorizontalAlignment.Stretch};
    private readonly StackPanel taskArea=Ui.Column();
    private readonly Button browse,start,all,control,cancel,refresh;
    private MetadataPanelState? state;
    private bool listening,busy,reload;
    public void SetDirectory(string path)=>directory.Text=path;
    public MetadataMaintenanceView(ShellServices services,Window owner)
    {
        this.services=services;this.owner=owner;
        browse=Action("选择目录",ChooseAsync);
        start=Action("提取目录",()=>StartAsync(false));all=Action("提取已索引磁盘",()=>StartAsync(true));
        start.Style=(Style)Application.Current.Resources["AccentButtonStyle"];
        control=Action("暂停",()=>InvokeAsync(state?.CanResume==true?"resume":"pause"));
        cancel=Action("取消队列",()=>InvokeAsync("cancelDirectories"));refresh=Action("刷新",()=>InvokeAsync("status"));
        ToolTipService.SetToolTip(cancel,"停止当前目录并清空排队目录，已提取的结果保留。");
        var path=new Grid {ColumnSpacing=8};path.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});path.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        path.Children.Add(directory);Grid.SetColumn(browse,1);path.Children.Add(browse);
        var tools=new Grid {ColumnSpacing=16};tools.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});tools.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        tools.Children.Add(Scroll(Ui.Row(control,cancel)));Grid.SetColumn(refresh,1);tools.Children.Add(refresh);
        current.TextWrapping=TextWrapping.NoWrap;current.TextTrimming=TextTrimming.CharacterEllipsis;
        taskArea.Children.Add(current);taskArea.Children.Add(progress);taskArea.Children.Add(counts);taskArea.Children.Add(tools);
        Content=Ui.Column(path,Scroll(Ui.Row(start,all)),status,taskArea,error);
        directory.TextChanged+=(_,_)=>Render();
        Loaded+=(_,_)=>{
            if(listening)return;listening=true;
            services.Metadata.Changed+=Changed;services.ConnectionChanged+=ConnectionChanged;services.IndexStatusChanged+=IndexChanged;
            if(Connected)Run(()=>InvokeAsync("status"));else Render();
        };
        Unloaded+=(_,_)=>{listening=false;services.Metadata.Changed-=Changed;services.ConnectionChanged-=ConnectionChanged;services.IndexStatusChanged-=IndexChanged;progress.IsIndeterminate=false;};
        Render();
    }
    private bool Connected=>services.Core?.IsConnected==true&&services.Core.Supports(MetadataBuildOperations.Attach);
    private static ScrollViewer Scroll(UIElement content)=>new(){Content=content,HorizontalScrollBarVisibility=ScrollBarVisibility.Auto,VerticalScrollBarVisibility=ScrollBarVisibility.Disabled};
    private Button Action(string title,Func<Task> work)=>Ui.Button(title,()=>Run(work));
    private async void Run(Func<Task> action)
    {
        if(busy)return;busy=true;error.Text="";Render();
        try{await action();}catch(Exception failure){error.Text=MetadataPanelState.DescribeError(failure.Message);}
        finally{busy=false;if(listening){if(reload&&Connected){reload=false;Run(()=>InvokeAsync("status"));}else Render();}}
    }
    private async Task ChooseAsync()
    {
        var picker=new FolderPicker();picker.FileTypeFilter.Add("*");WinRT.Interop.InitializeWithWindow.Initialize(picker,WinRT.Interop.WindowNative.GetWindowHandle(owner));
        if(await picker.PickSingleFolderAsync() is {} folder)directory.Text=folder.Path;
    }
    private async Task StartAsync(bool allVolumes)
    {
        var path=directory.Text.Trim();if(!allVolumes&&!Directory.Exists(path))throw new IOException("请选择存在的本地目录。");
        var dialog=new ContentDialog {XamlRoot=XamlRoot,Title="提取元数据",Content=allVolumes?"提取已选择并建立索引的磁盘中的文件属性？此范围可能很大。":$"提取此目录及子目录的文件属性？\n{path}",
            PrimaryButtonText=state?.Pending>0?"加入队列":"开始提取",CloseButtonText="取消",DefaultButton=ContentDialogButton.Close};
        if(await dialog.ShowAsync()!=ContentDialogResult.Primary)return;
        await services.Metadata.InvokeAsync(allVolumes?"startAllVolumes":"startDirectory",allVolumes?new{allowMetadataExtraction=true}:(object)new{path,allowMetadataExtraction=true});
    }
    private async Task InvokeAsync(string operation)=>await services.Metadata.InvokeAsync(operation);
    private void Changed(JsonElement result,MetadataTaskStatus _)=>DispatcherQueue.TryEnqueue(()=>{
        if(!listening)return;state=MetadataPanelState.Read(result);error.Text="";Render();
    });
    private void IndexChanged(CatalogStatusResponse _)=>DispatcherQueue.TryEnqueue(()=>{if(listening)Render();});
    private void ConnectionChanged()=>DispatcherQueue.TryEnqueue(()=>{
        if(!listening)return;state=null;error.Text="";reload=Connected&&busy;
        if(Connected&&!busy)Run(()=>InvokeAsync("status"));else Render();
    });
    private void Render()
    {
        var connected=Connected;var ready=connected&&state is not null&&!busy;
        browse.IsEnabled=directory.IsEnabled=!busy;
        start.IsEnabled=ready&&!string.IsNullOrWhiteSpace(directory.Text);
        start.Content=state?.Pending>0?"加入目录队列":"提取目录";
        all.IsEnabled=ready&&services.Volumes.Any(volume=>volume.Selected&&(volume.Queryable||volume.State is "building" or "discovering" or "catchingUp"));
        control.Content=state?.ControlText??"暂停";control.IsEnabled=ready&&(state!.CanPause||state.CanResume);
        cancel.IsEnabled=ready&&state!.CanCancel;refresh.IsEnabled=connected&&!busy;
        status.Text=!connected?"元数据服务未连接或不可用，请在上方“服务维护”中重新连接。":state?.Title??"正在读取任务状态…";
        status.Visibility=!connected||state is null||state.ShowTaskArea?Visibility.Visible:Visibility.Collapsed;
        taskArea.Visibility=connected&&state?.ShowTaskArea==true?Visibility.Visible:Visibility.Collapsed;
        current.Text=state?.Directory is {} path?"当前目录："+path+(state.Pending>1?$" · 另有 {state.Pending-1} 个目录排队":""):"";
        current.Visibility=connected&&state?.Pending>0?Visibility.Visible:Visibility.Collapsed;ToolTipService.SetToolTip(current,state?.Directory);
        counts.Text=state?.Counts??"";counts.Visibility=connected&&state?.ShowCounts==true?Visibility.Visible:Visibility.Collapsed;
        progress.Visibility=connected&&state?.ShowProgress==true?Visibility.Visible:Visibility.Collapsed;
        progress.Maximum=1;progress.Value=state?.Progress.Fraction??0;
        progress.IsIndeterminate=listening&&connected&&state?.CanPause==true&&state.Progress.Fraction is null;
        if(string.IsNullOrEmpty(error.Text)&&state?.Progress.ErrorCode is {} code)error.Text=MetadataPanelState.DescribeError(code);
        ToolTipService.SetToolTip(error,state?.Progress.ErrorCode);
        error.Visibility=connected&&!string.IsNullOrEmpty(error.Text)?Visibility.Visible:Visibility.Collapsed;
    }
}
