using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

// Development launcher only. Do not inherit an MSIX caller's filesystem view.
public static class Cap7CEDesktopProcess
{
    public static int Start(string executable, string arguments, string directory)
    {
        IntPtr size=IntPtr.Zero;
        InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);
        if(size==IntPtr.Zero)throw new Win32Exception(Marshal.GetLastWin32Error());
        uint shellId;GetWindowThreadProcessId(GetShellWindow(),out shellId);
        if(shellId==0)throw new InvalidOperationException("An interactive Windows desktop is required to launch the development app.");
        IntPtr parent=OpenProcess(0x80,false,shellId);
        if(parent==IntPtr.Zero)throw new Win32Exception(Marshal.GetLastWin32Error());
        IntPtr attributes=Marshal.AllocHGlobal(size),policy=Marshal.AllocHGlobal(IntPtr.Size);
        bool initialized=false;
        try {
            if(!InitializeProcThreadAttributeList(attributes,1,0,ref size))throw new Win32Exception(Marshal.GetLastWin32Error());
            initialized=true;
            // Inherit the desktop shell's token/job environment, as a manual launch does.
            // PROC_THREAD_ATTRIBUTE_PARENT_PROCESS requires PROCESS_CREATE_PROCESS.
            Marshal.WriteIntPtr(policy,parent);
            if(!UpdateProcThreadAttribute(attributes,0,(IntPtr)0x20000,policy,(IntPtr)IntPtr.Size,IntPtr.Zero,IntPtr.Zero))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            var startup=new StartupInfoEx();startup.Info.Size=Marshal.SizeOf(typeof(StartupInfoEx));startup.Attributes=attributes;
            ProcessInformation process;
            var command=new StringBuilder("\""+executable+"\""+(String.IsNullOrEmpty(arguments)?"":" "+arguments));
            // No inherited handles, no console window; retain the development environment.
            if(!CreateProcessW(executable,command,IntPtr.Zero,IntPtr.Zero,false,0x08080000,IntPtr.Zero,directory,ref startup,out process))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            try{return process.Id;}finally{CloseHandle(process.Thread);CloseHandle(process.Process);}
        }
        finally {
            if(initialized)DeleteProcThreadAttributeList(attributes);
            Marshal.FreeHGlobal(policy);Marshal.FreeHGlobal(attributes);CloseHandle(parent);
        }
    }
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] private struct StartupInfo
    {
        public int Size;public string Reserved,Desktop,Title;
        public uint X,Y,Width,Height,XChars,YChars,Fill,Flags;
        public ushort Show,ReservedSize;public IntPtr ReservedBytes,Input,Output,Error;
    }
    [StructLayout(LayoutKind.Sequential)] private struct StartupInfoEx {public StartupInfo Info;public IntPtr Attributes;}
    [StructLayout(LayoutKind.Sequential)] private struct ProcessInformation {public IntPtr Process,Thread;public int Id,ThreadId;}
    [DllImport("kernel32.dll",SetLastError=true)] private static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
    [DllImport("kernel32.dll",SetLastError=true)] private static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
    [DllImport("kernel32.dll")] private static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern bool CreateProcessW(string application,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string directory,ref StartupInfoEx startup,out ProcessInformation process);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll",SetLastError=true)] private static extern IntPtr OpenProcess(uint rights,bool inherit,uint id);
    [DllImport("user32.dll")] private static extern IntPtr GetShellWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window,out uint id);
}
