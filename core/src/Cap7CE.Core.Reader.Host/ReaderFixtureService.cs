using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.Core.Reader.Host;

internal static class ReaderFixtureService
{
    private static readonly ReaderOpaqueId SnapshotId = new(0xC7CE_0000_0000_0022, 0x0000_0000_0000_0001);
    private static readonly IReadOnlyList<ReaderMftRecord> Records =
    [
        new(101, 5, 1_024, 100_000, 0x20, false, "fixture-01.png", ".png"),
        new(102, 5, 2_048, 200_000, 0x20, false, "fixture-02.psd", ".psd"),
        new(103, 5, 0, 300_000, 0x10, true, "fixture-folder", "")
    ];

    public static async Task<int> RunAsync(CancellationToken stoppingToken)
    {
        ReaderServiceConfig? config = null;
        var stage = "preflight";
        var status = "failed";
        var restrictedToken = false;
        var remoteRejected = false;
        var clientChecked = false;
        var processBound = false;
        try
        {
            restrictedToken = VerifyServiceIdentity();
            config = await ReaderServiceConfig.LoadAsync(stoppingToken);
            stage = "create-pipe";
            using var pipe = ReaderNativePipe.Create(config.AllowedSid);
            remoteRejected = ReaderNativePipe.RejectsRemoteClients(pipe);
            if (!remoteRejected) throw new InvalidOperationException("reader-remote-reject-missing");

            stage = "wait-for-client";
            if (config.Phase == "stop")
            {
                await pipe.WaitForConnectionAsync(stoppingToken);
                throw new InvalidOperationException("reader-stop-phase-connected");
            }

            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            deadline.CancelAfter(TimeSpan.FromSeconds(config.WaitSeconds));
            await pipe.WaitForConnectionAsync(deadline.Token);
            var nativeClientProcessId = ReaderNativePipe.GetClientProcessId(pipe);

            stage = "read-hello";
            if (config.Phase == "disconnect")
            {
                try
                {
                    _ = await ReaderFrameCodec.ReadAsync(pipe, deadline.Token);
                    status = "unexpected-client-data";
                }
                catch (ReaderProtocolException error) when (error.Code == "truncated-header")
                {
                    status = "client-disconnected";
                }
                return status == "client-disconnected" ? 0 : 4;
            }

            var helloFrame = await ReaderFrameCodec.ReadAsync(pipe, deadline.Token);
            RequireRequest(helloFrame, ReaderOperation.Hello);
            var hello = ReaderPayloadCodec.DecodeHelloRequest(helloFrame.Payload.Span);
            processBound = hello.ClientProcessId == nativeClientProcessId;
            if (!processBound) throw new UnauthorizedAccessException("reader-client-process-mismatch");
            clientChecked = AuthenticateClient(pipe, config.AllowedSid);
            if (!clientChecked) throw new UnauthorizedAccessException("reader-client-token-rejected");

            stage = "hello-response";
            await WriteSuccessAsync(pipe, helloFrame,
                ReaderPayloadCodec.EncodeHelloResponse(new ReaderHelloResponse(
                    hello.Nonce,
                    checked((uint)Environment.ProcessId),
                    ReaderProtocol.MaximumPayloadBytes,
                    ReaderProtocol.MaximumRecordsPerPage,
                    ReaderCapabilities.SnapshotPaging
                    | ReaderCapabilities.JournalPaging
                    | ReaderCapabilities.SyntheticFixture)),
                ReaderFrameFlags.None,
                deadline.Token);

            stage = "fixture-session";
            var session = new FixtureSessionState(helloFrame.Header.RequestId);
            while (!session.Complete)
            {
                var request = await ReaderFrameCodec.ReadAsync(pipe, deadline.Token);
                if (request.Header.RequestId <= session.LastRequestId)
                {
                    throw new ReaderProtocolException("non-monotonic-request-id");
                }
                session.LastRequestId = request.Header.RequestId;
                await HandleRequestAsync(pipe, request, session, deadline.Token);
            }
            status = "passed";
            return 0;
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            status = config?.Phase == "stop" ? "service-stopped" : "service-cancelled";
            return config?.Phase == "stop" ? 0 : 4;
        }
        catch (OperationCanceledException)
        {
            status = "client-timeout";
            return 4;
        }
        catch (ReaderProtocolException)
        {
            status = "protocol-rejected";
            return 4;
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            status = error switch
            {
                UnauthorizedAccessException => "access-denied",
                IOException => "client-disconnected",
                _ => "failed"
            };
            return 4;
        }
        finally
        {
            if (config is not null)
            {
                try
                {
                    await ReaderProbeResult.WriteAsync(config, new ReaderProbeResult(
                        status,
                        stage,
                        true,
                        restrictedToken,
                        remoteRejected,
                        clientChecked,
                        processBound,
                        false,
                        false,
                        false));
                }
                catch
                {
                    // The elevated lifecycle probe treats a missing atomic result as failure.
                }
            }
        }
    }

