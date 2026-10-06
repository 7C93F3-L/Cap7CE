using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.Core.Reader.Host;

// One overlapped, read-only journal wait. Input/output/OVERLAPPED and event stay
// alive until kernel completion, including after cancellation or disconnect.
internal static class ReaderJournalWaitIo
{
    public static async Task WaitAsync(char driveLetter, ulong journalId, long startingUsn, CancellationToken token)
    {
        if (driveLetter is < 'A' or > 'Z' || journalId == 0 || startingUsn < 0) throw new ArgumentException("journal-wait-target");
        token.ThrowIfCancellationRequested();
        using var handle = CreateFileW($@"\\.\{driveLetter}:", 1, 7, IntPtr.Zero, 3, 0x40000000, IntPtr.Zero);
        if (handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error(), "journal-wait-open");
        using var completed = new EventWaitHandle(false, EventResetMode.ManualReset);
        var input = IntPtr.Zero; var output = IntPtr.Zero; var overlapped = IntPtr.Zero;
        var submitted = false; var retired = false;
        RegisteredWaitHandle? registered = null;
        try {
            input = Marshal.AllocHGlobal(Marshal.SizeOf<ReaderNtfsVolume.ReadJournalData>());
            output = Marshal.AllocHGlobal(64 * 1024); overlapped = Marshal.AllocHGlobal(Marshal.SizeOf<AsyncControl>());
            Marshal.StructureToPtr(new ReaderNtfsVolume.ReadJournalData { StartUsn = startingUsn, ReasonMask = uint.MaxValue,
                JournalId = journalId, Timeout = 0, BytesToWaitFor = 1 }, input, false);
            Marshal.StructureToPtr(new AsyncControl { Event = completed.SafeWaitHandle.DangerousGetHandle() }, overlapped, false);
            var immediate = DeviceIoControl(handle, 0x000900BB, input, (uint)Marshal.SizeOf<ReaderNtfsVolume.ReadJournalData>(),
                output, 64 * 1024, out _, overlapped);
            var error = immediate ? 0 : Marshal.GetLastWin32Error();
            submitted = immediate || error == 997;
            if (!immediate && error != 997) throw new Win32Exception(error, "journal-wait-start");
            // Register after submission: already-cancelled tokens must cancel the
            // submitted operation, not race an operation which has not started.
            using var cancellation = token.Register(() => { _ = CancelIoEx(handle, overlapped); });
            if (!immediate) {
                var finished = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                registered = ThreadPool.RegisterWaitForSingleObject(completed, (_, _) => finished.TrySetResult(), null, Timeout.Infinite, true);
                await finished.Task;
            }
            if (!GetOverlappedResult(handle, overlapped, out var bytes, false)) {
                error = Marshal.GetLastWin32Error();
                retired = error != 996;
                if (error == 995 && token.IsCancellationRequested) throw new OperationCanceledException(token);
                throw new Win32Exception(error, "journal-wait-complete");
            }
            retired = true;
            token.ThrowIfCancellationRequested();
            if (bytes < 8 || bytes > 64 * 1024) throw new InvalidDataException("journal-wait-output-bound");
        }
        finally {
            if (submitted && !retired) {
                _ = CancelIoEx(handle, overlapped);
                _ = GetOverlappedResult(handle, overlapped, out _, true);
            }
            registered?.Unregister(null);
            Marshal.FreeHGlobal(overlapped); Marshal.FreeHGlobal(output); Marshal.FreeHGlobal(input);
        }
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct AsyncControl { public IntPtr Internal, InternalHigh; public uint Offset, OffsetHigh; public IntPtr Event; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DeviceIoControl(SafeFileHandle device, uint code, IntPtr input, uint inputSize,
        IntPtr output, uint outputSize, out uint returned, IntPtr overlapped);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CancelIoEx(SafeFileHandle device, IntPtr overlapped);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetOverlappedResult(SafeFileHandle device, IntPtr overlapped, out uint returned, [MarshalAs(UnmanagedType.Bool)] bool wait);
}
