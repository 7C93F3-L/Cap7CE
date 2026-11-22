using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using L=Cap7CE.WinUI.Localization.LanguageUi;

namespace Cap7CE.WinUI.Views;
internal sealed class DiagnosticsView : StackPanel
{
    private readonly ShellServices services;
    private readonly Window owner;
    private readonly TextBlock recent=Ui.Text("",true),feedback=Ui.Text("",true);
    private readonly TextBlock coreState=L.Text("common.loading",true),readerState=L.Text("common.loading",true),
        updateState=L.Text("common.loading",true),updateHint=Ui.Text("",true);
    private readonly Button refresh,export,openRecord;
    private string? recordPath;
    private string reader="unknown";
    private DateTime? lastError;
    private bool refreshing,active;
    public DiagnosticsView(ShellServices services,Window owner)
    {
        this.services=services;this.owner=owner;Spacing=6;
        refresh=L.Button("common.refresh",async()=>await RefreshAsync());export=L.Button("settings.exportDiagnostics",async()=>await ExportAsync());
        openRecord=L.Button("common.open",()=>{try{if(recordPath is {} logPath)System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(logPath){UseShellExecute=true});}catch(Exception error){ShowError(error);}});openRecord.IsEnabled=false;
        var status=Ui.Column();var updateDetails=Ui.Column(updateState,updateHint);updateDetails.Spacing=3;
        updateHint.Visibility=Visibility.Collapsed;updateState.IsTextSelectionEnabled=updateHint.IsTextSelectionEnabled=true;
        foreach(var (key,value) in new (string,FrameworkElement)[]{("ui.diagnostics.coreLabel",coreState),("ui.diagnostics.readerLabel",readerState),
            ("ui.diagnostics.updateLabel",updateDetails)}) {
            if(value is TextBlock text)text.IsTextSelectionEnabled=true;status.Children.Add(new SettingsFieldRow(key,value,localized:true));
        }
        var maintenance=new CoreMaintenanceView(services,owner,RefreshAsync);
        maintenance.Section.AttachBody();
        var maintenanceActions=(StackPanel)maintenance.Section.Actions;
        var buttons=Ui.Row(refresh,maintenanceActions);buttons.HorizontalAlignment=HorizontalAlignment.Right;buttons.Margin=new(0,8,0,0);
        status.SizeChanged+=(_,_)=>{
            var orientation=status.ActualWidth<520?Orientation.Vertical:Orientation.Horizontal;
            buttons.Orientation=maintenanceActions.Orientation=orientation;
        };
        status.Spacing=10;status.Children.Add(buttons);status.Children.Add(maintenance.Section);
        Children.Add(new SettingsCard("ui.diagnostics.status","ui.diagnostics.statusHint",new SettingsExpandable(status),localized:true));
        Children.Add(new SettingsCard("ui.diagnostics.recent","",openRecord,localized:true,descriptionContent:recent));
        var path=Ui.Text(PreferenceStore.DataRoot,true);path.IsTextSelectionEnabled=true;
        Children.Add(new SettingsCard("ui.diagnostics.path","",L.Button("native.diagnostics.openFolder",OpenFolder),localized:true,descriptionContent:path));
        Children.Add(new SettingsCard("settings.diagnosticsBundle","native.diagnostics.exportDescription",export,localized:true));
        Children.Add(feedback);
        Loaded+=async(_,_)=>{
            if(active)return;active=true;
            services.ConnectionChanged+=QueueState;services.CatalogMaintenanceChanged+=QueueState;
            RenderState();await RefreshAsync();
        };
        Unloaded+=(_,_)=>{
            active=false;services.ConnectionChanged-=QueueState;services.CatalogMaintenanceChanged-=QueueState;
        };
    }
    private async Task RefreshAsync()
    {
        if(!active||refreshing)return;refreshing=true;refresh.IsEnabled=false;
        try {
            reader=await Task.Run(ReaderDiagnosticStatus.Read);
            var latest=await Task.Run(()=>DiagnosticsArchive.LogNames.Where(name=>name.EndsWith(".log",StringComparison.Ordinal)).Select(name=>new FileInfo(Path.Combine(PreferenceStore.DataRoot,name))).Where(file=>file.Exists).OrderByDescending(file=>file.LastWriteTimeUtc).FirstOrDefault());
            if(!active)return;
            lastError=latest?.LastWriteTime;recordPath=latest?.FullName;openRecord.IsEnabled=latest is not null;
            RenderState();var timestamp=lastError;
            if(timestamp is {} time)L.Bind(recent,TextBlock.TextProperty,"ui.diagnostics.recordTime",()=>new Dictionary<string,object?>{{"time",time.ToString("yyyy-MM-dd HH:mm:ss")}});else L.Bind(recent,TextBlock.TextProperty,"common.notCreated");
        }catch(Exception error){ShowError(error);}
        finally{refreshing=false;refresh.IsEnabled=true;}
    }
    private void QueueState()=>DispatcherQueue.TryEnqueue(()=>{if(active)RenderState();});
    private void RenderState()
    {
        var connected=services.Core?.IsConnected==true;
        L.Bind(coreState,TextBlock.TextProperty,connected?"ui.diagnostics.connected":"ui.diagnostics.disconnected");
        L.Bind(readerState,TextBlock.TextProperty,"ui.diagnostics.reader."+reader);
        var state=!connected?"disconnected":services.CatalogMaintenance?.State switch {
            "watching"=>"watching","idle"=>"idle","starting"=>"starting","paused"=>"paused",
            "failed"=>"failed","unavailable"=>"unavailable",_=>"unknown"
        };
        L.Bind(updateState,TextBlock.TextProperty,"ui.diagnostics.update."+state);
        updateHint.Visibility=state is "failed" or "unavailable"?Visibility.Visible:Visibility.Collapsed;
        if(state is "failed" or "unavailable")L.Bind(updateHint,TextBlock.TextProperty,
            state=="unavailable"?"ui.diagnostics.update.repairHint":"ui.diagnostics.update.reconnectHint");
    }
    private void OpenFolder()
    {try{Directory.CreateDirectory(PreferenceStore.DataRoot);FileCommands.OpenDirectoryInExplorer(PreferenceStore.DataRoot);}catch(Exception error){ShowError(error);}}
    private async Task ExportAsync()
    {
        export.IsEnabled=false;
        L.Bind(feedback,TextBlock.TextProperty,"common.loading");
        try{var state=await Task.Run(ReaderDiagnosticStatus.Read);var snapshot=DiagnosticSnapshot.Capture(services,state);L.Bind(feedback,TextBlock.TextProperty,await NativeDiagnostics.ExportAsync(owner,snapshot)?"ui.diagnostics.exported":"common.cancelled");}
        catch(Exception error){ShowError(error);}
        finally{export.IsEnabled=true;}
    }
    private void ShowError(Exception error)=>L.Message(feedback,TextBlock.TextProperty,FailureText.From(error));
}
