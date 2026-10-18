using System.Buffers.Binary;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.Core.Reader.Host;

internal sealed partial class ReaderNtfsVolume : IDisposable
{
    private const uint FileReadData = 0x00000001;
    private const uint FileReadAttributes = 0x00000080;
    private const uint ShareReadWriteDelete = 0x00000007;
    private const uint OpenExisting = 3;
    private const uint BackupSemantics = 0x02000000;
    private const uint OpenNoRecall = 0x00100000, OpenReparsePoint = 0x00200000;
    private const uint EnumUsnData = 0x000900B3;
    private const uint QueryUsnJournal = 0x000900F4;
    private const uint ReadUsnJournal = 0x000900BB;
    private const int FileIdInfoClass = 18;
    private const int MftBufferBytes = 128 * 1024;
    private const uint FileAttributeDirectory = 0x10;
    private const uint UsnReasonFileDelete = 0x00000200;
    private const int ErrorNoMoreFiles = 18;
    private const int ErrorHandleEof = 38;
    private const int ErrorNoMoreItems = 259;

    private readonly SafeFileHandle volume;

    private ReaderNtfsVolume(SafeFileHandle volume, ReaderOpaqueId volumeId, char driveLetter)
    {
        this.volume = volume;
        VolumeId = volumeId;
        DisplayName = $"{driveLetter}:";
    }

    public ReaderOpaqueId VolumeId { get; }
    public string DisplayName { get; }

