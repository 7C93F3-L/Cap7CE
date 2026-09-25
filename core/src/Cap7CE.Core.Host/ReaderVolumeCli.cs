using System.Diagnostics;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.Json;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Host;

public sealed record ReaderVolumeCliReport(
    string Status,
    bool ClientStandard,
    bool ServiceAuthenticated,
    bool RestrictedServiceSid,
    bool MinimalServicePrivileges,
    bool DemandStart,
    bool LocalSystem,
    bool ExpectedBinaryPath,
    bool ExcessiveRightsDenied,
    bool RemoteClientsRejected,
    long InitialRecords,
    int InitialPages,
    double InitialBuildMs,
    int IncrementalRecords,
    bool IncrementalContinuous,
    bool CancellationAccepted,
    bool DiscontinuityDetected,
    long RebuiltRecords,
    int RebuildPages,
    double RebuildMs,
    bool CatalogIntegrityOk,
    long CatalogBytes,
    bool CleanupOk,
    bool SourceFilesRead,
    bool SourceVolumeWritten,
    bool NetworkUsed);

public static class ReaderVolumeCli
{
    private const uint UsnReasonFileDelete = 0x00000200;

    public static async Task<ReaderVolumeCliReport> RunAsync(CancellationToken cancellationToken)
    {
        RequireStandardClient();
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-Core-P22-" + Guid.NewGuid().ToString("N"));
        var cleanupOk = false;
        try
        {
            Directory.CreateDirectory(root);
            var databasePath = Path.Combine(root, "catalog.db");
            var database = new CatalogDatabase(databasePath);
            await database.InitializeAsync(cancellationToken);

        using var connection = await ReaderNativeClient.ConnectAsync(
            ReaderClientConstants.Legacy, cancellationToken);
            var identity = ReaderServiceIdentity.Verify(
                ReaderClientConstants.Legacy, connection.ServerProcessId);
            if (!identity.Passed) throw new UnauthorizedAccessException(identity.Stage);
            var session = await ReaderVolumeSession.ConnectAsync(connection, cancellationToken);

            var status = await session.ReadStatusAsync(cancellationToken);
            if (!status.Ready || status.FixtureOnly || !status.RemoteClientsRejected || !status.ClientAuthenticated)
            {
                throw new InvalidDataException("reader-volume-status");
            }
            var inspect = await session.InspectAsync(status.PrimaryVolumeId, cancellationToken);
            if (!inspect.Supported || !inspect.JournalAvailable)
            {
                throw new InvalidDataException("reader-volume-inspect");
            }

            var catalogVolumeId = "volume-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
            var initial = await BuildInitialAsync(
                database, session, status.PrimaryVolumeId, catalogVolumeId, cancellationToken);

            var volume = await database.TransitionVolumeAsync(
                catalogVolumeId, CatalogVolumeState.Ready, CatalogVolumeState.CatchingUp, cancellationToken);
            var delta = await ApplyJournalAsync(
                database, session, status.PrimaryVolumeId, catalogVolumeId,
                initial.JournalId, initial.JournalStartingUsn, volume, cancellationToken);
            await database.TransitionVolumeAsync(
                catalogVolumeId, CatalogVolumeState.CatchingUp, CatalogVolumeState.Ready, cancellationToken);

            var discontinuityDetected = await session.ExpectDiscontinuityAsync(
                status.PrimaryVolumeId,
                unchecked(initial.JournalId + 1),
                initial.JournalStartingUsn,
                cancellationToken);
            if (!discontinuityDetected) throw new InvalidDataException("reader-discontinuity-not-detected");
            var needsRebuild = await database.ReconcileVolumeAsync(new CatalogVolumeObservation(
                catalogVolumeId, true, "forced-discontinuity", false), cancellationToken);
            if (needsRebuild.State != CatalogVolumeState.NeedsRebuild)
            {
                throw new InvalidDataException("catalog-discontinuity-state");
            }

            await database.BeginRebuildAsync(
                catalogVolumeId,
                ToJournalId(inspect.JournalId),
                "recovery-" + Guid.NewGuid().ToString("N"),
                cancellationToken);
            var rebuilt = await StreamSnapshotAsync(
                database, session, status.PrimaryVolumeId, catalogVolumeId, cancellationToken);
            await database.TransitionVolumeAsync(
                catalogVolumeId, CatalogVolumeState.Building, CatalogVolumeState.Ready, cancellationToken);

            _ = await session.OpenSnapshotAsync(status.PrimaryVolumeId, cancellationToken);
            var cancellationAccepted = await session.CancelAsync(cancellationToken);
            var integrity = await database.CheckIntegrityAsync(cancellationToken);
            var catalogBytes = await database.ReadStorageBytesAsync(cancellationToken);
            var finalCount = await database.CountNodesAsync(catalogVolumeId, cancellationToken);
            if (initial.Records <= 0 || rebuilt.Records <= 0 || rebuilt.Records != finalCount)
            {
                throw new InvalidDataException("reader-volume-record-count");
            }

            SqliteConnection.ClearAllPools();
            Directory.Delete(root, recursive: true);
            cleanupOk = !Directory.Exists(root);
            return new ReaderVolumeCliReport(
                "passed",
                true,
                identity.Passed,
                identity.RestrictedServiceSid,
                identity.MinimalPrivileges,
                identity.DemandStart,
                identity.LocalSystem,
                identity.ExpectedBinaryPath,
                connection.ExcessiveRightsDenied,
                status.RemoteClientsRejected,
                initial.Records,
                initial.Pages,
                initial.ElapsedMs,
                delta.Records,
                delta.Continuous,
                cancellationAccepted,
                discontinuityDetected,
                rebuilt.Records,
                rebuilt.Pages,
                rebuilt.ElapsedMs,
                integrity,
                catalogBytes,
                cleanupOk,
                false,
                false,
                false);
        }
        finally
        {
            if (!cleanupOk && Directory.Exists(root))
            {
                SqliteConnection.ClearAllPools();
                try { Directory.Delete(root, recursive: true); }
                catch { /* The outer lifecycle probe reports cleanup failure. */ }
            }
        }
    }

