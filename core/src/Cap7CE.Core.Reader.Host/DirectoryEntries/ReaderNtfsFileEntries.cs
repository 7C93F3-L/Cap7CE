using System.Runtime.InteropServices;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Reader.Host;

internal sealed partial class ReaderNtfsVolume
{
    private readonly ReaderSnapshotEntryCache snapshotEntries = new();
    public ReaderFileEntryBatchResponse ReadFileEntries(ReaderFileEntryBatchRequest request, CancellationToken token)
    {
        if (request.VolumeId != VolumeId) throw new InvalidDataException("reader-entry-volume");
        var files = new List<ReaderFileEntrySet>(); var index = checked((int)request.StartIndex); var bytes = 12;
        for (; index < request.FileReferences.Count; index++) {
            token.ThrowIfCancellationRequested();
            var file = ReadFileEntries(request.FileReferences[index], token);
            var length = ReaderPayloadCodec.MeasureFileEntrySet(file);
            if (length > ReaderProtocol.MaximumPayloadBytes - 12) {
                file = new(file.FileReference, ReaderFileEntryState.OverLimit, file.LinkCount, null, null, null, []);
                length = ReaderPayloadCodec.MeasureFileEntrySet(file);
            }
            if (bytes + length > ReaderProtocol.MaximumPayloadBytes) break;
            files.Add(file); bytes += length;
        }
        return new(checked((uint)index), index == request.FileReferences.Count, files.AsReadOnly());
    }

    private ReaderFileEntrySet ReadFileEntries(ulong reference, CancellationToken token)
    {
        if (snapshotEntries.Read(reference) is { } cached) return cached;
        var descriptor = new FileIdDescriptor { Size = checked((uint)Marshal.SizeOf<FileIdDescriptor>()), Type = 0, FileId = unchecked((long)reference) };
        using var handle = OpenFileById(volume, ref descriptor, FileReadAttributes, ShareReadWriteDelete,
            IntPtr.Zero, OpenNoRecall | OpenReparsePoint);
        if (handle.IsInvalid) {
            var status = Marshal.GetLastWin32Error() is 2 or 3 or 1168 ? ReaderFileEntryState.Missing : ReaderFileEntryState.Unavailable;
            return new(reference, status, 0, null, null, null, []);
        }
        if (!GetFileInformationByHandle(handle, out var before) || (before.FileAttributes & 0x00441410) != 0
            || (((ulong)before.FileIndexHigh << 32) | before.FileIndexLow) != reference)
            return new(reference, ReaderFileEntryState.Unavailable, 0, null, null, null, []);
        if (before.NumberOfLinks == 0) return new(reference, ReaderFileEntryState.Missing, 0, null, null, null, []);
        if (before.NumberOfLinks > 1024) return new(reference, ReaderFileEntryState.OverLimit, before.NumberOfLinks, null, null, null, []);
        var names = ReaderHardLinkMetadata.TryRead(handle, before.NumberOfLinks, token);
        if (names is null || !GetFileInformationByHandle(handle, out var after) || Stamp(before) != Stamp(after))
            return new(reference, ReaderFileEntryState.Unavailable, before.NumberOfLinks, null, null, null, []);
        var created = ToFileTime(after.CreationTimeHigh, after.CreationTimeLow); var modified = ToFileTime(after.LastWriteTimeHigh, after.LastWriteTimeLow);
        if (created < 0 || modified < 0) return new(reference, ReaderFileEntryState.Unavailable, after.NumberOfLinks, null, null, null, []);
        return new(reference, ReaderFileEntryState.Complete, after.NumberOfLinks,
            ((ulong)after.FileSizeHigh << 32) | after.FileSizeLow, created, modified, names);
    }

    private static (uint,uint,uint,uint,uint,uint,uint,uint,uint,uint,uint) Stamp(ByHandleFileInformation info) =>
        (info.VolumeSerialNumber, info.FileAttributes, info.FileIndexHigh, info.FileIndexLow, info.NumberOfLinks, info.CreationTimeHigh, info.CreationTimeLow,
            info.LastWriteTimeHigh, info.LastWriteTimeLow, info.FileSizeHigh, info.FileSizeLow);
}
