using Cap7CE.WinUI.Localization;
using System.Text;

namespace Cap7CE.WinUI.Services;

// Installer-only entry: no window, app singleton, Core session or automatic scan.
internal static class InstallerSearchSetup
{
    public static bool IsRequest(string[] args)=>args.Length>0&&args[0] is "--install-search-service" or "--verify-search-setup-entry";
    public static async Task<int> RunAsync(string[] args)
    {
        if(args is not (["--install-search-service"] or ["--install-search-service","--language","1033" or "2052"] or ["--verify-search-setup-entry"]))return 2;
        var root=AppContext.BaseDirectory;
        var log=Path.Combine(Path.GetTempPath(),"cap7ce-install-search.log");
        try {
            _=CoreRuntimePolicy.Load();
            if(!File.Exists(Path.Combine(root,"cap7ce-native.json"))||!File.Exists(NativeCoreSetup.Executable(root)))
                throw new IOException("installer-search-payload-missing");
            // Package verification remains strictly read-only, including on machines without .NET.
            if(args is ["--verify-search-setup-entry"])return 0;
            if(!InstallerAccount.MatchesDesktop()) {
                File.WriteAllText(log,"installer-account-mismatch");return 6;
            }
            var catalog=new LanguageCatalog(File.ReadAllText(Path.Combine(root,"Assets/languages.json")));
            // nsExec's Unicode pipe accepts UTF-16LE; flush each line for live installation details.
            using var output=new StreamWriter(Console.OpenStandardOutput(),Encoding.Unicode,1024,leaveOpen:true);
            var progress=new InstallerSearchProgress(catalog,args is [_,_,"2052"]?"zh-CN":"en-US",output);
            await NativeCoreSetup.RunAsync(root,repair:true,progress:progress.Report);
            progress.Report(new(CoreRuntimeStage.Completed));
            File.WriteAllText(log,"search-service-configured");return 0;
        }catch(Exception error){
            try{File.WriteAllText(log,error.ToString());}catch{}
            return error is UiFailure&&error.Message=="ui.error.runtimeRestartRequired"?3010:1;
        }
    }
}