    public static string Serialize(ReaderVolumeCliReport report) => JsonSerializer.Serialize(report);

    private static async Task<SnapshotBuildResult> BuildInitialAsync(
        CatalogDatabase database,
        ReaderVolumeSession session,
        ReaderOpaqueId readerVolumeId,
        string catalogVolumeId,
        CancellationToken cancellationToken)
    {
        var open = await session.OpenSnapshotAsync(readerVolumeId, cancellationToken);
        await database.RegisterVolumeAsync(catalogVolumeId, "NTFS", ToJournalId(open.JournalId), cancellationToken);
        await database.TransitionVolumeAsync(
            catalogVolumeId, CatalogVolumeState.Disabled, CatalogVolumeState.Discovering, cancellationToken);
        await database.TransitionVolumeAsync(
            catalogVolumeId, CatalogVolumeState.Discovering, CatalogVolumeState.Building, cancellationToken);
        var result = await StreamOpenedSnapshotAsync(
            database, session, open, catalogVolumeId, cancellationToken);
        await database.TransitionVolumeAsync(
            catalogVolumeId, CatalogVolumeState.Building, CatalogVolumeState.Ready, cancellationToken);
        return result;
    }

    private static async Task<JournalBuildResult> ApplyJournalAsync(
        CatalogDatabase database,
        ReaderVolumeSession session,
        ReaderOpaqueId readerVolumeId,
        string catalogVolumeId,
        ulong journalId,
        long startingUsn,
        CatalogVolumeSnapshot volume,
        CancellationToken cancellationToken)
    {
        var cursor = startingUsn;
        var total = 0;
        for (var batch = 0; batch < 1_024; batch++)
        {
            var page = await session.ReadJournalPageAsync(
                readerVolumeId, journalId, cursor, ReaderProtocol.MaximumRecordsPerPage, cancellationToken);
            if (!page.Response.Continuous || page.Response.NextUsn < cursor
                || (!page.EndOfStream && page.Response.NextUsn == cursor))
            {
                throw new InvalidDataException("reader-journal-cursor");
            }
            var nodes = page.Response.Records
                .Select(record => ToCatalogNode(catalogVolumeId, record))
                .ToArray();
            await database.ApplyBatchAsync(new CatalogWriteBatch(
                catalogVolumeId,
                ToJournalId(journalId),
                volume.Checkpoint,
                volume.CatalogRevision,
                "usn:" + page.Response.NextUsn,
                "delta-" + Guid.NewGuid().ToString("N"),
                nodes), cancellationToken);
            volume = await database.ReadVolumeAsync(catalogVolumeId, cancellationToken)
                ?? throw new InvalidDataException("catalog-volume-missing");
            total += nodes.Length;
            cursor = page.Response.NextUsn;
            if (page.EndOfStream) return new JournalBuildResult(total, true);
        }
        throw new InvalidDataException("reader-journal-page-limit");
    }

