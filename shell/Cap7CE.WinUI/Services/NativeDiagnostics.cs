using System.IO.Compression;
using System.Text.Json;
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
    public static async Task ExportAsync(Window owner)
    {
        var picker=new FileSavePicker {SuggestedFileName="Cap7CE-WinUI-diagnostics"};picker.FileTypeChoices.Add("ZIP",new[]{".zip"});
        WinRT.Interop.InitializeWithWindow.Initialize(picker,WinRT.Interop.WindowNative.GetWindowHandle(owner));
        var file=await picker.PickSaveFileAsync();if(file is null)return;
        await using var output=await file.OpenStreamForWriteAsync();output.SetLength(0);
        using var archive=new ZipArchive(output,ZipArchiveMode.Create,true);
        var state=archive.CreateEntry("runtime.json");
        await using(var stream=state.Open())await JsonSerializer.SerializeAsync(stream,new{shell="WinUI",version=NativeVersion.Text,os=Environment.OSVersion.VersionString,architecture=System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture.ToString()});
        foreach(var name in new[]{"last-startup-error.log","last-core-error.log","last-titlebar-region-error.log","last-visual-error.log","last-browse-timing.json"}) {
            var path=Path.Combine(PreferenceStore.DataRoot,name);if(!File.Exists(path))continue;
            await using var source=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite);
            await using var target=archive.CreateEntry(name).Open();
            var bytes=new byte[(int)Math.Min(source.Length,1024*1024)];var read=await source.ReadAsync(bytes);await target.WriteAsync(bytes.AsMemory(0,read));
        }
    }
}
