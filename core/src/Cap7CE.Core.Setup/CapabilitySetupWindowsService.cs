using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.Core.Setup;

internal sealed record CapabilitySetupServiceSnapshot(
    bool Exists,
    bool Running,
    uint ServiceType,
    uint StartType,
    uint ErrorControl,
    string BinaryPath,
    string DisplayName,
    string StartName,
    bool HardeningMatches,
    byte[] Dacl);

internal static class CapabilitySetupWindowsService
{
    private const uint ScManagerConnect = 0x0001, ScManagerCreateService = 0x0002;
    private const uint ServiceAllAccess = 0x000F01FF;
    private const uint ServiceWin32OwnProcess = 0x00000010;
    private const uint ServiceDemandStart = 0x00000003;
    private const uint ServiceErrorNormal = 0x00000001;
    private const uint ServiceControlStop = 0x00000001;
    private const uint ServiceStopped = 0x00000001;
    private const uint ServiceRunning = 0x00000004;
    private const uint ScStatusProcessInfo = 0;
    private const uint DaclSecurityInformation = 0x00000004;
    private const int ErrorServiceDoesNotExist = 1060;
    private const int ErrorServiceNotActive = 1062;
    private const int ErrorInsufficientBuffer = 122;

    public static CapabilitySetupServiceSnapshot Capture(CapabilitySetupReaderServicePolicy policy)
    {
        using var manager = OpenManager();
        using var service = OpenService(manager, policy.ServiceName, ServiceAllAccess);
        if (service.IsInvalid)
        {
            var error = Marshal.GetLastWin32Error();
            if (error == ErrorServiceDoesNotExist)
            {
                return new(false, false, 0, 0, 0, "", "", "", false, []);
            }
            throw Error("open-reader-service", error);
        }

        var configuration = QueryConfiguration(service);
        return new(
            true,
            QueryState(service) == ServiceRunning,
            configuration.ServiceType,
            configuration.StartType,
            configuration.ErrorControl,
            configuration.BinaryPath,
            configuration.DisplayName,
            configuration.StartName,
            CapabilitySetupServiceHardening.Matches(service),
            QueryDacl(service));
    }

    public static void Configure(CapabilitySetupReaderServicePolicy policy)
    {
        using var manager = OpenManager();
        using var existing = OpenService(manager, policy.ServiceName, ServiceAllAccess);
        using var service = existing.IsInvalid
            ? CreateOwnedService(manager, policy)
            : existing.TransferOwnership();
        if (!ChangeServiceConfig(
                service,
                ServiceWin32OwnProcess,
                ServiceDemandStart,
                ServiceErrorNormal,
                CapabilitySetupServiceCommand.Quote(policy.ExecutablePath),
                null,
                IntPtr.Zero,
                null,
                null,
                null,
                policy.DisplayName))
        {
            throw Error("configure-reader-service");
        }
        CapabilitySetupServiceHardening.Configure(service);
        SetDacl(service, policy.ServiceDacl);
    }

    public static void Stop(CapabilitySetupReaderServicePolicy policy, CancellationToken cancellationToken)
    {
        using var manager = OpenManager();
        using var service = OpenService(manager, policy.ServiceName, ServiceAllAccess);
        if (service.IsInvalid)
        {
            var error = Marshal.GetLastWin32Error();
            if (error == ErrorServiceDoesNotExist) return;
            throw Error("open-reader-service", error);
        }
        Stop(service, cancellationToken);
    }

    public static void Remove(CapabilitySetupReaderServicePolicy policy, CancellationToken cancellationToken)
    {
        using var manager = OpenManager();
        using var service = OpenService(manager, policy.ServiceName, ServiceAllAccess);
        if (service.IsInvalid)
        {
            var error = Marshal.GetLastWin32Error();
            if (error == ErrorServiceDoesNotExist) return;
            throw Error("open-reader-service", error);
        }
        Stop(service, cancellationToken);
        if (!DeleteService(service)) throw Error("remove-reader-service");
    }