    private static async Task HandleRequestAsync(
        NamedPipeServerStream pipe,
        ReaderFrame request,
        FixtureSessionState session,
        CancellationToken cancellationToken)
    {
        if (request.Header.Kind != ReaderMessageKind.Request)
        {
            throw new ReaderProtocolException("expected-request");
        }
        switch (request.Header.Operation)
        {
            case ReaderOperation.Status:
                ReaderPayloadCodec.RequireEmpty(request.Payload.Span);
                session.StatusRead = true;
                await WriteSuccessAsync(pipe, request,
                    ReaderPayloadCodec.EncodeStatusResponse(new ReaderStatusResponse(
                        true, true, true, true, 1, ReaderHostConstants.FixtureVolumeId)),
                    ReaderFrameFlags.None,
                    cancellationToken);
                break;

            case ReaderOperation.VolumeInspect:
                var inspect = ReaderPayloadCodec.DecodeVolumeInspectRequest(request.Payload.Span);
                if (inspect.VolumeId != ReaderHostConstants.FixtureVolumeId)
                {
                    await WriteErrorAsync(pipe, request, ReaderStatus.UnsupportedVolume, cancellationToken);
                    break;
                }
                session.VolumeInspected = true;
                await WriteSuccessAsync(pipe, request,
                    ReaderPayloadCodec.EncodeVolumeInspectResponse(new ReaderVolumeInspectResponse(
                        inspect.VolumeId,
                        checked((ulong)Records.Count),
                        ReaderHostConstants.FixtureJournalId,
                        true,
                        true)),
                    ReaderFrameFlags.None,
                    cancellationToken);
                break;

            case ReaderOperation.MftOpenSnapshot:
                var open = ReaderPayloadCodec.DecodeMftOpenSnapshotRequest(request.Payload.Span);
                if (open.VolumeId != ReaderHostConstants.FixtureVolumeId)
                {
                    await WriteErrorAsync(pipe, request, ReaderStatus.UnsupportedVolume, cancellationToken);
                    break;
                }
                session.SnapshotOpen = true;
                await WriteSuccessAsync(pipe, request,
                    ReaderPayloadCodec.EncodeMftOpenSnapshotResponse(new ReaderMftOpenSnapshotResponse(
                        SnapshotId, checked((ulong)Records.Count), ReaderHostConstants.FixtureJournalId, 100)),
                    ReaderFrameFlags.None,
                    cancellationToken);
                break;

            case ReaderOperation.MftReadPage:
                var page = ReaderPayloadCodec.DecodeMftReadPageRequest(request.Payload.Span);
                if (!session.SnapshotOpen || page.SnapshotId != SnapshotId || page.Cursor > (ulong)Records.Count)
                {
                    await WriteErrorAsync(pipe, request, ReaderStatus.InvalidRequest, cancellationToken);
                    break;
                }
                var start = checked((int)page.Cursor);
                var count = Math.Min(checked((int)page.MaximumRecords), Records.Count - start);
                var next = start + count;
                var end = next == Records.Count;
                session.PagesRead++;
                await WriteSuccessAsync(pipe, request,
                    ReaderPayloadCodec.EncodeMftReadPageResponse(new ReaderMftReadPageResponse(
                        checked((ulong)next), end, Records.Skip(start).Take(count).ToArray())),
                    end ? ReaderFrameFlags.EndOfStream : ReaderFrameFlags.MoreData,
                    cancellationToken);
                break;

            case ReaderOperation.MftCloseSnapshot:
                var close = ReaderPayloadCodec.DecodeMftCloseSnapshotRequest(request.Payload.Span);
                if (!session.SnapshotOpen || close.SnapshotId != SnapshotId)
                {
                    await WriteErrorAsync(pipe, request, ReaderStatus.InvalidRequest, cancellationToken);
                    break;
                }
                session.SnapshotOpen = false;
                session.SnapshotClosed = true;
                await WriteSuccessAsync(pipe, request, ReadOnlyMemory<byte>.Empty,
                    ReaderFrameFlags.None, cancellationToken);
                break;

            case ReaderOperation.JournalReadBatch:
                var journal = ReaderPayloadCodec.DecodeJournalReadBatchRequest(request.Payload.Span);
                if (journal.VolumeId != ReaderHostConstants.FixtureVolumeId
                    || journal.JournalId != ReaderHostConstants.FixtureJournalId)
                {
                    await WriteErrorAsync(pipe, request, ReaderStatus.JournalDiscontinuous, cancellationToken);
                    break;
                }
                session.JournalRead = true;
                await WriteSuccessAsync(pipe, request,
                    ReaderPayloadCodec.EncodeJournalReadBatchResponse(new ReaderJournalReadBatchResponse(
                        ReaderHostConstants.FixtureJournalId,
                        journal.StartingUsn + 1,
                        true,
                        [new ReaderJournalRecord(103, 5, 0x100, 100, 0x10, true, "fixture-folder")])),
                    ReaderFrameFlags.EndOfStream,
                    cancellationToken);
                break;

            case ReaderOperation.Cancel:
                _ = ReaderPayloadCodec.DecodeCancelRequest(request.Payload.Span);
                await WriteErrorAsync(pipe, request, ReaderStatus.Cancelled, cancellationToken);
                break;

            case ReaderOperation.Hello:
            default:
                await WriteErrorAsync(pipe, request, ReaderStatus.InvalidRequest, cancellationToken);
                break;
        }
    }

