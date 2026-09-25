using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.Core.Host;

internal sealed record ReaderServiceIdentityResult(
    bool Passed,
    string Stage,
    uint ProcessId,
    bool RestrictedServiceSid,
    bool MinimalPrivileges,
    bool DemandStart,
    bool LocalSystem,
    bool ExpectedBinaryPath,
    bool ExpectedBinaryVersion);

internal static class ReaderServiceIdentity
{
    private const uint ScManagerConnect = 0x0001;
    private const uint ServiceQueryConfig = 0x0001;
    private const uint ServiceQueryStatus = 0x0004;
    private const uint ServiceWin32OwnProcess = 0x10;
    private const uint ServiceDemandStart = 3;
    private const uint ServiceStartPending = 2;
    private const uint ServiceRunning = 4;
    private const uint ServiceConfigServiceSidInfo = 5;
    private const uint ServiceConfigRequiredPrivilegesInfo = 6;
    private const uint ServiceSidTypeRestricted = 3;
    private const int ErrorInsufficientBuffer = 122;

    public static ReaderServiceIdentityResult Verify(
        ReaderServiceEndpoint endpoint,
        uint pipeServerProcessId)
    {
        using var manager = OpenSCManager(null, null, ScManagerConnect);
        if (manager.IsInvalid) return Failure("open-service-manager", pipeServerProcessId);
        using var service = OpenService(manager, endpoint.ServiceName,
            ServiceQueryConfig | ServiceQueryStatus);
        if (service.IsInvalid) return Failure("open-service", pipeServerProcessId);

        var status = new ServiceStatusProcess();
        if (!QueryServiceStatusEx(service, 0, ref status,
                checked((uint)Marshal.SizeOf<ServiceStatusProcess>()), out _))
        {
            return Failure("query-service-status", pipeServerProcessId);
        }
        if (status.ProcessId != pipeServerProcessId
            || status.CurrentState is not (ServiceStartPending or ServiceRunning))
        {
            return Failure("service-process-mismatch", pipeServerProcessId);
        }

        var configResult = ReadBasicConfig(service, endpoint);
        if (!configResult.Passed) return Failure(configResult.Stage, pipeServerProcessId);
        var sidType = ReadSidType(service);
        if (sidType != ServiceSidTypeRestricted) return Failure("service-sid-not-restricted", pipeServerProcessId);
        var privileges = ReadRequiredPrivileges(service);
        if (privileges.Count != 1
            || !string.Equals(privileges[0], "SeChangeNotifyPrivilege", StringComparison.Ordinal))
        {
            return Failure("service-privileges-not-minimal", pipeServerProcessId);
        }
        return new(true, "passed", pipeServerProcessId, true, true,
            configResult.DemandStart, configResult.LocalSystem,
            configResult.ExpectedPath, configResult.ExpectedVersion);
    }

    public static ReaderServiceIdentityResult VerifyInstalled(ReaderServiceEndpoint endpoint)
    {
        using var manager = OpenSCManager(null, null, ScManagerConnect);
        if (manager.IsInvalid) return Failure("open-service-manager", 0);
        using var service = OpenService(manager, endpoint.ServiceName,
            ServiceQueryConfig | ServiceQueryStatus);
        if (service.IsInvalid) return Failure("open-service", 0);

        var configResult = ReadBasicConfig(service, endpoint);
        if (!configResult.Passed) return Failure(configResult.Stage, 0);
        var sidType = ReadSidType(service);
        if (sidType != ServiceSidTypeRestricted) return Failure("service-sid-not-restricted", 0);
        var privileges = ReadRequiredPrivileges(service);
        if (privileges.Count != 1
            || !string.Equals(privileges[0], "SeChangeNotifyPrivilege", StringComparison.Ordinal))
        {
            return Failure("service-privileges-not-minimal", 0);
        }
        return new(true, "passed", 0, true, true,
            configResult.DemandStart, configResult.LocalSystem,
            configResult.ExpectedPath, configResult.ExpectedVersion);
    }