    public static void Restore(
        CapabilitySetupReaderServicePolicy policy,
        CapabilitySetupServiceSnapshot snapshot,
        bool restoreRunning,
        CancellationToken cancellationToken)
    {
        if (!snapshot.Exists)
        {
            Remove(policy, cancellationToken);
            return;
        }

        using var manager = OpenManager();
        using var existing = OpenService(manager, policy.ServiceName, ServiceAllAccess);
        using var service = existing.IsInvalid
            ? CreateService(manager, policy.ServiceName, snapshot.DisplayName, ServiceAllAccess,
                snapshot.ServiceType, snapshot.StartType, snapshot.ErrorControl,
                snapshot.BinaryPath, null, IntPtr.Zero, null,
                snapshot.StartName, null)
            : existing.TransferOwnership();
        if (service.IsInvalid) throw Error("restore-reader-service");
        if (!ChangeServiceConfig(service, snapshot.ServiceType, snapshot.StartType,
                snapshot.ErrorControl, snapshot.BinaryPath, null, IntPtr.Zero, null,
                snapshot.StartName, null, snapshot.DisplayName))
        {
            throw Error("restore-reader-service-config");
        }
        CapabilitySetupServiceHardening.Configure(service);
        if (!SetServiceObjectSecurity(service, DaclSecurityInformation, snapshot.Dacl))
        {
            throw Error("restore-reader-service-dacl");
        }
        if (restoreRunning && snapshot.Running && !StartService(service, 0, null))
        {
            var error = Marshal.GetLastWin32Error();
            if (error != 1056) throw Error("restore-reader-service-start", error);
        }
    }

    public static void Verify(CapabilitySetupReaderServicePolicy policy)
    {
        var snapshot = Capture(policy);
        Require(snapshot.Exists, "installed-service-missing");
        Require(snapshot.ServiceType == ServiceWin32OwnProcess, "installed-service-type-invalid");
        Require(snapshot.StartType == ServiceDemandStart, "installed-service-start-invalid");
        Require(snapshot.ErrorControl == ServiceErrorNormal, "installed-service-error-control-invalid");
        CapabilitySetupServiceCommand.RequireExecutable(snapshot.BinaryPath, policy.ExecutablePath);
        Require(snapshot.StartName.Equals("LocalSystem", StringComparison.OrdinalIgnoreCase),
            "installed-service-account-invalid");
        Require(!snapshot.Running, "installed-service-unexpectedly-running");
        Require(snapshot.HardeningMatches, "installed-service-hardening-invalid");
        Require(CapabilitySetupServiceDacl.Matches(snapshot.Dacl, policy.ServiceDacl),
            "installed-service-dacl-invalid");
    }

    public static SecurityIdentifier ResolveServiceSid(CapabilitySetupReaderServicePolicy policy) =>
        (SecurityIdentifier)new NTAccount("NT SERVICE", policy.ServiceName)
            .Translate(typeof(SecurityIdentifier));

    private static SafeServiceHandle CreateOwnedService(
        SafeServiceHandle manager,
        CapabilitySetupReaderServicePolicy policy)
    {
        var service = CreateService(
            manager,
            policy.ServiceName,
            policy.DisplayName,
            ServiceAllAccess,
            ServiceWin32OwnProcess,
            ServiceDemandStart,
            ServiceErrorNormal,
            CapabilitySetupServiceCommand.Quote(policy.ExecutablePath),
            null,
            IntPtr.Zero,
            null,
            null,
            null);
        if (service.IsInvalid) throw Error("create-reader-service");
        return service;
    }

