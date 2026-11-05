using Cap7CE.WinUI.Localization;

namespace Cap7CE.WinUI.Services;

// Installer-only text sink: no UI, task ownership or persistent progress files.
internal sealed class InstallerSearchProgress(LanguageCatalog catalog,string language,TextWriter output)
{
    private bool unavailable;
    public void Report(CoreRuntimeProgress progress)
    {
        if(unavailable)return;
        var key=progress.Stage switch {
            CoreRuntimeStage.Checking=>"ui.installer.search.checkRuntime",
            CoreRuntimeStage.Downloading=>progress.Percent.HasValue?"ui.installer.search.downloadPercent":"ui.installer.search.downloading",
            CoreRuntimeStage.Verifying=>"ui.installer.search.verifying",
            CoreRuntimeStage.Installing=>"ui.installer.search.installRuntime",
            CoreRuntimeStage.Configuring=>"ui.installer.search.configuring",
            CoreRuntimeStage.Completed=>"ui.installer.search.completed",
            _=>throw new ArgumentOutOfRangeException(nameof(progress))
        };
        var text=catalog.Text(key,language,new Dictionary<string,object?>{{"percent",progress.Percent}});
        try{output.WriteLine(text);output.Flush();}
        catch(Exception error) when(error is IOException or ObjectDisposedException){unavailable=true;}
    }
}