    private static void RequireRequest(ReaderFrame frame, ReaderOperation operation)
    {
        if (frame.Header.Kind != ReaderMessageKind.Request || frame.Header.Operation != operation)
        {
            throw new ReaderProtocolException("unexpected-reader-operation");
        }
    }

    private static bool AuthenticateClient(NamedPipeServerStream pipe, string allowedSid)
    {
        var authenticated = false;
        pipe.RunAsClient(() =>
        {
            using var identity = WindowsIdentity.GetCurrent(true);
            if (identity is null) return;
            authenticated = identity.User?.Value == allowedSid
                && !new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
        });
        return authenticated;
    }

    private static bool VerifyServiceIdentity()
    {
        using var identity = WindowsIdentity.GetCurrent();
        if (identity.User?.Value != "S-1-5-18" || !IsTokenRestricted(identity.AccessToken))
        {
            throw new UnauthorizedAccessException("reader-service-token");
        }
        var serviceSid = ((SecurityIdentifier)new NTAccount("NT SERVICE", ReaderHostConstants.ServiceName)
            .Translate(typeof(SecurityIdentifier))).Value;
        if (!(identity.Groups?.Any(group => group.Value == serviceSid) ?? false))
        {
            throw new UnauthorizedAccessException("reader-service-sid");
        }
        return true;
    }

    private static Task WriteSuccessAsync(
        Stream stream,
        ReaderFrame request,
        ReadOnlyMemory<byte> payload,
        ReaderFrameFlags flags,
        CancellationToken cancellationToken) =>
        ReaderFrameCodec.WriteAsync(stream,
            ReaderFrame.Response(request.Header.Operation, request.Header.RequestId,
                ReaderStatus.Success, flags, payload), cancellationToken);

    private static Task WriteErrorAsync(
        Stream stream,
        ReaderFrame request,
        ReaderStatus status,
        CancellationToken cancellationToken) =>
        ReaderFrameCodec.WriteAsync(stream,
            ReaderFrame.Response(request.Header.Operation, request.Header.RequestId,
                status, ReaderFrameFlags.None, ReadOnlyMemory<byte>.Empty), cancellationToken);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsTokenRestricted(SafeAccessTokenHandle token);

    private sealed class FixtureSessionState(ulong lastRequestId)
    {
        public ulong LastRequestId { get; set; } = lastRequestId;
        public bool StatusRead { get; set; }
        public bool VolumeInspected { get; set; }
        public bool SnapshotOpen { get; set; }
        public bool SnapshotClosed { get; set; }
        public bool JournalRead { get; set; }
        public int PagesRead { get; set; }
        public bool Complete => StatusRead
            && VolumeInspected
            && SnapshotClosed
            && JournalRead
            && PagesRead >= 2;
    }
}
