using System.ComponentModel;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.Core.Setup;

public sealed record CapabilityRequesterIdentity(
    string UserSid,
    string LocalApplicationData,
    uint ProcessId);

public static class CapabilitySetupPeerIdentity
{
    private const uint ProcessQueryLimitedInformation = 0x1000;
    private static readonly Guid LocalAppDataFolder = new(
        0xf1b32785, 0x6fba, 0x4fcf, 0x9d, 0x55, 0x7b, 0x8e, 0x7f, 0x15, 0x70, 0x91);

    public static CapabilityRequesterIdentity ResolveRequester(NamedPipeServerStream pipe)
    {
        ArgumentNullException.ThrowIfNull(pipe);
        if (!pipe.IsConnected || !GetNamedPipeClientProcessId(pipe.SafePipeHandle, out var processId))
        {
            throw new InvalidDataException("activation-client-pid-unavailable");
        }
        ValidatePeerImage(processId);

        CapabilityRequesterIdentity? requester = null;
        pipe.RunAsClient(() =>
        {
            using var identity = WindowsIdentity.GetCurrent(ifImpersonating: true)
                ?? throw new InvalidDataException("activation-client-token-unavailable");
            var sid = identity.User?.Value ?? throw new InvalidDataException("activation-client-sid-unavailable");
            var localAppData = GetLocalApplicationData(identity.AccessToken);
            requester = new(sid, localAppData, processId);
        });
        return requester ?? throw new InvalidDataException("activation-client-identity-unavailable");
    }

    public static void ValidateServer(NamedPipeClientStream pipe, uint expectedProcessId)
    {
        ArgumentNullException.ThrowIfNull(pipe);
        if (!pipe.IsConnected || !GetNamedPipeServerProcessId(pipe.SafePipeHandle, out var actualProcessId)
            || actualProcessId != expectedProcessId)
        {
            throw new InvalidDataException("activation-server-pid-mismatch");
        }
    }

    private static void ValidatePeerImage(uint processId)
    {
        if (processId == Environment.ProcessId) throw new InvalidDataException("activation-peer-same-process");
        var currentPath = Environment.ProcessPath ?? throw new InvalidDataException("activation-current-image-unavailable");
        var peerPath = GetProcessPath(processId);
        if (IsReparsePoint(currentPath) || IsReparsePoint(peerPath))
        {
            throw new InvalidDataException("activation-image-reparse-point");
        }
        var currentHash = HashFile(currentPath);
        var peerHash = HashFile(peerPath);
        if (!CryptographicOperations.FixedTimeEquals(currentHash, peerHash))
        {
            throw new InvalidDataException("activation-client-image-mismatch");
        }
    }

    private static byte[] HashFile(string path)
    {
        using var stream = File.OpenRead(path);
        return SHA256.HashData(stream);
    }

    private static bool IsReparsePoint(string path) =>
        (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0;

    private static string GetProcessPath(uint processId)
    {
        using var process = OpenProcess(ProcessQueryLimitedInformation, false, processId);
        if (process.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error(), "open-activation-peer");
        var capacity = 32768u;
        var buffer = new StringBuilder(checked((int)capacity));
        if (!QueryFullProcessImageName(process, 0, buffer, ref capacity))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "query-activation-peer-image");
        }
        return buffer.ToString();
    }

    private static string GetLocalApplicationData(SafeAccessTokenHandle token)
    {
        var folderId = LocalAppDataFolder;
        var result = SHGetKnownFolderPath(ref folderId, 0, token, out var pointer);
        if (result != 0) Marshal.ThrowExceptionForHR(result);
        try
        {
            return Marshal.PtrToStringUni(pointer)
                ?? throw new InvalidDataException("activation-client-local-app-data-unavailable");
        }
        finally
        {
            Marshal.FreeCoTaskMem(pointer);
        }
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe, out uint clientProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe, out uint serverProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern SafeProcessHandle OpenProcess(uint desiredAccess, bool inheritHandle, uint processId);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryFullProcessImageName(
        SafeProcessHandle process, uint flags, StringBuilder executableName, ref uint size);

    [DllImport("shell32.dll")]
    private static extern int SHGetKnownFolderPath(
        ref Guid folderId, uint flags, SafeAccessTokenHandle token, out IntPtr path);
}
