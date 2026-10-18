using System.Buffers.Binary;
using System.Runtime.InteropServices;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Reader.Host;

internal sealed partial class ReaderNtfsVolume
{
    // Invalid-parameter may mean a stale NTFS ID, but is not proof by itself.
    // Seek one bounded USN metadata page, never a raw MFT record or file body.
    private ReaderFileEntryState ReadEntryPresence(ulong reference, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var input = new MftEnumData { StartFileReferenceNumber = reference & ReaderEntryPresence.OrdinalMask, LowUsn = 0, HighUsn = long.MaxValue };
        var buffer = new byte[64 * 1024];
        var ok = DeviceIoControl(volume, EnumUsnData, ref input, checked((uint)Marshal.SizeOf<MftEnumData>()),
            buffer, checked((uint)buffer.Length), out var returned, IntPtr.Zero);
        var error = Marshal.GetLastWin32Error(); token.ThrowIfCancellationRequested();
        if (!ok) return ReaderEntryPresence.ReadFailure(error);
        if (returned > buffer.Length) return ReaderFileEntryState.Unavailable;
        return ReaderEntryPresence.Classify(reference, buffer.AsSpan(0, checked((int)returned)));
    }
}

internal static class ReaderEntryPresence
{
    internal const ulong OrdinalMask = 0x0000_FFFF_FFFF_FFFF;
    public static ReaderFileEntryState ReadFailure(int error) => error is 18 or 38 or 259 ? ReaderFileEntryState.Missing : ReaderFileEntryState.Unavailable;
    public static ReaderFileEntryState Classify(ulong reference, ReadOnlySpan<byte> page)
    {
        if (reference == 0 || page.Length < 68) return ReaderFileEntryState.Unavailable;
        var record = page[8..]; var length = BinaryPrimitives.ReadUInt32LittleEndian(record);
        if (length < 60 || length > record.Length || BinaryPrimitives.ReadUInt16LittleEndian(record[4..]) != 2)
            return ReaderFileEntryState.Unavailable;
        var nameBytes = BinaryPrimitives.ReadUInt16LittleEndian(record[56..]); var nameOffset = BinaryPrimitives.ReadUInt16LittleEndian(record[58..]);
        if ((nameBytes & 1) != 0 || nameOffset < 60 || nameOffset > length || nameBytes > length - nameOffset)
            return ReaderFileEntryState.Unavailable;
        var found = BinaryPrimitives.ReadUInt64LittleEndian(record[8..]);
        if (found == 0 || (found & OrdinalMask) < (reference & OrdinalMask)) return ReaderFileEntryState.Unavailable;
        // Same live identity remains unreadable. A later slot or a different
        // generation in the requested slot proves that this exact ID is absent.
        return found == reference ? ReaderFileEntryState.Unavailable : ReaderFileEntryState.Missing;
    }
}
