namespace Cap7CE.Core.Reader.Protocol;

public static partial class ReaderPayloadCodec
{
    public static byte[] EncodeFileEntryBatchRequest(ReaderFileEntryBatchRequest value)
    {
        ValidateFileEntryRequest(value);
        var writer = new PayloadWriter(); writer.WriteUInt64(value.VolumeId.First); writer.WriteUInt64(value.VolumeId.Second);
        writer.WriteUInt32(value.StartIndex); writer.WriteUInt32(checked((uint)value.FileReferences.Count));
        foreach (var reference in value.FileReferences) writer.WriteUInt64(reference);
        return writer.Finish();
    }
    public static ReaderFileEntryBatchRequest DecodeFileEntryBatchRequest(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload); var volume = new ReaderOpaqueId(reader.ReadUInt64(), reader.ReadUInt64());
        var start = reader.ReadUInt32(); var count = reader.ReadUInt32();
        if (count is < 1 or > 64) throw Failure("invalid-entry-request-count");
        var references = new List<ulong>(checked((int)count));
        for (var index = 0u; index < count; index++) references.Add(reader.ReadUInt64());
        reader.RequireComplete(); var value = new ReaderFileEntryBatchRequest(volume, references.AsReadOnly(), start);
        ValidateFileEntryRequest(value); return value;
    }
    private static void ValidateFileEntryRequest(ReaderFileEntryBatchRequest value)
    {
        if (value.VolumeId.IsEmpty || value.FileReferences.Count is < 1 or > 64 || value.StartIndex >= value.FileReferences.Count
            || value.FileReferences.Any(reference => reference == 0) || value.FileReferences.Distinct().Count() != value.FileReferences.Count)
            throw Failure("invalid-entry-request");
    }
    public static byte[] EncodeFileEntryBatchResponse(ReaderFileEntryBatchResponse value)
    {
        ValidateFileEntryResponse(value);
        var bytes = 12;
        foreach (var file in value.Files) {
            bytes = checked(bytes + MeasureFileEntrySet(file));
            if (bytes > ReaderProtocol.MaximumPayloadBytes) throw Failure("entry-payload-too-large");
        }
        var writer = new PayloadWriter(); writer.WriteUInt32(value.NextIndex); writer.WriteUInt32(value.EndOfBatch ? 1u : 0u);
        writer.WriteUInt32(checked((uint)value.Files.Count));
        foreach (var file in value.Files) {
            ValidateFileEntrySet(file);
            writer.WriteUInt64(file.FileReference); writer.WriteUInt32((uint)file.State); writer.WriteUInt32(file.LinkCount);
            writer.WriteUInt64(file.SizeBytes ?? 0); writer.WriteInt64(file.CreationFileTimeUtc ?? 0); writer.WriteInt64(file.LastWriteFileTimeUtc ?? 0);
            writer.WriteUInt32(checked((uint)file.Names.Count));
            foreach (var name in file.Names) { writer.WriteUInt64(name.ParentFileReference); writer.WriteText(name.Name, ReaderProtocol.MaximumRecordNameBytes, "entry-name"); }
        }
        return writer.Finish();
    }
    public static ReaderFileEntryBatchResponse DecodeFileEntryBatchResponse(ReadOnlySpan<byte> payload)
    {
        if (payload.Length > ReaderProtocol.MaximumPayloadBytes) throw Failure("entry-payload-too-large");
        var reader = new PayloadReader(payload); var next = reader.ReadUInt32(); var end = ReadBoolean(ref reader, "entry-end");
        var count = reader.ReadUInt32(); if (count is < 1 or > 64) throw Failure("invalid-entry-response-count");
        var files = new List<ReaderFileEntrySet>(checked((int)count));
        for (var index = 0u; index < count; index++) {
            var reference = reader.ReadUInt64(); var state = (ReaderFileEntryState)reader.ReadUInt32(); var links = reader.ReadUInt32();
            var size = reader.ReadUInt64(); var created = reader.ReadInt64(); var modified = reader.ReadInt64();
            var namesCount = reader.ReadUInt32(); if (namesCount > 1024) throw Failure("entry-names-too-large");
            var names = new List<ReaderFileName>(checked((int)namesCount));
            for (var n = 0u; n < namesCount; n++) names.Add(new(reader.ReadUInt64(), reader.ReadText(ReaderProtocol.MaximumRecordNameBytes, "entry-name")));
            if (state != ReaderFileEntryState.Complete && (size != 0 || created != 0 || modified != 0)) throw Failure("entry-unknown-source");
            var file = new ReaderFileEntrySet(reference, state, links, state == ReaderFileEntryState.Complete ? size : null,
                state == ReaderFileEntryState.Complete ? created : null, state == ReaderFileEntryState.Complete ? modified : null, names.AsReadOnly());
            ValidateFileEntrySet(file); files.Add(file);
        }
        reader.RequireComplete(); var value = new ReaderFileEntryBatchResponse(next, end, files.AsReadOnly());
        ValidateFileEntryResponse(value); return value;
    }
    private static void ValidateFileEntryResponse(ReaderFileEntryBatchResponse value)
    {
        if (value.Files.Count is < 1 or > 64 || value.NextIndex < value.Files.Count || value.NextIndex > 64
            || value.Files.Select(file => file.FileReference).Distinct().Count() != value.Files.Count)
            throw Failure("invalid-entry-response");
    }
    public static int MeasureFileEntrySet(ReaderFileEntrySet value)
    {
        ValidateFileEntrySet(value); var bytes = 44;
        foreach (var name in value.Names) {
            var length = StrictUtf8.GetByteCount(name.Name);
            if (length > ReaderProtocol.MaximumRecordNameBytes) throw Failure("entry-name-too-large");
            bytes = checked(bytes + 10 + length);
        }
        return bytes;
    }
    private static void ValidateFileEntrySet(ReaderFileEntrySet value)
    {
        if (value.FileReference == 0 || !Enum.IsDefined(value.State) || value.Names.Count > 1024) throw Failure("invalid-entry-set");
        if (value.State == ReaderFileEntryState.Missing && value.LinkCount != 0) throw Failure("missing-entry-has-links");
        if (value.State == ReaderFileEntryState.Complete) {
            if (value.LinkCount is < 1 or > 1024 || value.LinkCount != value.Names.Count || value.SizeBytes is null
                || value.CreationFileTimeUtc is null or < 0 || value.LastWriteFileTimeUtc is null or < 0) throw Failure("incomplete-entry-set");
        } else if (value.Names.Count != 0 || value.SizeBytes is not null || value.CreationFileTimeUtc is not null || value.LastWriteFileTimeUtc is not null)
            throw Failure("unknown-entry-set-has-data");
        var seen = new HashSet<(ulong,string)>();
        foreach (var name in value.Names) {
            if (name.ParentFileReference == 0 || string.IsNullOrEmpty(name.Name) || name.Name is "." or ".."
                || name.Name.IndexOfAny(['\0','\\','/',':','?','*','<','>','|','"']) >= 0 || !seen.Add((name.ParentFileReference,name.Name)))
                throw Failure("invalid-entry-name");
        }
    }
}
