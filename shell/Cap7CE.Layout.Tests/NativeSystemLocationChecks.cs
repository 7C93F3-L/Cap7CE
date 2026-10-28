using System.Runtime.InteropServices;
using Cap7CE.WinUI.Services;

internal static class NativeSystemLocationChecks
{
    public static void Run()
    {
        if(!OperatingSystem.IsWindows()){Console.WriteLine("Native Shell location checks require Windows.");return;}
        Exception? failure=null;
        var worker=new Thread(()=>{try{Compare();}catch(Exception error){failure=error;}});
        worker.SetApartmentState(ApartmentState.STA);worker.Start();worker.Join();
        if(failure is not null)throw new Exception("Native Shell location comparison failed.",failure);
    }
    private static void Compare()
    {
        if(!OperatingSystem.IsWindows())throw new PlatformNotSupportedException();
        dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application")!)!;
        try {
            var snapshot=SystemLocations.Read();var count=0;
            foreach(var (id,canonical) in new[]{("computer","MyComputerFolder"),("home-桌面","Desktop"),("home-下载","Downloads"),
                ("home-文档","Personal"),("home-图片","My Pictures"),("home-视频","My Video"),("home-音乐","My Music")}) {
                dynamic? folder=shell.NameSpace("shell:"+canonical);
                if(folder is null)continue;
                try {
                    var actual=snapshot.Locations.SingleOrDefault(location=>location.Id==id)??throw new Exception($"Missing Shell location: {id}");
                    dynamic item=folder.Self;
                    try {
                        string expectedName=item.Name;
                        if(actual.Name!=expectedName)throw new Exception($"Shell display name differs for {id}: {actual.Name} / {expectedName}");
                        if(id!="computer") {
                            string expectedPath=item.Path;
                            if(!string.Equals(actual.Path?.TrimEnd('\\'),expectedPath.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase))throw new Exception($"Shell path differs for {id}");
                        }
                        Console.WriteLine($"Shell location matches: {id} = {actual.Name}");count++;
                    } finally {Marshal.FinalReleaseComObject(item);}
                } finally {Marshal.FinalReleaseComObject(folder);}
            }
            if(count==0)throw new Exception("No Shell location was available for comparison.");
            var root=Path.GetPathRoot(Environment.SystemDirectory)!;
            dynamic drive=shell.NameSpace(root);
            try {
                dynamic item=drive.Self;
                try{if(SystemLocations.ReadDriveName(root)!=(string)item.Name)throw new Exception("System drive label differs from Shell.");}
                finally{Marshal.FinalReleaseComObject(item);}
            } finally{Marshal.FinalReleaseComObject(drive);}
            if(SystemLocations.ReadDriveName(@"C:\ordinary") is not null)throw new Exception("Drive display lookup must reject ordinary paths.");
            Console.WriteLine($"Native Shell comparison passed: {count} system names/paths and the system drive; read only.");
        } finally {Marshal.FinalReleaseComObject(shell);}
    }
}
