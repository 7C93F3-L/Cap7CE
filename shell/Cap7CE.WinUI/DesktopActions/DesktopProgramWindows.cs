using System.Diagnostics;
using System.Runtime.InteropServices;
using Cap7CE.WinUI.Localization;
namespace Cap7CE.WinUI.DesktopActions;
// Owns application launch/reuse and bounded window discovery; no placement or termination.
internal static class DesktopProgramWindows
{
    public static async Task<nint> OpenAsync(DesktopProgram program,CancellationToken token,bool wait)
    {
        if(!program.Registered&&!File.Exists(program.Path))throw new UiFailure("ui.desktop.programMissing");
        var existing=await Task.Run(()=>Find(program),token);token.ThrowIfCancellationRequested();
        if(existing!=0){if(IsIconic(existing))ShowWindowAsync(existing,9);SetForegroundWindow(existing);return existing;}
        using var process=Process.Start(new ProcessStartInfo(program.Path){UseShellExecute=true,WorkingDirectory=program.Registered?"":Path.GetDirectoryName(program.Path)!});
        if(!wait)return 0;
        for(var i=0;i<100;i++){await Task.Delay(200,token);var handle=await Task.Run(()=>Find(program),token);if(handle!=0)return handle;}
        throw new UiFailure("ui.desktop.windowTimeout");
    }
    private static nint Find(DesktopProgram program)
    {
        nint found=0;
        EnumWindows((handle,_)=>{
            if(!IsWindowVisible(handle)||GetWindow(handle,4)!=0||GetWindowTextLength(handle)==0)return true;
            GetWindowThreadProcessId(handle,out var pid);
            try{using var process=Process.GetProcessById((int)pid);if(DesktopApplicationIdentity.Matches(handle,process,program)){
                var cls=new System.Text.StringBuilder(256);GetClassName(handle,cls,cls.Capacity);
                if(cls.ToString().Contains("splash",StringComparison.OrdinalIgnoreCase))return true;found=handle;return false;}}
            catch(System.ComponentModel.Win32Exception){}catch(ArgumentException){}catch(InvalidOperationException){}
            return true;
        },0);return found;
    }
    [DllImport("user32.dll")] private static extern bool IsIconic(nint handle);
    private delegate bool EnumCallback(nint handle,nint parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumCallback callback,nint parameter);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint handle);
    [DllImport("user32.dll")] private static extern nint GetWindow(nint handle,uint command);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern int GetWindowTextLength(nint handle);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern int GetClassName(nint handle,System.Text.StringBuilder text,int count);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint handle,out uint pid);
    [DllImport("user32.dll")] private static extern bool ShowWindowAsync(nint handle,int command);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint handle);
}