    private static async Task<SnapshotBuildResult> StreamSnapshotAsync(
        CatalogDatabase database,
        ReaderVolumeSession session,
        ReaderOpaqueId readerVolumeId,
        string catalogVolumeId,
        CancellationToken cancellationToken)
    {
        var open = await session.OpenSnapshotAsync(readerVolumeId, cancellationToken);
        return await StreamOpenedSnapshotAsync(
            database, session, open, catalogVolumeId, cancellationToken);
    }

    private static async Task<SnapshotBuildResult> StreamOpenedSnapshotAsync(
        CatalogDatabase database,
        ReaderVolumeSession session,
        ReaderMftOpenSnapshotResponse open,
        string catalogVolumeId,
        CancellationToken cancellationToken)
    {
        var watch = Stopwatch.StartNew();
        var cursor = 0UL;
        var pages = 0;
        long records = 0;
        try
        {
            while (pages < 1_024)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var page = await session.ReadMftPageAsync(
                    open.SnapshotId, cursor, ReaderProtocol.MaximumRecordsPerPage, cancellationToken);
                if (page.NextCursor < cursor || (!page.EndOfStream && page.NextCursor == cursor))
                {
                    throw new InvalidDataException("reader-volume-cursor");
                }
                if (page.Records.Count > 0)
                {
                    var volume = await database.ReadVolumeAsync(catalogVolumeId, cancellationToken)
                        ?? throw new InvalidDataException("catalog-volume-missing");
                    var nodes = page.Records.Select(record => ToCatalogNode(catalogVolumeId, record)).ToArray();
                    await database.ApplyBatchAsync(new CatalogWriteBatch(
                        catalogVolumeId,
                        ToJournalId(open.JournalId),
                        volume.Checkpoint,
                        volume.CatalogRevision,
                        "mft:" + page.NextCursor,
                        "page-" + Guid.NewGuid().ToString("N"),
                        nodes), cancellationToken);
                    records += nodes.Length;
                }
                pages++;
                cursor = page.NextCursor;
                if (page.EndOfStream) break;
            }
            if (pages >= 1_024) throw new InvalidDataException("reader-volume-page-limit");
        }
        finally
        {
            await session.CloseSnapshotAsync(open.SnapshotId, cancellationToken);
        }
        watch.Stop();
        return new SnapshotBuildResult(
            records, pages, Math.Round(watch.Elapsed.TotalMilliseconds, 1),
            open.JournalId, open.JournalStartingUsn);
    }

    private static CatalogNodeRecord ToCatalogNode(string volumeId, ReaderMftRecord record) => new(
        volumeId,
        checked((long)record.FileReference),
        checked((long)record.ParentFileReference),
        record.Name,
        record.Extension,
        record.IsDirectory,
        record.Attributes,
        true,
        null,
        null);

    private static CatalogNodeRecord ToCatalogNode(string volumeId, ReaderJournalRecord record) => new(
        volumeId,
        checked((long)record.FileReference),
        checked((long)record.ParentFileReference),
        record.Name,
        record.IsDirectory ? string.Empty : SafeExtension(record.Name),
        record.IsDirectory,
        record.Attributes,
        (record.Reason & UsnReasonFileDelete) == 0,
        null,
        null);

    private static string SafeExtension(string name)
    {
        var extension = Path.GetExtension(name);
        return System.Text.Encoding.UTF8.GetByteCount(extension) <= ReaderProtocol.MaximumExtensionBytes
            ? extension
            : string.Empty;
    }

    private static string ToJournalId(ulong journalId) => journalId.ToString("X16");

    private static void RequireStandardClient()
    {
        using var identity = WindowsIdentity.GetCurrent();
        if (new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))
        {
            throw new UnauthorizedAccessException("reader-client-must-be-standard");
        }
    }

    private sealed record SnapshotBuildResult(
        long Records,
        int Pages,
        double ElapsedMs,
        ulong JournalId,
        long JournalStartingUsn);

    private sealed record JournalBuildResult(int Records, bool Continuous);
}

