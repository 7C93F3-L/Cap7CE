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
    private readonly TextBlock summary=Ui.Text("",true),recent=Ui.Text("",true),feedback=Ui.Text("",true);
    private readonly Button refresh,export,openRecord;
    private string? recordPath;
    private string reader="unknown";
    private DateTime? lastError;
    private bool refreshing;
    public DiagnosticsView(ShellServices services,Window owner)
    {
        this.services=services;this.owner=owner;Spacing=10;
        refresh=L.Button("common.refresh",async()=>await RefreshAsync());export=L.Button("settings.exportDiagnostics",async()=>await ExportAsync());
        openRecord=L.Button("common.open",()=>{try{if(recordPath is {} logPath)System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(logPath){UseShellExecute=true});}catch(Exception error){ShowError(error);}});openRecord.IsEnabled=false;
        Children.Add(new SettingsFieldRow("ui.diagnostics.status",summary,refresh,localized:true));
        Children.Add(new SettingsFieldRow("ui.diagnostics.recent",recent,openRecord,localized:true));
        var path=Ui.Text(PreferenceStore.DataRoot,true);path.IsTextSelectionEnabled=true;
        Children.Add(new SettingsFieldRow("ui.diagnostics.path",path,L.Button("native.diagnostics.openFolder",OpenFolder),localized:true));
        Children.Add(new SettingsFieldRow("settings.diagnosticsBundle",L.Text("native.diagnostics.exportDescription",true),export,localized:true));
        Children.Add(feedback);Loaded+=async(_,_)=>await RefreshAsync();
    }
    private async Task RefreshAsync()
    {
        if(refreshing)return;refreshing=true;refresh.IsEnabled=false;
        try {
            reader=await Task.Run(ReaderDiagnosticStatus.Read);
            var latest=await Task.Run(()=>DiagnosticsArchive.LogNames.Where(name=>name.EndsWith(".log",StringComparison.Ordinal)).Select(name=>new FileInfo(Path.Combine(PreferenceStore.DataRoot,name))).Where(file=>file.Exists).OrderByDescending(file=>file.LastWriteTimeUtc).FirstOrDefault());
            lastError=latest?.LastWriteTime;recordPath=latest?.FullName;openRecord.IsEnabled=latest is not null;
            // Capture state once; language changes only reformat the snapshot.
            var core=services.Core?.IsConnected==true;var edge=services.Preferences.Current.EdgeCollapseEnabled;
            var notification=DiagnosticSnapshot.NotificationState(services);
            var state=reader;var timestamp=lastError;
            L.Computed(summary,()=>AppLanguage.Text("ui.diagnostics.summary",new Dictionary<string,object?>{{"core",AppLanguage.Text(core?"ui.diagnostics.connected":"ui.diagnostics.disconnected")},{"reader",AppLanguage.Text("ui.diagnostics.reader."+state)},{"edge",AppLanguage.Text(edge?"settings.enabled":"settings.disabled")},{"notification",AppLanguage.Text("ui.diagnostics.notification."+notification)}}));
            if(timestamp is {} time)L.Bind(recent,TextBlock.TextProperty,"ui.diagnostics.recordTime",()=>new Dictionary<string,object?>{{"time",time.ToString("yyyy-MM-dd HH:mm:ss")}});else L.Bind(recent,TextBlock.TextProperty,"common.notCreated");
        }catch(Exception error){ShowError(error);}
        finally{refreshing=false;refresh.IsEnabled=true;}
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
