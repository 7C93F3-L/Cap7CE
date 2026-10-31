using Cap7CE.WinUI.Localization;

namespace Cap7CE.WinUI.Services;

// Installer-only entry: no window, app singleton, Core session or automatic scan.
internal static class InstallerSearchSetup
{
    public static bool IsRequest(string[] args)=>args is ["--install-search-service"] or ["--verify-search-setup-entry"];
    public static async Task<int> RunAsync(string[] args)
    {
        if(!IsRequest(args))return 2;
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
            await NativeCoreSetup.RunAsync(root,repair:true);
            File.WriteAllText(log,"search-service-configured");return 0;
        }catch(Exception error){
            try{File.WriteAllText(log,error.ToString());}catch{}
            return error is UiFailure&&error.Message=="ui.error.runtimeRestartRequired"?3010:1;
        }
    }
}
