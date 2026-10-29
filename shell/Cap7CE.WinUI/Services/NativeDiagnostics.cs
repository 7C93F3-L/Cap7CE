using Microsoft.UI.Xaml;
using Windows.Storage.Pickers;

namespace Cap7CE.WinUI.Services;

internal static class NativeDiagnostics
{
    private static string? lastVisualFailure;
    public static void VisualFailure(Exception error)
    {
        var text=error+"\n"+error.Data["CoreMessage"];if(Interlocked.Exchange(ref lastVisualFailure,text)==text)return;
        try{Directory.CreateDirectory(PreferenceStore.DataRoot);File.WriteAllText(Path.Combine(PreferenceStore.DataRoot,"last-visual-error.log"),text[..Math.Min(text.Length,16000)]);}catch{}
    }
    public static void CoreFailure(string text)
    {
        try{Directory.CreateDirectory(PreferenceStore.DataRoot);File.WriteAllText(Path.Combine(PreferenceStore.DataRoot,"last-core-error.log"),text[..Math.Min(text.Length,16000)]);}catch{}
    }
    public static void CoreRuntimeFailure(string text)
    {
        try{Directory.CreateDirectory(PreferenceStore.DataRoot);File.WriteAllText(Path.Combine(PreferenceStore.DataRoot,"last-core-runtime-error.log"),text[..Math.Min(text.Length,16000)]);}catch{}
    }
    public static async Task<bool> ExportAsync(Window owner,object snapshot)
    {
        var picker=new FileSavePicker {SuggestedFileName="Cap7CE-diagnostics"};picker.FileTypeChoices.Add("ZIP",new[]{".zip"});
        WinRT.Interop.InitializeWithWindow.Initialize(picker,WinRT.Interop.WindowNative.GetWindowHandle(owner));
        var file=await picker.PickSaveFileAsync();if(file is null)return false;
        var temporary=file.Path+"."+Guid.NewGuid().ToString("N")+".tmp";
        try {
            await using(var output=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None))
                await DiagnosticsArchive.WriteAsync(output,PreferenceStore.DataRoot,snapshot);
            File.Move(temporary,file.Path,true);return true;
        }finally{if(File.Exists(temporary))File.Delete(temporary);}
    }
}
