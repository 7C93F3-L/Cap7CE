using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.ComponentModel;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.Core.Reader.Host;

internal static class ReaderVolumeService
{
    public static async Task<int> RunAsync(ReaderServiceConfig config, CancellationToken stoppingToken)
    {
        var stage = "preflight";
        var status = "failed";
        var restrictedToken = false;
        var remoteRejected = false;
        var clientChecked = false;
        var processBound = false;
        var volumes = new List<ReaderNtfsVolume>();
        Task<ReaderFrame>? pendingRead = null;
        ReaderNtfsVolume.ReaderNtfsSnapshot? snapshot = null;
        try
        {
            restrictedToken = VerifyServiceIdentity();
            stage = "open-volume";
            foreach (var driveLetter in config.AuthorizedVolumeLetters)
            {
                try
                {
                    volumes.Add(ReaderNtfsVolume.Open(driveLetter));
                }
                catch (Exception error) when (error is Win32Exception or NotSupportedException)
                {
                    // An explicitly authorized volume may be offline. Keep the Reader available so
                    // the ordinary Core can observe an empty enumeration and freeze that volume.
                }
            }

            stage = "create-pipe";
            using var pipe = ReaderNativePipe.Create(config.AllowedSid);
            remoteRejected = ReaderNativePipe.RejectsRemoteClients(pipe);
            if (!remoteRejected) throw new InvalidOperationException("reader-remote-reject-missing");

            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            deadline.CancelAfter(TimeSpan.FromSeconds(config.WaitSeconds));
            stage = "wait-for-client";
            await pipe.WaitForConnectionAsync(deadline.Token);
            var nativeClientProcessId = ReaderNativePipe.GetClientProcessId(pipe);

            stage = "read-hello";
            var helloFrame = await ReaderFrameCodec.ReadAsync(pipe, deadline.Token);
            RequireRequest(helloFrame, ReaderOperation.Hello);
            var hello = ReaderPayloadCodec.DecodeHelloRequest(helloFrame.Payload.Span);
            processBound = hello.ClientProcessId == nativeClientProcessId;
            if (!processBound) throw new UnauthorizedAccessException("reader-client-process-mismatch");
            clientChecked = AuthenticateClient(pipe, config.AllowedSid);
            if (!clientChecked) throw new UnauthorizedAccessException("reader-client-token-rejected");

            await WriteSuccessAsync(pipe, helloFrame,
                ReaderPayloadCodec.EncodeHelloResponse(new ReaderHelloResponse(
                    hello.Nonce,
                    checked((uint)Environment.ProcessId),
                    ReaderProtocol.MaximumPayloadBytes,
                    ReaderProtocol.MaximumRecordsPerPage,
                    ReaderCapabilities.SnapshotPaging | ReaderCapabilities.JournalPaging
                    | (helloFrame.Header.MajorVersion == ReaderProtocol.CurrentMajorVersion
                        ? ReaderCapabilities.MultiVolume | ReaderCapabilities.BasicFacts | ReaderCapabilities.JournalChangeWait
                        : ReaderCapabilities.None))),
                ReaderFrameFlags.None,
                deadline.Token);

            stage = "volume-session";
            var lastRequestId = helloFrame.Header.RequestId;
            var complete = false;
            while (!complete)
            {
                var request = await (pendingRead ?? ReaderFrameCodec.ReadAsync(pipe, deadline.Token));
                pendingRead = null;
                if (request.Header.RequestId <= lastRequestId)
                {
                    throw new ReaderProtocolException("non-monotonic-request-id");
                }
                lastRequestId = request.Header.RequestId;
                if (request.Header.Kind != ReaderMessageKind.Request)
                {
                    throw new ReaderProtocolException("expected-request");
                }
                if (request.Header.MajorVersion != helloFrame.Header.MajorVersion)
                {
                    throw new ReaderProtocolException("reader-version-changed");
                }

                switch (request.Header.Operation)
                {
                    case ReaderOperation.Status:
                        ReaderPayloadCodec.RequireEmpty(request.Payload.Span);
                        await WriteSuccessAsync(pipe, request,
                            ReaderPayloadCodec.EncodeStatusResponse(new ReaderStatusResponse(
                                volumes.Count > 0, false, true, true,
                                helloFrame.Header.MajorVersion == ReaderProtocol.CurrentMajorVersion ? 2u : 1u,
                                volumes.FirstOrDefault()?.VolumeId ?? default)),
                            ReaderFrameFlags.None, deadline.Token);
                        break;

                    case ReaderOperation.VolumeEnumerate:
                        ReaderPayloadCodec.RequireEmpty(request.Payload.Span);
                        if (request.Header.MajorVersion != ReaderProtocol.CurrentMajorVersion)
                        {
                            await WriteErrorAsync(pipe, request, ReaderStatus.UnsupportedVersion, deadline.Token);
                            break;
                        }
                        var descriptors = volumes.Select(candidate =>
                        {
                            var journalAvailable = true;
                            try { _ = candidate.QueryJournal(); }
                            catch { journalAvailable = false; }
                            return new ReaderVolumeDescriptor(
                                candidate.VolumeId, candidate.DisplayName, true, true, journalAvailable);
                        }).ToArray();
                        await WriteSuccessAsync(pipe, request,
                            ReaderPayloadCodec.EncodeVolumeEnumerateResponse(
                                new ReaderVolumeEnumerateResponse(descriptors)),
                            ReaderFrameFlags.None, deadline.Token);
                        break;

                    case ReaderOperation.VolumeInspect:
                        var inspect = ReaderPayloadCodec.DecodeVolumeInspectRequest(request.Payload.Span);
                        var inspectedVolume = volumes.SingleOrDefault(candidate => candidate.VolumeId == inspect.VolumeId);
                        if (inspectedVolume is null)
                        {
                            await WriteErrorAsync(pipe, request, ReaderStatus.UnsupportedVolume, deadline.Token);
                            break;
                        }
                        var journal = inspectedVolume.QueryJournal();
                        var inspectPayload = request.Header.MajorVersion == ReaderProtocol.CurrentMajorVersion
                            ? ReaderPayloadCodec.EncodeVolumeInspectResponseV2(new ReaderVolumeInspectResponseV2(
                                inspectedVolume.VolumeId, 0, journal.JournalId, journal.FirstUsn,
                                journal.LowestValidUsn, journal.NextUsn, true, true))
                            : ReaderPayloadCodec.EncodeVolumeInspectResponse(new ReaderVolumeInspectResponse(
                                inspectedVolume.VolumeId, 0, journal.JournalId, true, true));
                        await WriteSuccessAsync(pipe, request, inspectPayload,
                            ReaderFrameFlags.None, deadline.Token);
                        break;

                    case ReaderOperation.MftOpenSnapshot:
                        var open = ReaderPayloadCodec.DecodeMftOpenSnapshotRequest(request.Payload.Span);
                        var requestedVolume = volumes.SingleOrDefault(candidate => candidate.VolumeId == open.VolumeId);
                        if (requestedVolume is null || snapshot is not null)
                        {
                            await WriteErrorAsync(pipe, request,
                                requestedVolume is null ? ReaderStatus.UnsupportedVolume : ReaderStatus.Busy,
                                deadline.Token);
                            break;
                        }
                        snapshot = requestedVolume.OpenSnapshot();
                        await WriteSuccessAsync(pipe, request,
                            ReaderPayloadCodec.EncodeMftOpenSnapshotResponse(new ReaderMftOpenSnapshotResponse(
                                snapshot.Id, 0, snapshot.Journal.JournalId, snapshot.Journal.NextUsn)),
                            ReaderFrameFlags.None, deadline.Token);
                        break;

                    case ReaderOperation.MftReadPage:
                        var page = ReaderPayloadCodec.DecodeMftReadPageRequest(request.Payload.Span);
                        if (snapshot is null || page.SnapshotId != snapshot.Id)
                        {
                            await WriteErrorAsync(pipe, request, ReaderStatus.InvalidRequest, deadline.Token);
                            break;
                        }
                        if (request.Header.MajorVersion == ReaderProtocol.CurrentMajorVersion)
                        {
                            var resultV2 = snapshot.ReadPageV2(page.Cursor, page.MaximumRecords, deadline.Token);
                            await WriteSuccessAsync(pipe, request,
                                ReaderPayloadCodec.EncodeMftReadPageResponseV2(resultV2),
                                resultV2.EndOfStream ? ReaderFrameFlags.EndOfStream : ReaderFrameFlags.MoreData,
                                deadline.Token);
                        }
                        else
                        {
                            var result = snapshot.ReadPage(page.Cursor, page.MaximumRecords, deadline.Token);
                            await WriteSuccessAsync(pipe, request,
                                ReaderPayloadCodec.EncodeMftReadPageResponse(result),
                                result.EndOfStream ? ReaderFrameFlags.EndOfStream : ReaderFrameFlags.MoreData,
                                deadline.Token);
                        }
                        break;

                    case ReaderOperation.MftCloseSnapshot:
                        var close = ReaderPayloadCodec.DecodeMftCloseSnapshotRequest(request.Payload.Span);
                        if (snapshot is null || close.SnapshotId != snapshot.Id)
                        {
                            await WriteErrorAsync(pipe, request, ReaderStatus.InvalidRequest, deadline.Token);
                            break;
                        }
                        snapshot.Dispose();
                        snapshot = null;
                        await WriteSuccessAsync(pipe, request, ReadOnlyMemory<byte>.Empty,
                            ReaderFrameFlags.None, deadline.Token);
                        break;

                    case ReaderOperation.JournalReadBatch:
                        var journalRequest = ReaderPayloadCodec.DecodeJournalReadBatchRequest(request.Payload.Span);
                        var journalVolume = volumes.SingleOrDefault(candidate => candidate.VolumeId == journalRequest.VolumeId);
                        if (journalVolume is null)
                        {
                            await WriteErrorAsync(pipe, request, ReaderStatus.UnsupportedVolume, deadline.Token);
                            break;
                        }
                        try
                        {
                            if (request.Header.MajorVersion == ReaderProtocol.CurrentMajorVersion)
                            {
                                var journalResultV2 = journalVolume.ReadJournalV2(
                                    journalRequest.JournalId,
                                    journalRequest.StartingUsn,
                                    journalRequest.MaximumRecords,
                                    deadline.Token);
                                await WriteSuccessAsync(pipe, request,
                                    ReaderPayloadCodec.EncodeJournalReadBatchResponseV2(journalResultV2.Response),
                                    journalResultV2.EndOfStream ? ReaderFrameFlags.EndOfStream : ReaderFrameFlags.MoreData,
                                    deadline.Token);
                            }
                            else
                            {
                                var journalResult = journalVolume.ReadJournal(
                                    journalRequest.JournalId,
                                    journalRequest.StartingUsn,
                                    journalRequest.MaximumRecords,
                                    deadline.Token);
                                await WriteSuccessAsync(pipe, request,
                                    ReaderPayloadCodec.EncodeJournalReadBatchResponse(journalResult.Response),
                                    journalResult.EndOfStream ? ReaderFrameFlags.EndOfStream : ReaderFrameFlags.MoreData,
                                    deadline.Token);
                            }
                        }
                        catch (ReaderJournalDiscontinuousException)
                        {
                            await WriteErrorAsync(pipe, request, ReaderStatus.JournalDiscontinuous, deadline.Token);
                        }
                        break;

                    case ReaderOperation.JournalWaitAny:
                        var waitRequest = ReaderPayloadCodec.DecodeJournalWaitRequest(request.Payload.Span);
                        if (waitRequest.Cursors.Any(cursor => !volumes.Any(candidate => candidate.VolumeId == cursor.VolumeId))) {
                            await WriteErrorAsync(pipe, request, ReaderStatus.UnsupportedVolume, deadline.Token);
                            break;
                        }
                        using (var waitLifetime = CancellationTokenSource.CreateLinkedTokenSource(deadline.Token)) {
                            var waiting = ReaderJournalWaitCoordinator.WaitAsync(waitRequest, (cursor, token) =>
                                volumes.Single(candidate => candidate.VolumeId == cursor.VolumeId).WaitForJournalChangeAsync(cursor.JournalId, cursor.StartingUsn, token),
                                waitLifetime.Token);
                            // Keep one next-frame read to retire native waits on
                            // disconnect, or an explicit cancel while waiting.
                            pendingRead = ReaderFrameCodec.ReadAsync(pipe, deadline.Token);
                            var joined = await ReaderJournalWaitChannel.CompleteAsync(request, waiting, pendingRead, waitLifetime);
                            if (joined.Cancellation is { } cancel) {
                                pendingRead = null;
                                await WriteErrorAsync(pipe, cancel, ReaderStatus.Cancelled, deadline.Token); complete = true;
                            } else await WriteSuccessAsync(pipe, request, ReaderPayloadCodec.EncodeJournalWaitResponse(joined.Response!), ReaderFrameFlags.None, deadline.Token);
                        }
                        break;

                    case ReaderOperation.Cancel:
                        _ = ReaderPayloadCodec.DecodeCancelRequest(request.Payload.Span);
                        snapshot?.Dispose();
                        snapshot = null;
                        await WriteErrorAsync(pipe, request, ReaderStatus.Cancelled, deadline.Token);
                        complete = true;
                        break;

                    case ReaderOperation.Hello:
                    default:
                        await WriteErrorAsync(pipe, request, ReaderStatus.InvalidRequest, deadline.Token);
                        break;
                }
            }
            status = "passed";
            return 0;
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            status = "service-stopped";
            return 0;
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
                NotSupportedException => "unsupported-volume",
                IOException => "client-disconnected",
                _ => "failed"
            };
            return 4;
        }
        finally
        {
            if (pendingRead is not null) {
                try { await pendingRead; } catch (Exception error) when (error is not OutOfMemoryException) { }
            }
            snapshot?.Dispose();
            foreach (var volume in volumes) volume.Dispose();
            try
            {
                await ReaderProbeResult.WriteAsync(config, new ReaderProbeResult(
                    status,
                    stage,
                    false,
                    restrictedToken,
                    remoteRejected,
                    clientChecked,
                    processBound,
                    volumes.Count > 0,
                    false,
                    false));
            }
            catch
            {
                // The elevated lifecycle probe treats a missing atomic result as failure.
            }
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
            ReaderFrame.ResponseFor(request, ReaderStatus.Success, flags, payload), cancellationToken);

    private static Task WriteErrorAsync(
        Stream stream,
        ReaderFrame request,
        ReaderStatus status,
        CancellationToken cancellationToken) =>
        ReaderFrameCodec.WriteAsync(stream,
            ReaderFrame.ResponseFor(request, status, ReaderFrameFlags.None, ReadOnlyMemory<byte>.Empty), cancellationToken);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsTokenRestricted(SafeAccessTokenHandle token);

}