internal sealed class ReaderVolumeSession
{
    private readonly Stream stream;
    private ulong requestId = 1;

    private ReaderVolumeSession(Stream stream) => this.stream = stream;

    public static async Task<ReaderVolumeSession> ConnectAsync(
        ReaderPipeConnection connection,
        CancellationToken cancellationToken)
    {
        var session = new ReaderVolumeSession(connection.Stream);
        var nonce = RandomNumberGenerator.GetBytes(ReaderProtocol.HelloNonceBytes);
        var response = await session.ExchangeSuccessAsync(
            ReaderOperation.Hello,
            ReaderPayloadCodec.EncodeHelloRequest(new ReaderHelloRequest(
                nonce, checked((uint)Environment.ProcessId))),
            ReaderFrameFlags.None,
            cancellationToken);
        var hello = ReaderPayloadCodec.DecodeHelloResponse(response.Payload.Span);
        if (!nonce.SequenceEqual(hello.Nonce)
            || hello.ServerProcessId != connection.ServerProcessId
            || hello.Capabilities.HasFlag(ReaderCapabilities.SyntheticFixture)
            || !hello.Capabilities.HasFlag(ReaderCapabilities.SnapshotPaging)
            || !hello.Capabilities.HasFlag(ReaderCapabilities.JournalPaging))
        {
            throw new UnauthorizedAccessException("reader-volume-hello");
        }
        return session;
    }

    public async Task<ReaderStatusResponse> ReadStatusAsync(CancellationToken token) =>
        ReaderPayloadCodec.DecodeStatusResponse((await ExchangeSuccessAsync(
            ReaderOperation.Status, ReadOnlyMemory<byte>.Empty, ReaderFrameFlags.None, token)).Payload.Span);

    public async Task<ReaderVolumeInspectResponse> InspectAsync(ReaderOpaqueId volumeId, CancellationToken token) =>
        ReaderPayloadCodec.DecodeVolumeInspectResponse((await ExchangeSuccessAsync(
            ReaderOperation.VolumeInspect,
            ReaderPayloadCodec.EncodeVolumeInspectRequest(new ReaderVolumeInspectRequest(volumeId)),
            ReaderFrameFlags.None,
            token)).Payload.Span);

    public async Task<ReaderMftOpenSnapshotResponse> OpenSnapshotAsync(
        ReaderOpaqueId volumeId, CancellationToken token) =>
        ReaderPayloadCodec.DecodeMftOpenSnapshotResponse((await ExchangeSuccessAsync(
            ReaderOperation.MftOpenSnapshot,
            ReaderPayloadCodec.EncodeMftOpenSnapshotRequest(new ReaderMftOpenSnapshotRequest(volumeId)),
            ReaderFrameFlags.None,
            token)).Payload.Span);

    public async Task<ReaderMftReadPageResponse> ReadMftPageAsync(
        ReaderOpaqueId snapshotId,
        ulong cursor,
        uint limit,
        CancellationToken token)
    {
        var frame = await ExchangeAsync(
            ReaderOperation.MftReadPage,
            ReaderPayloadCodec.EncodeMftReadPageRequest(new ReaderMftReadPageRequest(snapshotId, cursor, limit)),
            token);
        if (frame.Header.Status != ReaderStatus.Success
            || frame.Header.Flags is not (ReaderFrameFlags.MoreData or ReaderFrameFlags.EndOfStream))
        {
            throw new ReaderProtocolException("unexpected-reader-volume-page");
        }
        return ReaderPayloadCodec.DecodeMftReadPageResponse(frame.Payload.Span);
    }