    private static BasicConfigResult ReadBasicConfig(
        SafeServiceHandle service,
        ReaderServiceEndpoint endpoint)
    {
        _ = QueryServiceConfig(service, IntPtr.Zero, 0, out var bytes);
        if (bytes == 0 || Marshal.GetLastWin32Error() != ErrorInsufficientBuffer)
        {
            return new(false, "query-service-config-size", false, false, false, false);
        }
        var buffer = Marshal.AllocHGlobal(checked((int)bytes));
        try
        {
            if (!QueryServiceConfig(service, buffer, bytes, out _))
            {
                return new(false, "query-service-config", false, false, false, false);
            }
            var config = Marshal.PtrToStructure<QueryServiceConfigNative>(buffer);
            var command = Marshal.PtrToStringUni(config.BinaryPathName) ?? string.Empty;
            var startName = Marshal.PtrToStringUni(config.ServiceStartName) ?? string.Empty;
            var path = ExtractExecutablePath(command);
            var expectedPath = false;
            try
            {
                expectedPath = string.Equals(Path.GetFullPath(path),
                    Path.GetFullPath(endpoint.ExpectedServicePath),
                    StringComparison.OrdinalIgnoreCase);
            }
            catch (Exception error) when (error is ArgumentException or NotSupportedException or PathTooLongException)
            {
                return new(false, "service-path-invalid", false, false, false, false);
            }
            var ownProcess = (config.ServiceType & ServiceWin32OwnProcess) != 0;
            var demandStart = config.StartType == ServiceDemandStart;
            var localSystem = string.Equals(startName, "LocalSystem", StringComparison.OrdinalIgnoreCase);
            var expectedVersion = HasExpectedVersion(path, endpoint.ExpectedFileVersion);
            if (!expectedVersion)
            {
                return new(false, "service-version-mismatch", demandStart, localSystem,
                    expectedPath, false);
            }
            return ownProcess && demandStart && localSystem && expectedPath
                ? new(true, "passed", demandStart, localSystem, expectedPath, true)
                : new(false, "service-config-mismatch", demandStart, localSystem, expectedPath, true);
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static bool HasExpectedVersion(string path, string? expectedVersion)
    {
        if (expectedVersion is null) return true;
        try
        {
            return string.Equals(
                FileVersionInfo.GetVersionInfo(path).FileVersion,
                expectedVersion,
                StringComparison.Ordinal);
        }
        catch (Exception error) when (error is ArgumentException or FileNotFoundException)
        {
            return false;
        }
    }

    private static uint ReadSidType(SafeServiceHandle service)
    {
        var buffer = ReadConfig2(service, ServiceConfigServiceSidInfo);
        try { return checked((uint)Marshal.ReadInt32(buffer)); }
        finally { Marshal.FreeHGlobal(buffer); }
    }

    private static IReadOnlyList<string> ReadRequiredPrivileges(SafeServiceHandle service)
    {
        var buffer = ReadConfig2(service, ServiceConfigRequiredPrivilegesInfo);
        try
        {
            var pointer = Marshal.ReadIntPtr(buffer);
            return ReadMultiString(pointer);
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static IntPtr ReadConfig2(SafeServiceHandle service, uint level)
    {
        _ = QueryServiceConfig2(service, level, IntPtr.Zero, 0, out var bytes);
        if (bytes == 0 || Marshal.GetLastWin32Error() != ErrorInsufficientBuffer)
        {
            throw new InvalidOperationException("reader-service-config2-size");
        }
        var buffer = Marshal.AllocHGlobal(checked((int)bytes));
        if (!QueryServiceConfig2(service, level, buffer, bytes, out _))
        {
            Marshal.FreeHGlobal(buffer);
            throw new InvalidOperationException("reader-service-config2");
        }
        return buffer;
    }

    private static IReadOnlyList<string> ReadMultiString(IntPtr pointer)
    {
        var values = new List<string>();
        var offset = 0;
        while (offset < 32_768)
        {
            var value = Marshal.PtrToStringUni(IntPtr.Add(pointer, offset)) ?? string.Empty;
            if (value.Length == 0) return values;
            values.Add(value);
            offset += checked((value.Length + 1) * sizeof(char));
        }
        throw new InvalidDataException("reader-service-privileges-size");
    }

    private static string ExtractExecutablePath(string command)
    {
        var expanded = Environment.ExpandEnvironmentVariables(command.Trim());
        if (!expanded.StartsWith('"')) return expanded;
        var closingQuote = expanded.IndexOf('"', 1);
        return closingQuote > 1 ? expanded[1..closingQuote] : string.Empty;
    }

    private static ReaderServiceIdentityResult Failure(string stage, uint processId) =>
        new(false, stage, processId, false, false, false, false, false, false);

    private sealed record BasicConfigResult(
        bool Passed,
        string Stage,
        bool DemandStart,
        bool LocalSystem,
        bool ExpectedPath,
        bool ExpectedVersion);

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

    [StructLayout(LayoutKind.Sequential)]
    private struct QueryServiceConfigNative
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

    private sealed class SafeServiceHandle : SafeHandleZeroOrMinusOneIsInvalid
    {
        private SafeServiceHandle() : base(true) { }
        protected override bool ReleaseHandle() => CloseServiceHandle(handle);
    }

    [DllImport("advapi32.dll", EntryPoint = "OpenSCManagerW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeServiceHandle OpenSCManager(string? machineName, string? databaseName, uint desiredAccess);

    [DllImport("advapi32.dll", EntryPoint = "OpenServiceW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeServiceHandle OpenService(SafeServiceHandle manager, string serviceName, uint desiredAccess);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryServiceStatusEx(
        SafeServiceHandle service,
        int infoLevel,
        ref ServiceStatusProcess status,
        uint bufferSize,
        out uint bytesNeeded);

    [DllImport("advapi32.dll", EntryPoint = "QueryServiceConfigW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryServiceConfig(
        SafeServiceHandle service,
        IntPtr config,
        uint bufferSize,
        out uint bytesNeeded);

    [DllImport("advapi32.dll", EntryPoint = "QueryServiceConfig2W", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryServiceConfig2(
        SafeServiceHandle service,
        uint infoLevel,
        IntPtr buffer,
        uint bufferSize,
        out uint bytesNeeded);

    [DllImport("advapi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseServiceHandle(IntPtr service);
}
