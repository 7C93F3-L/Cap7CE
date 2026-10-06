namespace Cap7CE.Core.Reader.Protocol;

public sealed record ReaderJournalWaitCursor(ReaderOpaqueId VolumeId, ulong JournalId, long StartingUsn);
public sealed record ReaderJournalWaitRequest(IReadOnlyList<ReaderJournalWaitCursor> Cursors, uint WaitMilliseconds);
public sealed record ReaderJournalWaitResponse(IReadOnlyList<ReaderOpaqueId> ChangedVolumes, bool TimedOut);

public static partial class ReaderPayloadCodec
{
    public static byte[] EncodeJournalWaitRequest(ReaderJournalWaitRequest value)
    {
        ValidateJournalWaitRequest(value);
        var writer = new PayloadWriter(); writer.WriteUInt32(value.WaitMilliseconds); writer.WriteUInt32((uint)value.Cursors.Count);
        foreach (var cursor in value.Cursors) {
            writer.WriteId(cursor.VolumeId); writer.WriteUInt64(cursor.JournalId); writer.WriteInt64(cursor.StartingUsn);
        }
        return writer.Finish();
    }
    public static ReaderJournalWaitRequest DecodeJournalWaitRequest(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload);
        var wait = reader.ReadUInt32(); var count = reader.ReadUInt32();
        if (count is 0 or > ReaderProtocol.MaximumVolumes) throw Failure("invalid-journal-wait-count");
        var cursors = new ReaderJournalWaitCursor[count];
        for (var index = 0; index < cursors.Length; index++) cursors[index] = new(reader.ReadId(), reader.ReadUInt64(), reader.ReadInt64());
        reader.RequireComplete(); var value = new ReaderJournalWaitRequest(cursors, wait); ValidateJournalWaitRequest(value); return value;
    }
    private static void ValidateJournalWaitRequest(ReaderJournalWaitRequest value)
    {
        if (value.Cursors is null || value.Cursors.Count is < 1 or > ReaderProtocol.MaximumVolumes
            || value.WaitMilliseconds is < 1 or > 30_000 || value.Cursors.Any(cursor => cursor is null || cursor.VolumeId.IsEmpty
                || cursor.JournalId == 0 || cursor.StartingUsn < 0) || value.Cursors.Select(cursor => cursor.VolumeId).Distinct().Count() != value.Cursors.Count)
            throw Failure("invalid-journal-wait-request");
    }
    public static byte[] EncodeJournalWaitResponse(ReaderJournalWaitResponse value)
    {
        ValidateJournalWaitResponse(value);
        var writer = new PayloadWriter(); writer.WriteUInt32(value.TimedOut ? 1u : 0u); writer.WriteUInt32((uint)value.ChangedVolumes.Count);
        foreach (var id in value.ChangedVolumes) writer.WriteId(id);
        return writer.Finish();
    }
    public static ReaderJournalWaitResponse DecodeJournalWaitResponse(ReadOnlySpan<byte> payload)
    {
        var reader = new PayloadReader(payload); var timedOut = ReadBoolean(ref reader, "journal-wait-timeout"); var count = reader.ReadUInt32();
        if (count > ReaderProtocol.MaximumVolumes) throw Failure("invalid-journal-wait-count");
        var ids = new ReaderOpaqueId[count]; for (var index = 0; index < ids.Length; index++) ids[index] = reader.ReadId();
        reader.RequireComplete(); var value = new ReaderJournalWaitResponse(ids, timedOut); ValidateJournalWaitResponse(value); return value;
    }
    private static void ValidateJournalWaitResponse(ReaderJournalWaitResponse value)
    {
        if (value.ChangedVolumes is null || value.ChangedVolumes.Count > ReaderProtocol.MaximumVolumes
            || value.TimedOut != (value.ChangedVolumes.Count == 0) || value.ChangedVolumes.Any(id => id.IsEmpty)
            || value.ChangedVolumes.Distinct().Count() != value.ChangedVolumes.Count) throw Failure("invalid-journal-wait-response");
    }
}