    public async Task CloseSnapshotAsync(ReaderOpaqueId snapshotId, CancellationToken token) =>
        _ = await ExchangeSuccessAsync(
            ReaderOperation.MftCloseSnapshot,
            ReaderPayloadCodec.EncodeMftCloseSnapshotRequest(new ReaderMftCloseSnapshotRequest(snapshotId)),
            ReaderFrameFlags.None,
            token);

    public async Task<ReaderJournalPage> ReadJournalPageAsync(
        ReaderOpaqueId volumeId,
        ulong journalId,
        long startingUsn,
        uint limit,
        CancellationToken token)
    {
        var frame = await ExchangeAsync(
            ReaderOperation.JournalReadBatch,
            ReaderPayloadCodec.EncodeJournalReadBatchRequest(new ReaderJournalReadBatchRequest(
                volumeId, journalId, startingUsn, limit)),
            token);
        if (frame.Header.Status != ReaderStatus.Success
            || frame.Header.Flags is not (ReaderFrameFlags.MoreData or ReaderFrameFlags.EndOfStream))
        {
            throw new ReaderProtocolException("unexpected-reader-journal-page");
        }
        return new ReaderJournalPage(
            ReaderPayloadCodec.DecodeJournalReadBatchResponse(frame.Payload.Span),
            frame.Header.Flags == ReaderFrameFlags.EndOfStream);
    }

    public async Task<bool> ExpectDiscontinuityAsync(
        ReaderOpaqueId volumeId,
        ulong journalId,
        long startingUsn,
        CancellationToken token)
    {
        var response = await ExchangeAsync(
            ReaderOperation.JournalReadBatch,
            ReaderPayloadCodec.EncodeJournalReadBatchRequest(new ReaderJournalReadBatchRequest(
                volumeId, journalId, startingUsn, 1)),
            token);
        return response.Header.Status == ReaderStatus.JournalDiscontinuous
            && response.Payload.IsEmpty
            && response.Header.Flags == ReaderFrameFlags.None;
    }

    public async Task<bool> CancelAsync(CancellationToken token)
    {
        var target = requestId - 1;
        var response = await ExchangeAsync(
            ReaderOperation.Cancel,
            ReaderPayloadCodec.EncodeCancelRequest(new ReaderCancelRequest(target)),
            token);
        return response.Header.Status == ReaderStatus.Cancelled
            && response.Payload.IsEmpty
            && response.Header.Flags == ReaderFrameFlags.None;
    }

    private async Task<ReaderFrame> ExchangeSuccessAsync(
        ReaderOperation operation,
        ReadOnlyMemory<byte> payload,
        ReaderFrameFlags flags,
        CancellationToken token)
    {
        var response = await ExchangeAsync(operation, payload, token);
        if (response.Header.Status != ReaderStatus.Success || response.Header.Flags != flags)
        {
            throw new ReaderProtocolException("unexpected-reader-volume-response");
        }
        return response;
    }

    private async Task<ReaderFrame> ExchangeAsync(
        ReaderOperation operation,
        ReadOnlyMemory<byte> payload,
        CancellationToken token)
    {
        var current = requestId++;
        await ReaderFrameCodec.WriteAsync(stream, ReaderFrame.Request(operation, current, payload), token);
        var response = await ReaderFrameCodec.ReadAsync(stream, token);
        if (response.Header.Kind != ReaderMessageKind.Response
            || response.Header.Operation != operation
            || response.Header.RequestId != current)
        {
            throw new ReaderProtocolException("unexpected-reader-volume-response-envelope");
        }
        return response;
    }
}

internal sealed record ReaderJournalPage(
    ReaderJournalReadBatchResponse Response,
    bool EndOfStream);