    public static ReaderNtfsVolume Open(char driveLetter)
    {
        if (driveLetter is < 'A' or > 'Z') throw new InvalidDataException("reader-volume-letter");
        var rootPath = $"{driveLetter}:\\";
        var fileSystem = new StringBuilder(32);
        if (!GetVolumeInformation(rootPath, null, 0, out var serial, out _, out _, fileSystem, fileSystem.Capacity))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "reader-volume-information");
        }
        if (!string.Equals(fileSystem.ToString(), "NTFS", StringComparison.OrdinalIgnoreCase))
        {
            throw new NotSupportedException("reader-volume-not-ntfs");
        }

        using var root = CreateFile(rootPath, 0, ShareReadWriteDelete, IntPtr.Zero,
            OpenExisting, BackupSemantics, IntPtr.Zero);
        if (root.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error(), "reader-open-root");
        if (!GetFileInformationByHandleEx(root, FileIdInfoClass, out var rootInfo,
                checked((uint)Marshal.SizeOf<FileIdInformation>())))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "reader-root-id");
        }
        if (rootInfo.FileIdHigh != 0 || rootInfo.FileIdLow == 0)
        {
            throw new NotSupportedException("reader-root-id-width");
        }

        var handle = CreateFile($@"\\.\{driveLetter}:", FileReadData, ShareReadWriteDelete,
            IntPtr.Zero, OpenExisting, 0, IntPtr.Zero);
        if (handle.IsInvalid)
        {
            var error = Marshal.GetLastWin32Error();
            handle.Dispose();
            throw new Win32Exception(error, "reader-open-volume");
        }
        var first = ((ulong)serial << 32) | (rootInfo.VolumeSerialNumber & uint.MaxValue);
        if (first == 0) first = 1;
        return new ReaderNtfsVolume(handle, new ReaderOpaqueId(first, rootInfo.FileIdLow), driveLetter);
    }

    public ReaderJournalSnapshot QueryJournal()
    {
        if (!DeviceIoControl(volume, QueryUsnJournal, IntPtr.Zero, 0, out JournalData data,
                checked((uint)Marshal.SizeOf<JournalData>()), out var bytes, IntPtr.Zero)
            || bytes < 56)
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "reader-query-journal");
        }
        return new ReaderJournalSnapshot(data.JournalId, data.FirstUsn, data.NextUsn, data.LowestValidUsn);
    }

    public ReaderNtfsSnapshot OpenSnapshot()
    {
        var journal = QueryJournal();
        Span<byte> random = stackalloc byte[16];
        RandomNumberGenerator.Fill(random);
        var id = new ReaderOpaqueId(
            BinaryPrimitives.ReadUInt64LittleEndian(random[..8]),
            BinaryPrimitives.ReadUInt64LittleEndian(random[8..]));
        if (id.IsEmpty) id = new ReaderOpaqueId(1, 1);
        return new ReaderNtfsSnapshot(this, id, journal);
    }

    public Task WaitForJournalChangeAsync(ulong journalId, long startingUsn, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var current = QueryJournal();
        if (current.JournalId != journalId || startingUsn < current.FirstUsn || startingUsn < current.LowestValidUsn
            || startingUsn != current.NextUsn) return Task.CompletedTask;
        return ReaderJournalWaitIo.WaitAsync(DisplayName[0], journalId, startingUsn, token);
    }

    public ReaderNtfsJournalPage ReadJournal(
        ulong journalId,
        long startingUsn,
        uint maximumRecords,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var before = QueryJournal();
        if (before.JournalId != journalId
            || startingUsn < before.FirstUsn
            || startingUsn < before.LowestValidUsn
            || startingUsn > before.NextUsn)
        {
            throw new ReaderJournalDiscontinuousException();
        }

        var bufferBytes = checked(8 + (int)maximumRecords * 60);
        var buffer = new byte[bufferBytes];
        var input = new ReadJournalData
        {
            StartUsn = startingUsn,
            ReasonMask = uint.MaxValue,
            JournalId = journalId
        };
        if (!DeviceIoControl(volume, ReadUsnJournal, ref input,
                checked((uint)Marshal.SizeOf<ReadJournalData>()), buffer, checked((uint)buffer.Length),
                out var returned, IntPtr.Zero))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "reader-read-journal");
        }
        if (returned < 8 || returned > buffer.Length) throw new InvalidDataException("reader-journal-buffer");
        var nextUsn = BinaryPrimitives.ReadInt64LittleEndian(buffer.AsSpan(0, 8));
        if (nextUsn < startingUsn) throw new InvalidDataException("reader-journal-cursor");
        var records = ParseJournal(buffer.AsSpan(0, checked((int)returned)), before.NextUsn, maximumRecords);
        var after = QueryJournal();
        var continuous = after.JournalId == journalId
            && startingUsn >= after.FirstUsn
            && startingUsn >= after.LowestValidUsn;
        if (!continuous) throw new ReaderJournalDiscontinuousException();
        return new ReaderNtfsJournalPage(
            new ReaderJournalReadBatchResponse(journalId, nextUsn, true, records),
            nextUsn >= before.NextUsn);
    }

    public ReaderNtfsJournalPageV2 ReadJournalV2(
        ulong journalId,
        long startingUsn,
        uint maximumRecords,
        CancellationToken cancellationToken)
    {
        var page = ReadJournal(journalId, startingUsn, maximumRecords, cancellationToken);
        var snapshot = QueryJournal();
        var records = page.Response.Records.Select(record =>
        {
            var deleted = (record.Reason & UsnReasonFileDelete) != 0;
            var facts = !deleted ? TryReadBasicFacts(record.FileReference, record.IsDirectory) : null;
            var extension = record.IsDirectory ? string.Empty : SafeExtension(record.Name);
            return new ReaderJournalRecordV2(
                record.FileReference,
                record.ParentFileReference,
                record.Reason,
                record.Usn,
                facts?.Attributes ?? record.Attributes,
                record.IsDirectory,
                !deleted,
                record.Name,
                extension,
                facts?.SizeBytes,
                facts?.CreationFileTimeUtc,
                facts?.LastWriteFileTimeUtc);
        }).ToArray();
        return new ReaderNtfsJournalPageV2(
            new ReaderJournalReadBatchResponseV2(
                page.Response.JournalId,
                snapshot.FirstUsn,
                snapshot.LowestValidUsn,
                page.Response.NextUsn,
                page.Response.Continuous,
                records),
            page.EndOfStream);
    }

    public void Dispose() => volume.Dispose();

    private ReaderBasicFacts? TryReadBasicFacts(ulong fileReference, bool isDirectory)
    {
        var descriptor = new FileIdDescriptor
        {
            Size = checked((uint)Marshal.SizeOf<FileIdDescriptor>()),
            Type = 0,
            FileId = unchecked((long)fileReference)
        };
        using var handle = OpenFileById(
            volume,
            ref descriptor,
            FileReadAttributes,
            ShareReadWriteDelete,
            IntPtr.Zero,
            OpenNoRecall | OpenReparsePoint | (isDirectory ? BackupSemantics : 0));
        if (handle.IsInvalid)
        {
            return null;
        }
        if (!GetFileInformationByHandle(handle, out var information))
        {
            return null;
        }
        var size = isDirectory
            ? (ulong?)null
            : ((ulong)information.FileSizeHigh << 32) | information.FileSizeLow;
        return new ReaderBasicFacts(
            size,
            ToFileTime(information.CreationTimeHigh, information.CreationTimeLow),
            ToFileTime(information.LastWriteTimeHigh, information.LastWriteTimeLow),
            information.FileAttributes);
    }

    private static long ToFileTime(uint high, uint low) => unchecked((long)(((ulong)high << 32) | low));

    private static string SafeExtension(string name)
    {
        var extension = Path.GetExtension(name);
        return Encoding.UTF8.GetByteCount(extension) <= ReaderProtocol.MaximumExtensionBytes
            ? extension
            : string.Empty;
    }

    private static IReadOnlyList<ReaderJournalRecord> ParseJournal(
        ReadOnlySpan<byte> buffer,
        long targetUsn,
        uint maximumRecords)
    {
        var records = new List<ReaderJournalRecord>();
        var offset = 8;
        while (offset < buffer.Length)
        {
            if (buffer.Length - offset < 8) throw new InvalidDataException("reader-journal-layout");
            var length = BinaryPrimitives.ReadUInt32LittleEndian(buffer.Slice(offset, 4));
            var version = BinaryPrimitives.ReadUInt16LittleEndian(buffer.Slice(offset + 4, 2));
            var minimum = version == 2 ? 60 : version == 3 ? 76 : 0;
            if (minimum == 0 || length < minimum || length > buffer.Length - offset)
            {
                throw new InvalidDataException("reader-journal-version-or-length");
            }
            var id = BinaryPrimitives.ReadUInt64LittleEndian(buffer.Slice(offset + 8, 8));
            var highId = version == 3
                ? BinaryPrimitives.ReadUInt64LittleEndian(buffer.Slice(offset + 16, 8))
                : 0;
            var parentOffset = version == 2 ? 16 : 24;
            var parent = BinaryPrimitives.ReadUInt64LittleEndian(buffer.Slice(offset + parentOffset, 8));
            var highParent = version == 3
                ? BinaryPrimitives.ReadUInt64LittleEndian(buffer.Slice(offset + parentOffset + 8, 8))
                : 0;
            var usn = BinaryPrimitives.ReadInt64LittleEndian(buffer.Slice(offset + (version == 2 ? 24 : 40), 8));
            var reason = BinaryPrimitives.ReadUInt32LittleEndian(buffer.Slice(offset + (version == 2 ? 40 : 56), 4));
            var attributes = BinaryPrimitives.ReadUInt32LittleEndian(buffer.Slice(offset + (version == 2 ? 52 : 68), 4));
            var namePosition = version == 2 ? 56 : 72;
            var nameBytes = BinaryPrimitives.ReadUInt16LittleEndian(buffer.Slice(offset + namePosition, 2));
            var nameOffset = BinaryPrimitives.ReadUInt16LittleEndian(buffer.Slice(offset + namePosition + 2, 2));
            if (highId != 0 || highParent != 0 || nameOffset < minimum || (nameBytes & 1) != 0
                || nameOffset > length || nameBytes > length - nameOffset)
            {
                throw new InvalidDataException("reader-journal-name-layout");
            }
            if (usn < targetUsn)
            {
                if (records.Count >= maximumRecords) throw new InvalidDataException("reader-journal-page-overflow");
                records.Add(new ReaderJournalRecord(
                    id,
                    parent,
                    reason,
                    usn,
                    attributes,
                    (attributes & FileAttributeDirectory) != 0,
                    Encoding.Unicode.GetString(buffer.Slice(offset + nameOffset, nameBytes))));
            }
            offset += checked((int)length);
        }
        return records;
    }

    internal static IReadOnlyList<ReaderJournalRecord> ParseJournalForTest(
        byte[] buffer,
        long targetUsn,
        uint maximumRecords) => ParseJournal(buffer, targetUsn, maximumRecords);

    [StructLayout(LayoutKind.Sequential)]
    private struct JournalData
    {
        public ulong JournalId;
        public long FirstUsn;
        public long NextUsn;
        public long LowestValidUsn;
        public long MaxUsn;
        public ulong MaximumSize;
        public ulong AllocationDelta;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct ReadJournalData
    {
        public long StartUsn;
        public uint ReasonMask;
        public uint ReturnOnlyOnClose;
        public ulong Timeout;
        public ulong BytesToWaitFor;
        public ulong JournalId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct FileIdInformation
    {
        public ulong VolumeSerialNumber;
        public ulong FileIdLow;
        public ulong FileIdHigh;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct FileIdDescriptor
    {
        public uint Size;
        public uint Type;
        public long FileId;
        public long FileIdHigh;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ByHandleFileInformation
    {
        public uint FileAttributes;
        public uint CreationTimeLow;
        public uint CreationTimeHigh;
        public uint LastAccessTimeLow;
        public uint LastAccessTimeHigh;
        public uint LastWriteTimeLow;
        public uint LastWriteTimeHigh;
        public uint VolumeSerialNumber;
        public uint FileSizeHigh;
        public uint FileSizeLow;
        public uint NumberOfLinks;
        public uint FileIndexHigh;
        public uint FileIndexLow;
    }

    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(
        string fileName, uint desiredAccess, uint shareMode, IntPtr securityAttributes,
        uint creationDisposition, uint flagsAndAttributes, IntPtr templateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern SafeFileHandle OpenFileById(
        SafeFileHandle volumeHint,
        ref FileIdDescriptor fileId,
        uint desiredAccess,
        uint shareMode,
        IntPtr securityAttributes,
        uint flagsAndAttributes);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetFileInformationByHandle(
        SafeFileHandle file,
        out ByHandleFileInformation information);

    [DllImport("kernel32.dll", EntryPoint = "GetVolumeInformationW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetVolumeInformation(
        string rootPathName, StringBuilder? volumeNameBuffer, int volumeNameSize,
        out uint volumeSerialNumber, out uint maximumComponentLength, out uint fileSystemFlags,
        StringBuilder fileSystemNameBuffer, int fileSystemNameSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetFileInformationByHandleEx(
        SafeFileHandle file, int informationClass, out FileIdInformation information, uint bufferSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DeviceIoControl(
        SafeFileHandle device, uint controlCode, IntPtr input, uint inputSize,
        out JournalData output, uint outputSize, out uint bytesReturned, IntPtr overlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DeviceIoControl(
        SafeFileHandle device, uint controlCode, ref ReadJournalData input, uint inputSize,
        [Out] byte[] output, uint outputSize, out uint bytesReturned, IntPtr overlapped);

    internal sealed class ReaderNtfsSnapshot : IDisposable
    {
        private readonly ReaderNtfsVolume owner;
        private readonly byte[] buffer = new byte[MftBufferBytes];
        private readonly Queue<ReaderMftRecord> pending = new();
        private ulong nativeCursor;
        private ulong protocolCursor;
        private bool endOfStream;

        public ReaderNtfsSnapshot(ReaderNtfsVolume owner, ReaderOpaqueId id, ReaderJournalSnapshot journal)
        {
            this.owner = owner;
            Id = id;
            Journal = journal;
        }

        public ReaderOpaqueId Id { get; }
        public ReaderJournalSnapshot Journal { get; }

        public ReaderMftReadPageResponse ReadPage(ulong expectedCursor, uint maximumRecords, CancellationToken token)
        {
            if (expectedCursor != protocolCursor) throw new InvalidDataException("reader-mft-page-cursor");
            var records = new List<ReaderMftRecord>(checked((int)maximumRecords));
            while (records.Count < maximumRecords)
            {
                token.ThrowIfCancellationRequested();
                while (records.Count < maximumRecords && pending.TryDequeue(out var record)) records.Add(record);
                if (records.Count == maximumRecords || endOfStream) break;
                FillPending();
            }
            protocolCursor += checked((ulong)records.Count);
            return new ReaderMftReadPageResponse(protocolCursor, endOfStream && pending.Count == 0, records);
        }

        public ReaderMftReadPageResponseV2 ReadPageV2(
            ulong expectedCursor,
            uint maximumRecords,
            CancellationToken token)
        {
            var page = ReadPage(expectedCursor, maximumRecords, token);
            var records = page.Records.Select(record =>
            {
                var facts = owner.TryReadBasicFacts(record.FileReference, record.IsDirectory);
                return new ReaderMftRecordV2(
                    record.FileReference,
                    record.ParentFileReference,
                    facts?.SizeBytes,
                    facts?.CreationFileTimeUtc,
                    facts?.LastWriteFileTimeUtc,
                    facts?.Attributes ?? record.Attributes,
                    record.IsDirectory,
                    record.Name,
                    record.Extension);
            }).ToArray();
            return new ReaderMftReadPageResponseV2(page.NextCursor, page.EndOfStream, records);
        }

        private void FillPending()
        {
            var input = new MftEnumData
            {
                StartFileReferenceNumber = nativeCursor,
                LowUsn = 0,
                HighUsn = long.MaxValue
            };
            if (!DeviceIoControl(owner.volume, EnumUsnData, ref input,
                    checked((uint)Marshal.SizeOf<MftEnumData>()), buffer, checked((uint)buffer.Length),
                    out var returned, IntPtr.Zero))
            {
                var error = Marshal.GetLastWin32Error();
                if (error is ErrorNoMoreFiles or ErrorHandleEof or ErrorNoMoreItems)
                {
                    endOfStream = true;
                    return;
                }
                throw new Win32Exception(error, "reader-enumerate-mft");
            }
            if (returned < 8 || returned > buffer.Length) throw new InvalidDataException("reader-mft-buffer");
            var next = BinaryPrimitives.ReadUInt64LittleEndian(buffer.AsSpan(0, 8));
            if (next <= nativeCursor) throw new InvalidDataException("reader-mft-native-cursor");
            ParseMft(buffer.AsSpan(0, checked((int)returned)), pending);
            nativeCursor = next;
        }

        public void Dispose()
        {
            pending.Clear();
            Array.Clear(buffer);
        }
    }

    internal sealed record ReaderJournalSnapshot(
        ulong JournalId,
        long FirstUsn,
        long NextUsn,
        long LowestValidUsn);

    private static void ParseMft(ReadOnlySpan<byte> buffer, Queue<ReaderMftRecord> records)
    {
        var offset = 8;
        while (offset < buffer.Length)
        {
            if (buffer.Length - offset < 60) throw new InvalidDataException("reader-mft-layout");
            var length = BinaryPrimitives.ReadUInt32LittleEndian(buffer.Slice(offset, 4));
            var version = BinaryPrimitives.ReadUInt16LittleEndian(buffer.Slice(offset + 4, 2));
            if (version != 2 || length < 60 || length > buffer.Length - offset)
            {
                throw new InvalidDataException("reader-mft-version-or-length");
            }
            var id = BinaryPrimitives.ReadUInt64LittleEndian(buffer.Slice(offset + 8, 8));
            var parent = BinaryPrimitives.ReadUInt64LittleEndian(buffer.Slice(offset + 16, 8));
            var attributes = BinaryPrimitives.ReadUInt32LittleEndian(buffer.Slice(offset + 52, 4));
            var nameBytes = BinaryPrimitives.ReadUInt16LittleEndian(buffer.Slice(offset + 56, 2));
            var nameOffset = BinaryPrimitives.ReadUInt16LittleEndian(buffer.Slice(offset + 58, 2));
            if (nameOffset < 60 || (nameBytes & 1) != 0 || nameOffset > length || nameBytes > length - nameOffset)
            {
                throw new InvalidDataException("reader-mft-name-layout");
            }
            var name = Encoding.Unicode.GetString(buffer.Slice(offset + nameOffset, nameBytes));
            var extension = (attributes & FileAttributeDirectory) == 0 ? Path.GetExtension(name) : string.Empty;
            if (Encoding.UTF8.GetByteCount(extension) > ReaderProtocol.MaximumExtensionBytes) extension = string.Empty;
            records.Enqueue(new ReaderMftRecord(
                id, parent, 0, 0, attributes, (attributes & FileAttributeDirectory) != 0, name, extension));
            offset += checked((int)length);
        }
    }

    internal static IReadOnlyList<ReaderMftRecord> ParseMftForTest(byte[] buffer)
    {
        var records = new Queue<ReaderMftRecord>();
        ParseMft(buffer, records);
        return records.ToArray();
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MftEnumData
    {
        public ulong StartFileReferenceNumber;
        public long LowUsn;
        public long HighUsn;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DeviceIoControl(
        SafeFileHandle device, uint controlCode, ref MftEnumData input, uint inputSize,
        [Out] byte[] output, uint outputSize, out uint bytesReturned, IntPtr overlapped);
}

internal sealed record ReaderBasicFacts(
    ulong? SizeBytes,
    long CreationFileTimeUtc,
    long LastWriteFileTimeUtc,
    uint Attributes);

internal sealed class ReaderJournalDiscontinuousException : Exception;

internal sealed record ReaderNtfsJournalPage(
    ReaderJournalReadBatchResponse Response,
    bool EndOfStream);

internal sealed record ReaderNtfsJournalPageV2(
    ReaderJournalReadBatchResponseV2 Response,
    bool EndOfStream);
