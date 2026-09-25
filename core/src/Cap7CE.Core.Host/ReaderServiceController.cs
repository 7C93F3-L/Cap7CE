using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.Core.Host;

internal sealed record ReaderServiceStartResult(
    bool StartedByClient,
    bool AlreadyRunning,
    bool ProhibitedRightsDenied,
    ReaderServiceIdentityResult InstalledIdentity);

internal sealed class ReaderRepairRequiredException(string reason) : Exception(reason)
{
    public string Reason { get; } = reason;
}

internal sealed class ReaderServiceAccessDeniedException() : Exception("reader-service-access-denied");

internal sealed class ReaderServiceUnavailableException() : Exception("reader-service-not-installed");

internal static class ReaderServiceController
{
    private const uint ScManagerConnect = 0x0001;
    private const uint ServiceQueryConfig = 0x0001;
    private const uint ServiceChangeConfig = 0x0002;
    private const uint ServiceQueryStatus = 0x0004;
    private const uint ServiceStart = 0x0010;
    private const uint ServiceStop = 0x0020;
    private const uint Delete = 0x00010000;
    private const uint ServiceStopped = 1;
    private const uint ServiceStartPending = 2;
    private const uint ServiceStopPending = 3;
    private const uint ServiceRunning = 4;
    private const int ErrorAccessDenied = 5;
    private const int ErrorServiceDoesNotExist = 1060;
    private const int ErrorServiceAlreadyRunning = 1056;

    public static async Task<ReaderServiceStartResult> EnsureStartedAsync(
        ReaderServiceEndpoint endpoint,
        CancellationToken cancellationToken)
    {
        var identity = ReaderServiceIdentity.VerifyInstalled(endpoint);
        if (!identity.Passed)
        {
            if (identity.Stage == "open-service")
            {
                using var managerProbe = OpenSCManager(null, null, ScManagerConnect);
                var managerError = Marshal.GetLastWin32Error();
                if (managerProbe.IsInvalid && managerError == ErrorAccessDenied)
                {
                    throw new ReaderServiceAccessDeniedException();
                }
                using var serviceProbe = managerProbe.IsInvalid
                    ? new SafeServiceHandle()
                    : OpenService(managerProbe, endpoint.ServiceName, ServiceQueryStatus);
                var serviceError = Marshal.GetLastWin32Error();
                if (serviceProbe.IsInvalid && serviceError == ErrorAccessDenied)
                {
                    throw new ReaderServiceAccessDeniedException();
                }
                if (serviceProbe.IsInvalid && serviceError == ErrorServiceDoesNotExist)
                {
                    throw new ReaderServiceUnavailableException();
                }
            }
            throw new ReaderRepairRequiredException(identity.Stage);
        }

        using var manager = OpenSCManager(null, null, ScManagerConnect);
        if (manager.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error(), "open-service-manager");
        using var service = OpenService(manager, endpoint.ServiceName,
            ServiceQueryConfig | ServiceQueryStatus | ServiceStart);
        if (service.IsInvalid)
        {
            var error = Marshal.GetLastWin32Error();
            if (error == ErrorAccessDenied) throw new ReaderServiceAccessDeniedException();
            if (error == ErrorServiceDoesNotExist) throw new ReaderServiceUnavailableException();
            throw new Win32Exception(error, "open-reader-service");
        }

        var prohibitedDenied = IsDenied(manager, endpoint.ServiceName, ServiceStop)
            && IsDenied(manager, endpoint.ServiceName, ServiceChangeConfig)
            && IsDenied(manager, endpoint.ServiceName, Delete);
        if (!prohibitedDenied) throw new UnauthorizedAccessException("reader-service-rights-overbroad");

        var status = QueryStatus(service);
        var alreadyRunning = status.CurrentState is ServiceRunning or ServiceStartPending;
        var startedByClient = false;
        if (!alreadyRunning)
        {
            if (status.CurrentState == ServiceStopPending)
            {
                await WaitForStateAsync(service, ServiceStopped, cancellationToken);
            }
            if (!StartService(service, 0, IntPtr.Zero))
            {
                var error = Marshal.GetLastWin32Error();
                if (error != ErrorServiceAlreadyRunning)
                {
                    throw new Win32Exception(error, "start-reader-service");
                }
                alreadyRunning = true;
            }
            else
            {
                startedByClient = true;
            }
        }
        await WaitForStateAsync(service, ServiceRunning, cancellationToken);
        return new(startedByClient, alreadyRunning, prohibitedDenied, identity);
    }

    private static bool IsDenied(SafeServiceHandle manager, string serviceName, uint access)
    {
        using var service = OpenService(manager, serviceName, access);
        return service.IsInvalid && Marshal.GetLastWin32Error() == ErrorAccessDenied;
    }

    private static async Task WaitForStateAsync(
        SafeServiceHandle service,
        uint expectedState,
        CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow.AddSeconds(15);
        do
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (QueryStatus(service).CurrentState == expectedState) return;
            await Task.Delay(100, cancellationToken);
        } while (DateTime.UtcNow < deadline);
        throw new TimeoutException("reader-service-state-timeout");
    }

    private static ServiceStatusProcess QueryStatus(SafeServiceHandle service)
    {
        var status = new ServiceStatusProcess();
        if (!QueryServiceStatusEx(service, 0, ref status,
                checked((uint)Marshal.SizeOf<ServiceStatusProcess>()), out _))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "query-reader-service");
        }
        return status;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ServiceStatusProcess
    {
        public uint ServiceType;
        public uint CurrentState;
        public uint ControlsAccepted;
        public uint Win32ExitCode;
        public uint ServiceSpecificExitCode;
        public uint CheckPoint;
        public uint WaitHint;
        public uint ProcessId;
        public uint ServiceFlags;
    }

    internal sealed class SafeServiceHandle : SafeHandleZeroOrMinusOneIsInvalid
    {
        internal SafeServiceHandle() : base(true) { }
        protected override bool ReleaseHandle() => CloseServiceHandle(handle);
    }

    [DllImport("advapi32.dll", EntryPoint = "OpenSCManagerW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeServiceHandle OpenSCManager(string? machineName, string? databaseName, uint desiredAccess);

    [DllImport("advapi32.dll", EntryPoint = "OpenServiceW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeServiceHandle OpenService(SafeServiceHandle manager, string serviceName, uint desiredAccess);

    [DllImport("advapi32.dll", EntryPoint = "StartServiceW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool StartService(SafeServiceHandle service, uint argumentCount, IntPtr arguments);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryServiceStatusEx(
        SafeServiceHandle service,
        int infoLevel,
        ref ServiceStatusProcess status,
        uint bufferSize,
        out uint bytesNeeded);

    [DllImport("advapi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseServiceHandle(IntPtr service);
}
