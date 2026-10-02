using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Cap7CE.Core.Setup;

internal static class CapabilitySetupServiceHardening
{
    private const uint ServiceConfigServiceSidInfo = 5, ServiceConfigRequiredPrivilegesInfo = 6;
    private const uint ServiceSidTypeRestricted = 3;
    private const int ErrorInsufficientBuffer = 122;

    public static void Configure(SafeHandle service)
    {
        SetRestrictedServiceSid(service);
        SetRequiredPrivileges(service);
    }

    public static bool Matches(SafeHandle service) =>
        ReadSidType(service) == ServiceSidTypeRestricted
        && ReadRequiredPrivileges(service) is ["SeChangeNotifyPrivilege"];

    private static void SetRestrictedServiceSid(SafeHandle service)
    {
        var value = new ServiceSidInformation { ServiceSidType = ServiceSidTypeRestricted };
        var pointer = Marshal.AllocHGlobal(Marshal.SizeOf<ServiceSidInformation>());
        try
        {
            Marshal.StructureToPtr(value, pointer, false);
            if (!ChangeServiceConfig2(service, ServiceConfigServiceSidInfo, pointer))
            {
                throw Error("configure-reader-service-sid");
            }
        }
        finally { Marshal.FreeHGlobal(pointer); }
    }

    private static void SetRequiredPrivileges(SafeHandle service)
    {
        var privileges = Marshal.StringToHGlobalUni("SeChangeNotifyPrivilege\0");
        var value = new ServiceRequiredPrivilegesInformation { RequiredPrivileges = privileges };
        var pointer = Marshal.AllocHGlobal(Marshal.SizeOf<ServiceRequiredPrivilegesInformation>());
        try
        {
            Marshal.StructureToPtr(value, pointer, false);
            if (!ChangeServiceConfig2(service, ServiceConfigRequiredPrivilegesInfo, pointer))
            {
                throw Error("configure-reader-service-privileges");
            }
        }
        finally
        {
            Marshal.FreeHGlobal(pointer);
            Marshal.FreeHGlobal(privileges);
        }
    }

    private static uint ReadSidType(SafeHandle service)
    {
        var buffer = ReadConfig(service, ServiceConfigServiceSidInfo);
        try { return checked((uint)Marshal.ReadInt32(buffer)); }
        finally { Marshal.FreeHGlobal(buffer); }
    }

    private static IReadOnlyList<string> ReadRequiredPrivileges(SafeHandle service)
    {
        var buffer = ReadConfig(service, ServiceConfigRequiredPrivilegesInfo);
        try
        {
            var values = new List<string>();
            var pointer = Marshal.ReadIntPtr(buffer);
            for (var offset = 0; offset < 32_768;)
            {
                var value = Marshal.PtrToStringUni(IntPtr.Add(pointer, offset)) ?? "";
                if (value.Length == 0) return values;
                values.Add(value);
                offset += checked((value.Length + 1) * sizeof(char));
            }
            throw new InvalidDataException("reader-service-privileges-size");
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }

    private static IntPtr ReadConfig(SafeHandle service, uint level)
    {
        _ = QueryServiceConfig2(service, level, IntPtr.Zero, 0, out var needed);
        if (needed == 0 || Marshal.GetLastWin32Error() != ErrorInsufficientBuffer)
        {
            throw Error("query-reader-service-hardening");
        }
        var buffer = Marshal.AllocHGlobal(checked((int)needed));
        if (QueryServiceConfig2(service, level, buffer, needed, out _)) return buffer;
        Marshal.FreeHGlobal(buffer);
        throw Error("query-reader-service-hardening");
    }

    private static Win32Exception Error(string stage) => new(Marshal.GetLastWin32Error(), stage);

    [StructLayout(LayoutKind.Sequential)]
    private struct ServiceSidInformation
    {
        public uint ServiceSidType;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ServiceRequiredPrivilegesInformation
    {
        public IntPtr RequiredPrivileges;
    }

    [DllImport("advapi32.dll", EntryPoint = "ChangeServiceConfig2W", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ChangeServiceConfig2(SafeHandle service, uint infoLevel, IntPtr info);

    [DllImport("advapi32.dll", EntryPoint = "QueryServiceConfig2W", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryServiceConfig2(
        SafeHandle service, uint infoLevel, IntPtr buffer, uint size, out uint needed);
}
