using System.Buffers;
using System.Buffers.Binary;
using System.Text;

namespace Cap7CE.Core.Reader.Protocol;

public static partial class ReaderPayloadCodec
{
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);

    public static byte[] EncodeHelloRequest(ReaderHelloRequest value)
    {
        ValidateNonce(value.Nonce);
        if (value.ClientProcessId == 0) throw Failure("invalid-client-process-id");
        var writer = new PayloadWriter();
        writer.WriteBytes(value.Nonce);
        writer.WriteUInt32(value.ClientProcessId);
        return writer.Finish();
    }

    public static ReaderHelloRequest DecodeHelloRequest(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload);
        var value = new ReaderHelloRequest(
            reader.ReadBytes(ReaderProtocol.HelloNonceBytes).ToArray(),
            reader.ReadUInt32());
        reader.RequireComplete();
        if (value.ClientProcessId == 0) throw Failure("invalid-client-process-id");
        return value;
    }

    public static byte[] EncodeHelloResponse(ReaderHelloResponse value)
    {
        ValidateNonce(value.Nonce);
        if (value.ServerProcessId == 0
            || value.MaximumPayloadBytes != ReaderProtocol.MaximumPayloadBytes
            || value.MaximumRecordsPerPage != ReaderProtocol.MaximumRecordsPerPage)
        {
            throw Failure("invalid-hello-response");
        }
        var writer = new PayloadWriter();
        writer.WriteBytes(value.Nonce);
        writer.WriteUInt32(value.ServerProcessId);
        writer.WriteUInt32(value.MaximumPayloadBytes);
        writer.WriteUInt32(value.MaximumRecordsPerPage);
        writer.WriteUInt32((uint)value.Capabilities);
        return writer.Finish();
    }

    public static ReaderHelloResponse DecodeHelloResponse(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload);
        var value = new ReaderHelloResponse(
            reader.ReadBytes(ReaderProtocol.HelloNonceBytes).ToArray(),
            reader.ReadUInt32(),
            reader.ReadUInt32(),
            reader.ReadUInt32(),
            (ReaderCapabilities)reader.ReadUInt32());
        reader.RequireComplete();
        if (value.ServerProcessId == 0
            || value.MaximumPayloadBytes != ReaderProtocol.MaximumPayloadBytes
            || value.MaximumRecordsPerPage != ReaderProtocol.MaximumRecordsPerPage)
        {
            throw Failure("invalid-hello-response");
        }
        return value;
    }

    public static byte[] EncodeStatusResponse(ReaderStatusResponse value)
    {
        RequireId(value.PrimaryVolumeId, "volume-id");
        var flags = (value.Ready ? 1u : 0u)
            | (value.FixtureOnly ? 2u : 0u)
            | (value.RemoteClientsRejected ? 4u : 0u)
            | (value.ClientAuthenticated ? 8u : 0u);
        var writer = new PayloadWriter();
        writer.WriteUInt32(flags);
        writer.WriteUInt32(value.SchemaVersion);
        writer.WriteId(value.PrimaryVolumeId);
        return writer.Finish();
    }

    public static ReaderStatusResponse DecodeStatusResponse(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload);
        var flags = reader.ReadUInt32();
        if ((flags & ~15u) != 0) throw Failure("invalid-status-flags");
        var value = new ReaderStatusResponse(
            (flags & 1) != 0,
            (flags & 2) != 0,
            (flags & 4) != 0,
            (flags & 8) != 0,
            reader.ReadUInt32(),
            reader.ReadId());
        reader.RequireComplete();
        RequireId(value.PrimaryVolumeId, "volume-id");
        return value;
    }

    public static byte[] EncodeVolumeInspectRequest(ReaderVolumeInspectRequest value) =>
        EncodeId(value.VolumeId, "volume-id");

    public static ReaderVolumeInspectRequest DecodeVolumeInspectRequest(ReadOnlySpan<byte> payload) =>
        new(DecodeId(payload, "volume-id"));

    public static byte[] EncodeVolumeInspectResponse(ReaderVolumeInspectResponse value)
    {
        RequireId(value.VolumeId, "volume-id");
        var writer = new PayloadWriter();
        writer.WriteId(value.VolumeId);
        writer.WriteUInt64(value.RecordCount);
        writer.WriteUInt64(value.JournalId);
        writer.WriteUInt32((value.Supported ? 1u : 0u) | (value.JournalAvailable ? 2u : 0u));
        return writer.Finish();
    }

    public static ReaderVolumeInspectResponse DecodeVolumeInspectResponse(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload);
        var volumeId = reader.ReadId();
        var recordCount = reader.ReadUInt64();
        var journalId = reader.ReadUInt64();
        var flags = reader.ReadUInt32();
        reader.RequireComplete();
        RequireId(volumeId, "volume-id");
        if ((flags & ~3u) != 0) throw Failure("invalid-volume-flags");
        return new(volumeId, recordCount, journalId, (flags & 1) != 0, (flags & 2) != 0);
    }

    public static byte[] EncodeVolumeInspectResponseV2(ReaderVolumeInspectResponseV2 value)
    {
        RequireId(value.VolumeId, "volume-id");
        var writer = new PayloadWriter();
        writer.WriteId(value.VolumeId);
        writer.WriteUInt64(value.RecordCount);
        writer.WriteUInt64(value.JournalId);
        writer.WriteInt64(value.FirstUsn);
        writer.WriteInt64(value.LowestValidUsn);
        writer.WriteInt64(value.NextUsn);
        writer.WriteUInt32((value.Supported ? 1u : 0u) | (value.JournalAvailable ? 2u : 0u));
        return writer.Finish();
    }

    public static ReaderVolumeInspectResponseV2 DecodeVolumeInspectResponseV2(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload);
        var value = new ReaderVolumeInspectResponseV2(
            reader.ReadId(), reader.ReadUInt64(), reader.ReadUInt64(), reader.ReadInt64(),
            reader.ReadInt64(), reader.ReadInt64(), false, false);
        var flags = reader.ReadUInt32();
        reader.RequireComplete();
        RequireId(value.VolumeId, "volume-id");
        if ((flags & ~3u) != 0) throw Failure("invalid-volume-flags");
        return value with { Supported = (flags & 1) != 0, JournalAvailable = (flags & 2) != 0 };
    }

    public static byte[] EncodeVolumeEnumerateResponse(ReaderVolumeEnumerateResponse value)
    {
        ArgumentNullException.ThrowIfNull(value);
        if (value.Volumes.Count > ReaderProtocol.MaximumVolumes) throw Failure("too-many-volumes");
        var writer = new PayloadWriter();
        writer.WriteUInt32(checked((uint)value.Volumes.Count));
        foreach (var volume in value.Volumes)
        {
            RequireId(volume.VolumeId, "volume-id");
            writer.WriteId(volume.VolumeId);
            writer.WriteText(volume.DisplayName, ReaderProtocol.MaximumVolumeDisplayBytes, "volume-display");
            writer.WriteUInt32((volume.Fixed ? 1u : 0u)
                | (volume.Ntfs ? 2u : 0u)
                | (volume.JournalAvailable ? 4u : 0u));
        }
        return writer.Finish();
    }

    public static ReaderVolumeEnumerateResponse DecodeVolumeEnumerateResponse(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload);
        var count = reader.ReadUInt32();
        if (count > ReaderProtocol.MaximumVolumes) throw Failure("too-many-volumes");
        var volumes = new List<ReaderVolumeDescriptor>(checked((int)count));
        for (var index = 0u; index < count; index++)
        {
            var id = reader.ReadId();
            RequireId(id, "volume-id");
            var display = reader.ReadText(ReaderProtocol.MaximumVolumeDisplayBytes, "volume-display");
            var flags = reader.ReadUInt32();
            if ((flags & ~7u) != 0) throw Failure("invalid-volume-descriptor-flags");
            volumes.Add(new ReaderVolumeDescriptor(
                id, display, (flags & 1) != 0, (flags & 2) != 0, (flags & 4) != 0));
        }
        reader.RequireComplete();
        return new ReaderVolumeEnumerateResponse(volumes);
    }

    public static byte[] EncodeMftOpenSnapshotRequest(ReaderMftOpenSnapshotRequest value) =>
        EncodeId(value.VolumeId, "volume-id");

    public static ReaderMftOpenSnapshotRequest DecodeMftOpenSnapshotRequest(ReadOnlySpan<byte> payload) =>
        new(DecodeId(payload, "volume-id"));

    public static byte[] EncodeMftOpenSnapshotResponse(ReaderMftOpenSnapshotResponse value)
    {
        RequireId(value.SnapshotId, "snapshot-id");
        var writer = new PayloadWriter();
        writer.WriteId(value.SnapshotId);
        writer.WriteUInt64(value.RecordCount);
        writer.WriteUInt64(value.JournalId);
        writer.WriteInt64(value.JournalStartingUsn);
        return writer.Finish();
    }

    public static ReaderMftOpenSnapshotResponse DecodeMftOpenSnapshotResponse(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload);
        var value = new ReaderMftOpenSnapshotResponse(
            reader.ReadId(), reader.ReadUInt64(), reader.ReadUInt64(), reader.ReadInt64());
        reader.RequireComplete();
        RequireId(value.SnapshotId, "snapshot-id");
        return value;
    }

    public static byte[] EncodeMftReadPageRequest(ReaderMftReadPageRequest value)
    {
        RequireId(value.SnapshotId, "snapshot-id");
        ValidateRequestedRecords(value.MaximumRecords);
        var writer = new PayloadWriter();
        writer.WriteId(value.SnapshotId);
        writer.WriteUInt64(value.Cursor);
        writer.WriteUInt32(value.MaximumRecords);
        if (value.IncludeFileUsn) writer.WriteUInt32(1);
        return writer.Finish();
    }

    public static ReaderMftReadPageRequest DecodeMftReadPageRequest(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload);
        var value = new ReaderMftReadPageRequest(reader.ReadId(), reader.ReadUInt64(), reader.ReadUInt32());
        if (payload.Length == 32) { if (reader.ReadUInt32() != 1) throw Failure("invalid-file-usn-request"); value = value with { IncludeFileUsn = true }; }
        reader.RequireComplete();
        RequireId(value.SnapshotId, "snapshot-id");
        ValidateRequestedRecords(value.MaximumRecords);
        return value;
    }

    public static byte[] EncodeMftReadPageResponse(ReaderMftReadPageResponse value)
    {
        if (value.Records.Count > ReaderProtocol.MaximumRecordsPerPage) throw Failure("too-many-records");
        var writer = new PayloadWriter();
        writer.WriteUInt64(value.NextCursor);
        writer.WriteUInt32(checked((uint)value.Records.Count));
        writer.WriteUInt32(value.EndOfStream ? 1u : 0u);
        foreach (var record in value.Records)
        {
            writer.WriteUInt64(record.FileReference);
            writer.WriteUInt64(record.ParentFileReference);
            writer.WriteUInt64(record.SizeBytes);
            writer.WriteInt64(record.LastWriteFileTimeUtc);
            writer.WriteUInt32(record.Attributes);
            writer.WriteUInt32(record.IsDirectory ? 1u : 0u);
            writer.WriteText(record.Name, ReaderProtocol.MaximumRecordNameBytes, "record-name");
            writer.WriteText(record.Extension, ReaderProtocol.MaximumExtensionBytes, "record-extension");
        }
        return writer.Finish();
    }

    public static ReaderMftReadPageResponse DecodeMftReadPageResponse(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload);
        var nextCursor = reader.ReadUInt64();
        var count = reader.ReadUInt32();
        var endFlag = reader.ReadUInt32();
        if (count > ReaderProtocol.MaximumRecordsPerPage) throw Failure("too-many-records");
        if (endFlag > 1) throw Failure("invalid-end-flag");
        var records = new List<ReaderMftRecord>(checked((int)count));
        for (var index = 0u; index < count; index++)
        {
            records.Add(new ReaderMftRecord(
                reader.ReadUInt64(),
                reader.ReadUInt64(),
                reader.ReadUInt64(),
                reader.ReadInt64(),
                reader.ReadUInt32(),
                ReadBoolean(ref reader, "directory-flag"),
                reader.ReadText(ReaderProtocol.MaximumRecordNameBytes, "record-name"),
                reader.ReadText(ReaderProtocol.MaximumExtensionBytes, "record-extension")));
        }
        reader.RequireComplete();
        return new(nextCursor, endFlag == 1, records);
    }

    public static byte[] EncodeMftReadPageResponseV2(ReaderMftReadPageResponseV2 value, bool includeFileUsn = false)
    {
        if (value.Records.Count > ReaderProtocol.MaximumRecordsPerPage) throw Failure("too-many-records");
        var writer = new PayloadWriter();
        writer.WriteUInt64(value.NextCursor);
        writer.WriteUInt32(checked((uint)value.Records.Count));
        writer.WriteUInt32(value.EndOfStream ? 1u : 0u);
        foreach (var record in value.Records)
        {
            writer.WriteUInt64(record.FileReference);
            writer.WriteUInt64(record.ParentFileReference);
            writer.WriteUInt32((record.SizeBytes.HasValue ? 1u : 0u)
                | (record.CreationFileTimeUtc.HasValue ? 2u : 0u)
                | (record.LastWriteFileTimeUtc.HasValue ? 4u : 0u));
            writer.WriteUInt64(record.SizeBytes ?? 0);
            writer.WriteInt64(record.CreationFileTimeUtc ?? 0);
            writer.WriteInt64(record.LastWriteFileTimeUtc ?? 0);
            writer.WriteUInt32(record.Attributes);
            writer.WriteUInt32(record.IsDirectory ? 1u : 0u);
            writer.WriteText(record.Name, ReaderProtocol.MaximumRecordNameBytes, "record-name");
            writer.WriteText(record.Extension, ReaderProtocol.MaximumExtensionBytes, "record-extension");
            if (includeFileUsn) writer.WriteInt64(record.LastUsn ?? -1);
        }
        return writer.Finish();
    }

    public static ReaderMftReadPageResponseV2 DecodeMftReadPageResponseV2(ReadOnlySpan<byte> payload, bool includeFileUsn = false)
    {
        var reader = new PayloadReader(payload);
        var nextCursor = reader.ReadUInt64();
        var count = reader.ReadUInt32();
        var endFlag = reader.ReadUInt32();
        if (count > ReaderProtocol.MaximumRecordsPerPage) throw Failure("too-many-records");
        if (endFlag > 1) throw Failure("invalid-end-flag");
        var records = new List<ReaderMftRecordV2>(checked((int)count));
        for (var index = 0u; index < count; index++)
        {
            var reference = reader.ReadUInt64();
            var parent = reader.ReadUInt64();
            var facts = reader.ReadUInt32();
            if ((facts & ~7u) != 0) throw Failure("invalid-basic-fact-flags");
            var size = reader.ReadUInt64();
            var created = reader.ReadInt64();
            var modified = reader.ReadInt64();
            var attributes = reader.ReadUInt32();
            var directory = ReadBoolean(ref reader, "directory-flag");
            var name = reader.ReadText(ReaderProtocol.MaximumRecordNameBytes, "record-name");
            var extension = reader.ReadText(ReaderProtocol.MaximumExtensionBytes, "record-extension");
            records.Add(new ReaderMftRecordV2(
                reference, parent,
                (facts & 1) != 0 ? size : null,
                (facts & 2) != 0 ? created : null,
                (facts & 4) != 0 ? modified : null,
                attributes, directory, name, extension, includeFileUsn ? ReadFileUsn(ref reader) : null));
        }
        reader.RequireComplete();
        return new ReaderMftReadPageResponseV2(nextCursor, endFlag == 1, records);
    }

    public static byte[] EncodeMftCloseSnapshotRequest(ReaderMftCloseSnapshotRequest value) =>
        EncodeId(value.SnapshotId, "snapshot-id");

    public static ReaderMftCloseSnapshotRequest DecodeMftCloseSnapshotRequest(ReadOnlySpan<byte> payload) =>
        new(DecodeId(payload, "snapshot-id"));

    public static byte[] EncodeJournalReadBatchRequest(ReaderJournalReadBatchRequest value)
    {
        RequireId(value.VolumeId, "volume-id");
        ValidateRequestedRecords(value.MaximumRecords);
        var writer = new PayloadWriter();
        writer.WriteId(value.VolumeId);
        writer.WriteUInt64(value.JournalId);
        writer.WriteInt64(value.StartingUsn);
        writer.WriteUInt32(value.MaximumRecords);
        return writer.Finish();
    }

    public static ReaderJournalReadBatchRequest DecodeJournalReadBatchRequest(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload);
        var value = new ReaderJournalReadBatchRequest(
            reader.ReadId(), reader.ReadUInt64(), reader.ReadInt64(), reader.ReadUInt32());
        reader.RequireComplete();
        RequireId(value.VolumeId, "volume-id");
        ValidateRequestedRecords(value.MaximumRecords);
        return value;
    }

    public static byte[] EncodeJournalReadBatchResponse(ReaderJournalReadBatchResponse value)
    {
        if (value.Records.Count > ReaderProtocol.MaximumRecordsPerPage) throw Failure("too-many-records");
        var writer = new PayloadWriter();
        writer.WriteUInt64(value.JournalId);
        writer.WriteInt64(value.NextUsn);
        writer.WriteUInt32(checked((uint)value.Records.Count));
        writer.WriteUInt32(value.Continuous ? 1u : 0u);
        foreach (var record in value.Records)
        {
            writer.WriteUInt64(record.FileReference);
            writer.WriteUInt64(record.ParentFileReference);
            writer.WriteUInt32(record.Reason);
            writer.WriteInt64(record.Usn);
            writer.WriteUInt32(record.Attributes);
            writer.WriteUInt32(record.IsDirectory ? 1u : 0u);
            writer.WriteText(record.Name, ReaderProtocol.MaximumRecordNameBytes, "journal-name");
        }
        return writer.Finish();
    }

    public static ReaderJournalReadBatchResponse DecodeJournalReadBatchResponse(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload);
        var journalId = reader.ReadUInt64();
        var nextUsn = reader.ReadInt64();
        var count = reader.ReadUInt32();
        var continuous = reader.ReadUInt32();
        if (count > ReaderProtocol.MaximumRecordsPerPage) throw Failure("too-many-records");
        if (continuous > 1) throw Failure("invalid-continuity-flag");
        var records = new List<ReaderJournalRecord>(checked((int)count));
        for (var index = 0u; index < count; index++)
        {
            records.Add(new ReaderJournalRecord(
                reader.ReadUInt64(),
                reader.ReadUInt64(),
                reader.ReadUInt32(),
                reader.ReadInt64(),
                reader.ReadUInt32(),
                ReadBoolean(ref reader, "journal-directory-flag"),
                reader.ReadText(ReaderProtocol.MaximumRecordNameBytes, "journal-name")));
        }
        reader.RequireComplete();
        return new(journalId, nextUsn, continuous == 1, records);
    }

    public static byte[] EncodeJournalReadBatchResponseV2(ReaderJournalReadBatchResponseV2 value)
    {
        if (value.Records.Count > ReaderProtocol.MaximumRecordsPerPage) throw Failure("too-many-records");
        var writer = new PayloadWriter();
        writer.WriteUInt64(value.JournalId);
        writer.WriteInt64(value.FirstUsn);
        writer.WriteInt64(value.LowestValidUsn);
        writer.WriteInt64(value.NextUsn);
        writer.WriteUInt32(checked((uint)value.Records.Count));
        writer.WriteUInt32(value.Continuous ? 1u : 0u);
        foreach (var record in value.Records)
        {
            writer.WriteUInt64(record.FileReference);
            writer.WriteUInt64(record.ParentFileReference);
            writer.WriteUInt32(record.Reason);
            writer.WriteInt64(record.Usn);
            writer.WriteUInt32(record.Attributes);
            writer.WriteUInt32((record.IsDirectory ? 1u : 0u)
                | (record.Exists ? 2u : 0u)
                | (record.SizeBytes.HasValue ? 4u : 0u)
                | (record.CreationFileTimeUtc.HasValue ? 8u : 0u)
                | (record.LastWriteFileTimeUtc.HasValue ? 16u : 0u));
            writer.WriteText(record.Name, ReaderProtocol.MaximumRecordNameBytes, "journal-name");
            writer.WriteText(record.Extension, ReaderProtocol.MaximumExtensionBytes, "journal-extension");
            writer.WriteUInt64(record.SizeBytes ?? 0);
            writer.WriteInt64(record.CreationFileTimeUtc ?? 0);
            writer.WriteInt64(record.LastWriteFileTimeUtc ?? 0);
        }
        return writer.Finish();
    }

    public static ReaderJournalReadBatchResponseV2 DecodeJournalReadBatchResponseV2(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload);
        var journalId = reader.ReadUInt64();
        var firstUsn = reader.ReadInt64();
        var lowestValidUsn = reader.ReadInt64();
        var nextUsn = reader.ReadInt64();
        var count = reader.ReadUInt32();
        var continuous = reader.ReadUInt32();
        if (count > ReaderProtocol.MaximumRecordsPerPage) throw Failure("too-many-records");
        if (continuous > 1) throw Failure("invalid-continuity-flag");
        var records = new List<ReaderJournalRecordV2>(checked((int)count));
        for (var index = 0u; index < count; index++)
        {
            var reference = reader.ReadUInt64();
            var parent = reader.ReadUInt64();
            var reason = reader.ReadUInt32();
            var usn = reader.ReadInt64();
            var attributes = reader.ReadUInt32();
            var flags = reader.ReadUInt32();
            if ((flags & ~31u) != 0) throw Failure("invalid-journal-fact-flags");
            var name = reader.ReadText(ReaderProtocol.MaximumRecordNameBytes, "journal-name");
            var extension = reader.ReadText(ReaderProtocol.MaximumExtensionBytes, "journal-extension");
            var size = reader.ReadUInt64();
            var created = reader.ReadInt64();
            var modified = reader.ReadInt64();
            records.Add(new ReaderJournalRecordV2(
                reference, parent, reason, usn, attributes,
                (flags & 1) != 0, (flags & 2) != 0, name, extension,
                (flags & 4) != 0 ? size : null,
                (flags & 8) != 0 ? created : null,
                (flags & 16) != 0 ? modified : null));
        }
        reader.RequireComplete();
        return new ReaderJournalReadBatchResponseV2(
            journalId, firstUsn, lowestValidUsn, nextUsn, continuous == 1, records);
    }

    public static byte[] EncodeCancelRequest(ReaderCancelRequest value)
    {
        if (value.TargetRequestId == 0) throw Failure("invalid-target-request-id");
        var writer = new PayloadWriter();
        writer.WriteUInt64(value.TargetRequestId);
        return writer.Finish();
    }

    public static ReaderCancelRequest DecodeCancelRequest(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload);
        var value = new ReaderCancelRequest(reader.ReadUInt64());
        reader.RequireComplete();
        if (value.TargetRequestId == 0) throw Failure("invalid-target-request-id");
        return value;
    }

    public static void RequireEmpty(ReadOnlySpan<byte> payload)
    {
        if (!payload.IsEmpty) throw Failure("expected-empty-payload");
    }

    private static byte[] EncodeId(ReaderOpaqueId id, string code)
    {
        RequireId(id, code);
        var writer = new PayloadWriter();
        writer.WriteId(id);
        return writer.Finish();
    }

    private static ReaderOpaqueId DecodeId(ReadOnlySpan<byte> payload, string code)
    {
        var reader = new PayloadReader(payload);
        var id = reader.ReadId();
        reader.RequireComplete();
        RequireId(id, code);
        return id;
    }

    private static void ValidateNonce(byte[] nonce)
    {
        ArgumentNullException.ThrowIfNull(nonce);
        if (nonce.Length != ReaderProtocol.HelloNonceBytes) throw Failure("invalid-hello-nonce");
    }

    private static void ValidateRequestedRecords(uint count)
    {
        if (count is 0 or > ReaderProtocol.MaximumRecordsPerPage)
        {
            throw Failure("invalid-record-limit");
        }
    }

    private static void RequireId(ReaderOpaqueId id, string code)
    {
        if (id.IsEmpty) throw Failure("invalid-" + code);
    }

    private static bool ReadBoolean(ref PayloadReader reader, string code)
    {
        var value = reader.ReadUInt32();
        if (value > 1) throw Failure("invalid-" + code);
        return value == 1;
    }

    private static ReaderProtocolException Failure(string code) => new(code);

    private sealed class PayloadWriter
    {
        private readonly ArrayBufferWriter<byte> buffer = new();

        public void WriteUInt32(uint value)
        {
            var span = buffer.GetSpan(sizeof(uint));
            BinaryPrimitives.WriteUInt32LittleEndian(span, value);
            buffer.Advance(sizeof(uint));
        }

        public void WriteUInt64(ulong value)
        {
            var span = buffer.GetSpan(sizeof(ulong));
            BinaryPrimitives.WriteUInt64LittleEndian(span, value);
            buffer.Advance(sizeof(ulong));
        }

        public void WriteInt64(long value) => WriteUInt64(unchecked((ulong)value));

        public void WriteId(ReaderOpaqueId value)
        {
            WriteUInt64(value.First);
            WriteUInt64(value.Second);
        }

        public void WriteBytes(ReadOnlySpan<byte> value)
        {
            value.CopyTo(buffer.GetSpan(value.Length));
            buffer.Advance(value.Length);
        }

        public void WriteText(string value, int maximumBytes, string code)
        {
            ArgumentNullException.ThrowIfNull(value);
            var bytes = StrictUtf8.GetBytes(value);
            if (bytes.Length > maximumBytes || bytes.Length > ushort.MaxValue)
            {
                throw Failure(code + "-too-large");
            }
            var length = buffer.GetSpan(sizeof(ushort));
            BinaryPrimitives.WriteUInt16LittleEndian(length, checked((ushort)bytes.Length));
            buffer.Advance(sizeof(ushort));
            WriteBytes(bytes);
        }

        public byte[] Finish()
        {
            if (buffer.WrittenCount > ReaderProtocol.MaximumPayloadBytes) throw Failure("payload-too-large");
            return buffer.WrittenSpan.ToArray();
        }
    }

    private static long? ReadFileUsn(ref PayloadReader reader)
    { var usn = reader.ReadInt64(); if (usn < -1) throw Failure("invalid-file-usn"); return usn < 0 ? null : usn; }

    private ref struct PayloadReader(ReadOnlySpan<byte> payload)
    {
        private ReadOnlySpan<byte> remaining = payload;

        public uint ReadUInt32()
        {
            var bytes = ReadBytes(sizeof(uint));
            return BinaryPrimitives.ReadUInt32LittleEndian(bytes);
        }

        public ulong ReadUInt64()
        {
            var bytes = ReadBytes(sizeof(ulong));
            return BinaryPrimitives.ReadUInt64LittleEndian(bytes);
        }

        public long ReadInt64() => unchecked((long)ReadUInt64());

        public ReaderOpaqueId ReadId() => new(ReadUInt64(), ReadUInt64());

        public ReadOnlySpan<byte> ReadBytes(int count)
        {
            if (count < 0 || remaining.Length < count) throw Failure("truncated-operation-payload");
            var value = remaining[..count];
            remaining = remaining[count..];
            return value;
        }

        public string ReadText(int maximumBytes, string code)
        {
            var lengthBytes = ReadBytes(sizeof(ushort));
            var length = BinaryPrimitives.ReadUInt16LittleEndian(lengthBytes);
            if (length > maximumBytes) throw Failure(code + "-too-large");
            try { return StrictUtf8.GetString(ReadBytes(length)); }
            catch (DecoderFallbackException) { throw Failure(code + "-invalid-utf8"); }
        }

        public void RequireComplete()
        {
            if (!remaining.IsEmpty) throw Failure("trailing-operation-payload");
        }
    }
}
