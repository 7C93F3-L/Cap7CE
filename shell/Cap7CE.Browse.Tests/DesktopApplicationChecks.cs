using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Cap7CE.WinUI.DesktopActions;
internal static class DesktopApplicationChecks
{
    public static async Task RunAsync()
    {
        void Check(bool value,string message){if(!value)throw new Exception(message);}
        var legacy=JsonSerializer.Deserialize<DesktopProgram>("""{"Name":"Editor","Path":"D:\\Editor.exe"}""")!;
        Check(!legacy.Registered&&legacy.WindowPath==legacy.Path,"Legacy executable entries retain their original launch and matching path");
        var app=new DesktopProgram("Editor",DesktopProgram.AppsPrefix+"Sample.Editor"){AppId="Sample.Editor",ExecutablePath=legacy.Path};
        Check(app.Registered&&app.SameEntry(legacy),"Registered entries deduplicate against legacy executable selections");
        Check(!app.SameEntry(app with{Path=DesktopProgram.AppsPrefix+"Sample.Other",AppId="Sample.Other"}),"Different registered identities remain distinct even if they share a host executable");
        var restored=JsonSerializer.Deserialize<DesktopProgram>(JsonSerializer.Serialize(app))!;
        Check(restored==app&&restored.Registered,"System application identity and window target survive persistence");
        Check(!(app with{Path="shell:Other"}).Registered,"Mismatched system registration paths are not trusted as registered applications");
        using(var canceled=new CancellationTokenSource()){
            canceled.Cancel();try{await DesktopApplicationCatalog.ReadAsync(canceled.Token);throw new Exception("Expected canceled discovery");}catch(OperationCanceledException){}
        }
        var apps=await DesktopApplicationCatalog.ReadAsync(default);
        Check(apps.Length>0&&apps.All(p=>p.Registered)&&apps.DistinctBy(p=>p.Path,StringComparer.OrdinalIgnoreCase).Count()==apps.Length,"Live Windows enumeration returns unique registered applications");
        var sampled=apps.Where(p=>p.AppId!.Contains('!')).Take(2).Concat(apps.Where(p=>p.WindowPath.Length>0).Take(2)).ToArray();
        Check(sampled.Length>0,"Live icon checks have application fixtures");
        foreach(var selected in sampled){var image=await DesktopShellImage.ReadAsync(selected.Path,default);Check(image.Pixels.Length==image.Width*image.Height*4&&image.Pixels.Any(b=>b!=0),"Shell icon pixels are populated and bounded");}
        var directory=Path.Combine(Path.GetTempPath(),"cap7ce-app-shortcut-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(directory);
        try {
            var path=Path.Combine(directory,"shortcut.lnk");var executable=Environment.ProcessPath!;
            await DesktopShellApartment.RunAsync(()=>{
                object? shell=null,shortcut=null;
                try{shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell",true)!);shortcut=((dynamic)shell!).CreateShortcut(path);
                    ((dynamic)shortcut!).TargetPath=executable;((dynamic)shortcut).Arguments="--fixture-argument";((dynamic)shortcut).WorkingDirectory=directory;((dynamic)shortcut).Save();return true;
                }finally{DesktopShellApartment.Release(shortcut);DesktopShellApartment.Release(shell);}
            });
            var selected=await DesktopApplicationCatalog.FromFileAsync(path);
            Check(selected.Path==path&&selected.WindowPath==executable,"Shortcut launch keeps the link, its arguments and working directory while resolving its executable for window matching");
            using var process=Process.GetCurrentProcess();
            Check(DesktopApplicationIdentity.Matches(0,process,selected),"Shortcut window matching recognizes its executable");
            Check(!DesktopApplicationIdentity.Matches(0,process,app with{ExecutablePath=null}),"Unrelated system identity never falls back to an arbitrary process");
        }finally{Directory.Delete(directory,true);}
        Console.WriteLine($"Desktop app identity, legacy compatibility, shortcut and cancellation checks passed; enumerated {apps.Length} apps and read {sampled.Length} Shell icons without launching applications.");
    }
}
