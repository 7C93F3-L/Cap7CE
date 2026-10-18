using System.Buffers.Binary;
using System.Runtime.InteropServices;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.Core.Reader.Host;

// Reuses a synchronous Reader-owned FILE_READ_ATTRIBUTES handle. Only metadata
// information class 46 is requested; no paths, file content or write operations.
internal static class ReaderHardLinkMetadata
{
    private const uint FileHardLinkInformation = 46;
    private const int MaximumBufferBytes = 1024 * 1024;
    public static IReadOnlyList<ReaderFileName>? TryRead(SafeFileHandle handle, uint expectedCount, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if (handle.IsInvalid || expectedCount is < 1 or > 1024) return null;
        var length = 4096;
        for (var attempt = 0; attempt < 3; attempt++) {
            token.ThrowIfCancellationRequested();
            var buffer = new byte[length];
            var status = NtQueryInformationFile(handle, out var io, buffer, checked((uint)buffer.Length), FileHardLinkInformation);
            token.ThrowIfCancellationRequested();
            if (status == 0) {
                if (io.Information < 8 || io.Information > (nuint)buffer.Length) return null;
                try { return ReaderHardLinkBuffer.Decode(buffer.AsSpan(0, checked((int)io.Information)), expectedCount); }
                catch (InvalidDataException) { return null; }
            }
            if (status is not (unchecked((int)0x80000005) or unchecked((int)0xC0000004) or unchecked((int)0xC0000023))) return null;
            var required = BinaryPrimitives.ReadUInt32LittleEndian(buffer);
            if (required > MaximumBufferBytes) return null;
            length = Math.Max(length * 2, checked((int)required));
            if (length > MaximumBufferBytes) return null;
        }
        return null;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IoStatusBlock { public IntPtr Status; public nuint Information; }
    [DllImport("ntdll.dll", ExactSpelling = true)]
    private static extern int NtQueryInformationFile(SafeFileHandle handle, out IoStatusBlock ioStatus,
        [Out] byte[] information, uint length, uint informationClass);
}
