using System.ComponentModel;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.Core.Host;

internal sealed record ReaderPipeConnection(
    NamedPipeClientStream Stream,
    uint ServerProcessId,
    bool ExcessiveRightsDenied) : IDisposable
{
    public void Dispose() => Stream.Dispose();
}

internal static class ReaderNativeClient
{
    private const uint NarrowAccess = 0x00120083;
    private const uint GenericReadWrite = 0xC0000000;
    private const uint OpenExisting = 3;
    private const uint FileFlagOverlapped = 0x40000000;
    private const int ErrorFileNotFound = 2;
    private const int ErrorAccessDenied = 5;
    private const int ErrorPipeBusy = 231;

    public static async Task<ReaderPipeConnection> ConnectAsync(
        ReaderServiceEndpoint endpoint,
        CancellationToken cancellationToken)
    {
        var excessiveDenied = false;
        var lastError = 0;
        while (!cancellationToken.IsCancellationRequested)
        {
            using var excessive = Open(endpoint, GenericReadWrite);
            lastError = Marshal.GetLastWin32Error();
            if (!excessive.IsInvalid)
            {
                throw new UnauthorizedAccessException("reader-overbroad-pipe-access");
            }
            if (lastError == ErrorAccessDenied)
            {
                excessiveDenied = true;
                var handle = Open(endpoint, NarrowAccess);
                if (!handle.IsInvalid)
                {
                    if (!GetNamedPipeServerProcessId(handle, out var serverProcessId) || serverProcessId == 0)
                    {
                        var error = Marshal.GetLastWin32Error();
                        handle.Dispose();
                        throw new Win32Exception(error, "reader-server-process");
                    }
                    try
                    {
                        var stream = new NamedPipeClientStream(PipeDirection.InOut, true, true, handle);
                        return new ReaderPipeConnection(stream, serverProcessId, excessiveDenied);
                    }
                    catch
                    {
                        handle.Dispose();
                        throw;
                    }
                }
                lastError = Marshal.GetLastWin32Error();
                handle.Dispose();
            }
            if (lastError is not (ErrorFileNotFound or ErrorPipeBusy or ErrorAccessDenied))
            {
                throw new Win32Exception(lastError, "reader-pipe-connect");
            }
            await Task.Delay(125, cancellationToken);
        }
        throw new OperationCanceledException(cancellationToken);
    }

    private static SafePipeHandle Open(ReaderServiceEndpoint endpoint, uint desiredAccess) => CreateFile(
        @"\\.\pipe\" + endpoint.PipeName,
        desiredAccess,
        0,
        IntPtr.Zero,
        OpenExisting,
        FileFlagOverlapped,
        IntPtr.Zero);

    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafePipeHandle CreateFile(
        string fileName,
        uint desiredAccess,
        uint shareMode,
        IntPtr securityAttributes,
        uint creationDisposition,
        uint flagsAndAttributes,
        IntPtr templateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe, out uint serverProcessId);
}
