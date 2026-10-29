using System.Runtime.InteropServices;

namespace Cap7CE.WinUI.Services;
internal static class ReaderDiagnosticStatus
{
    public static string Read()
    {
        var manager=OpenSCManager(null,null,1);if(manager==0)return "unknown";
        try {
            var service=OpenService(manager,"Cap7CENtfsReader",4);
            if(service==0)return Marshal.GetLastWin32Error()==1060?"missing":"unknown";
            try{if(!QueryServiceStatus(service,out var state))return "unknown";return state.State switch{1=>"stopped",4=>"running",_=>"transition"};}
            finally{CloseServiceHandle(service);}
        }finally{CloseServiceHandle(manager);}
    }
    [StructLayout(LayoutKind.Sequential)]private struct Status{public uint Type,State,Controls,Win32Exit,ServiceExit,Checkpoint,WaitHint;}
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]private static extern nint OpenSCManager(string? machine,string? database,uint access);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]private static extern nint OpenService(nint manager,string name,uint access);
    [DllImport("advapi32.dll",SetLastError=true)]private static extern bool QueryServiceStatus(nint service,out Status status);
    [DllImport("advapi32.dll")]private static extern bool CloseServiceHandle(nint service);
}
