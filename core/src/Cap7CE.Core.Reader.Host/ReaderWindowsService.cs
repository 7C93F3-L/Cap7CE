using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Cap7CE.Core.Reader.Host;

internal static class ReaderWindowsService
{
    private const uint ServiceWin32OwnProcess = 0x10;
    private const uint ServiceStopped = 1;
    private const uint ServiceStartPending = 2;
    private const uint ServiceStopPending = 3;
    private const uint ServiceRunning = 4;
    private const uint ServiceAcceptStop = 1;
    private const uint ServiceAcceptShutdown = 4;
    private const uint ServiceControlStop = 1;
    private const uint ServiceControlShutdown = 5;
    private const uint ErrorFailedServiceControllerConnect = 1063;
    private const uint ErrorServiceSpecificError = 1066;

    private static readonly ServiceMainCallback ServiceMainDelegate = ServiceMain;
    private static readonly ServiceControlHandlerCallback HandlerDelegate = HandleControl;
    private static Func<CancellationToken, Task<int>>? execute;
    private static CancellationTokenSource? shutdown;
    private static IntPtr statusHandle;
    private static int exitCode;

    public static int Run(Func<CancellationToken, Task<int>> serviceBody)
    {
        execute = serviceBody ?? throw new ArgumentNullException(nameof(serviceBody));
        var entrySize = Marshal.SizeOf<ServiceTableEntry>();
        var serviceName = Marshal.StringToHGlobalUni(ReaderHostConstants.ServiceName);
        var table = Marshal.AllocHGlobal(entrySize * 2);
        try
        {
            Marshal.StructureToPtr(new ServiceTableEntry
            {
                ServiceName = serviceName,
                Callback = Marshal.GetFunctionPointerForDelegate(ServiceMainDelegate)
            }, table, false);
            Marshal.StructureToPtr(default(ServiceTableEntry), IntPtr.Add(table, entrySize), false);
            if (!StartServiceCtrlDispatcher(table))
            {
                return Marshal.GetLastWin32Error() == ErrorFailedServiceControllerConnect ? 2 : 3;
            }
            return exitCode;
        }
        finally
        {
            Marshal.FreeHGlobal(table);
            Marshal.FreeHGlobal(serviceName);
        }
    }

    private static void ServiceMain(int argumentCount, IntPtr arguments)
    {
        statusHandle = RegisterServiceCtrlHandlerEx(ReaderHostConstants.ServiceName, HandlerDelegate, IntPtr.Zero);
        if (statusHandle == IntPtr.Zero)
        {
            exitCode = 3;
            return;
        }

        shutdown = new CancellationTokenSource();
        Report(ServiceStartPending, 0, 5_000);
        Report(ServiceRunning, ServiceAcceptStop | ServiceAcceptShutdown, 0);
        try
        {
            exitCode = execute!(shutdown.Token).GetAwaiter().GetResult();
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            exitCode = 4;
        }
        finally
        {
            shutdown.Dispose();
            shutdown = null;
            Report(ServiceStopped, 0, 0, exitCode == 0 ? 0u : ErrorServiceSpecificError,
                exitCode == 0 ? 0u : checked((uint)exitCode));
        }
    }

    private static uint HandleControl(uint control, uint eventType, IntPtr eventData, IntPtr context)
    {
        if (control is ServiceControlStop or ServiceControlShutdown)
        {
            Report(ServiceStopPending, 0, 5_000);
            shutdown?.Cancel();
        }
        return 0;
    }

    private static void Report(
        uint state,
        uint acceptedControls,
        uint waitHint,
        uint win32ExitCode = 0,
        uint serviceSpecificExitCode = 0)
    {
        if (statusHandle == IntPtr.Zero) return;
        var status = new ServiceStatus
        {
            ServiceType = ServiceWin32OwnProcess,
            CurrentState = state,
            ControlsAccepted = acceptedControls,
            Win32ExitCode = win32ExitCode,
            ServiceSpecificExitCode = serviceSpecificExitCode,
            WaitHint = waitHint
        };
        if (!SetServiceStatus(statusHandle, ref status))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "set-service-status");
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ServiceTableEntry
    {
        public IntPtr ServiceName;
        public IntPtr Callback;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ServiceStatus
    {
        public uint ServiceType;
        public uint CurrentState;
        public uint ControlsAccepted;
        public uint Win32ExitCode;
        public uint ServiceSpecificExitCode;
        public uint CheckPoint;
        public uint WaitHint;
    }

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate void ServiceMainCallback(int argumentCount, IntPtr arguments);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate uint ServiceControlHandlerCallback(uint control, uint eventType, IntPtr eventData, IntPtr context);

    [DllImport("advapi32.dll", EntryPoint = "StartServiceCtrlDispatcherW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool StartServiceCtrlDispatcher(IntPtr serviceTable);

    [DllImport("advapi32.dll", EntryPoint = "RegisterServiceCtrlHandlerExW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr RegisterServiceCtrlHandlerEx(
        string serviceName,
        ServiceControlHandlerCallback handler,
        IntPtr context);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetServiceStatus(IntPtr serviceStatusHandle, ref ServiceStatus serviceStatus);
}