    private static void Stop(SafeServiceHandle service, CancellationToken cancellationToken)
    {
        if (QueryState(service) == ServiceStopped) return;
        if (!ControlService(service, ServiceControlStop, out _))
        {
            var error = Marshal.GetLastWin32Error();
            if (error != ErrorServiceNotActive) throw Error("stop-reader-service", error);
        }
        var deadline = DateTime.UtcNow.AddSeconds(20);
        while (QueryState(service) != ServiceStopped)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (DateTime.UtcNow >= deadline) throw new TimeoutException("stop-reader-service-timeout");
            Thread.Sleep(100);
        }
    }

    private static ServiceConfiguration QueryConfiguration(SafeServiceHandle service)
    {
        _ = QueryServiceConfig(service, IntPtr.Zero, 0, out var needed);
        if (needed == 0 || Marshal.GetLastWin32Error() != ErrorInsufficientBuffer)
        {
            throw Error("query-reader-service-config");
        }
        var buffer = Marshal.AllocHGlobal(checked((int)needed));
        try
        {
            if (!QueryServiceConfig(service, buffer, needed, out _))
            {
                throw Error("query-reader-service-config");
            }
            var native = Marshal.PtrToStructure<QueryServiceConfiguration>(buffer);
            return new(
                native.ServiceType,
                native.StartType,
                native.ErrorControl,
                Marshal.PtrToStringUni(native.BinaryPathName) ?? "",
                Marshal.PtrToStringUni(native.DisplayName) ?? "",
                Marshal.PtrToStringUni(native.ServiceStartName) ?? "");
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static uint QueryState(SafeServiceHandle service)
    {
        if (!QueryServiceStatusEx(service, ScStatusProcessInfo, out var status,
                checked((uint)Marshal.SizeOf<ServiceStatusProcess>()), out _))
        {
            throw Error("query-reader-service-status");
        }
        return status.CurrentState;
    }

    private static byte[] QueryDacl(SafeServiceHandle service)
    {
        _ = QueryServiceObjectSecurity(service, DaclSecurityInformation, null, 0, out var needed);
        if (needed == 0 || Marshal.GetLastWin32Error() != ErrorInsufficientBuffer)
        {
            throw Error("query-reader-service-dacl");
        }
        var descriptor = new byte[needed];
        if (!QueryServiceObjectSecurity(
                service, DaclSecurityInformation, descriptor, needed, out _))
        {
            throw Error("query-reader-service-dacl");
        }
        return descriptor;
    }

    private static void SetDacl(SafeServiceHandle service, string sddl)
    {
        var descriptor = new RawSecurityDescriptor(sddl);
        var bytes = new byte[descriptor.BinaryLength];
        descriptor.GetBinaryForm(bytes, 0);
        if (!SetServiceObjectSecurity(service, DaclSecurityInformation, bytes))
        {
            throw Error("configure-reader-service-dacl");
        }
    }

    private static void Require(bool condition, string reason)
    {
        if (!condition) throw new CapabilitySetupTransactionFailure(reason, new InvalidDataException());
    }

    private static SafeServiceHandle OpenManager()
    {
        var handle = OpenSCManager(null, null, ScManagerConnect | ScManagerCreateService);
        if (handle.IsInvalid) throw Error("open-service-manager");
        return handle;
    }

    private static Win32Exception Error(string stage, int? error = null) =>
        new(error ?? Marshal.GetLastWin32Error(), stage);

    private sealed record ServiceConfiguration(
        uint ServiceType,
        uint StartType,
        uint ErrorControl,
        string BinaryPath,
        string DisplayName,
        string StartName);

    [StructLayout(LayoutKind.Sequential)]
    private struct QueryServiceConfiguration
    {
        public uint ServiceType;
        public uint StartType;
        public uint ErrorControl;
        public IntPtr BinaryPathName;
        public IntPtr LoadOrderGroup;
        public uint TagId;
        public IntPtr Dependencies;
        public IntPtr ServiceStartName;
        public IntPtr DisplayName;
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

    private sealed class SafeServiceHandle : SafeHandleZeroOrMinusOneIsInvalid
    {
        public SafeServiceHandle() : base(true) { }

        public SafeServiceHandle TransferOwnership()
        {
            var value = handle;
            SetHandleAsInvalid();
            var result = new SafeServiceHandle();
            result.SetHandle(value);
            return result;
        }

        protected override bool ReleaseHandle() => CloseServiceHandle(handle);
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeServiceHandle OpenSCManager(string? machineName, string? databaseName, uint desiredAccess);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeServiceHandle OpenService(SafeServiceHandle manager, string serviceName, uint desiredAccess);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeServiceHandle CreateService(
        SafeServiceHandle manager, string serviceName, string displayName, uint desiredAccess,
        uint serviceType, uint startType, uint errorControl, string binaryPathName,
        string? loadOrderGroup, IntPtr tagId, string? dependencies,
        string? serviceStartName, string? password);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ChangeServiceConfig(
        SafeServiceHandle service, uint serviceType, uint startType, uint errorControl,
        string binaryPathName, string? loadOrderGroup, IntPtr tagId,
        string? dependencies, string? serviceStartName, string? password, string displayName);

    [DllImport("advapi32.dll", EntryPoint = "QueryServiceConfigW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryServiceConfig(SafeServiceHandle service, IntPtr config, uint size, out uint needed);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryServiceStatusEx(
        SafeServiceHandle service, uint infoLevel, out ServiceStatusProcess status, uint size, out uint needed);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ControlService(SafeServiceHandle service, uint control, out ServiceStatus status);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool StartService(SafeServiceHandle service, uint argumentCount, string[]? arguments);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DeleteService(SafeServiceHandle service);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryServiceObjectSecurity(
        SafeServiceHandle service, uint securityInformation, byte[]? securityDescriptor,
        uint bufferSize, out uint bytesNeeded);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetServiceObjectSecurity(
        SafeServiceHandle service, uint securityInformation, byte[] securityDescriptor);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseServiceHandle(IntPtr service);
}
