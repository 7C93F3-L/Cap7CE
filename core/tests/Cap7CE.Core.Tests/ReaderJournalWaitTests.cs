using System.Buffers.Binary;
using Cap7CE.Core.Reader.Host;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Tests;

internal static class ReaderJournalWaitTests
{
    public static async Task RunAsync()
    {
        ReaderJournalWaitCursor[] cursors = [new(new(1, 2), 42, 100), new(new(3, 4), 43, 200), new(new(5, 6), 44, long.MaxValue)];
        var request = new ReaderJournalWaitRequest(cursors, 30000);
        var encoded = ReaderPayloadCodec.EncodeJournalWaitRequest(request);
        var decoded = ReaderPayloadCodec.DecodeJournalWaitRequest(encoded);
        TestAssert.True(decoded.Cursors.SequenceEqual(cursors), "journal wait cursor IDs and USNs round trip exactly");
        TestAssert.Equal(30000u, decoded.WaitMilliseconds, "journal wait deadline round trips");
        var response = ReaderPayloadCodec.DecodeJournalWaitResponse(ReaderPayloadCodec.EncodeJournalWaitResponse(new([cursors[1].VolumeId], false)));
        TestAssert.Equal(cursors[1].VolumeId, response.ChangedVolumes.Single(), "journal wake contains only stable volume IDs");
        TestAssert.True(ReaderPayloadCodec.DecodeJournalWaitResponse(ReaderPayloadCodec.EncodeJournalWaitResponse(new([], true))).TimedOut,
            "bounded empty native wait returns timeout without fake changes");
        foreach (var invalid in new[] { request with { WaitMilliseconds = 0 }, request with { WaitMilliseconds = 30001 },
            request with { Cursors = [] }, request with { Cursors = [cursors[0], cursors[0]] },
            request with { Cursors = [cursors[0] with { StartingUsn = -1 }] }, request with { Cursors = [cursors[0] with { JournalId = 0 }] },
            request with { Cursors = [cursors[0] with { VolumeId = default }] } })
            await TestAssert.ThrowsAsync<ReaderProtocolException>(() => Task.Run(() => ReaderPayloadCodec.EncodeJournalWaitRequest(invalid)), "invalid native wait target rejected");
        var excessive = encoded.ToArray(); BinaryPrimitives.WriteUInt32LittleEndian(excessive.AsSpan(4), uint.MaxValue);
        await TestAssert.ThrowsAsync<ReaderProtocolException>(() => Task.Run(() => ReaderPayloadCodec.DecodeJournalWaitRequest(excessive)), "oversized wait count rejected before allocation");
        await TestAssert.ThrowsAsync<ReaderProtocolException>(() => Task.Run(() => ReaderPayloadCodec.DecodeJournalWaitRequest(encoded[..^1])), "truncated wait payload rejected");
        await TestAssert.ThrowsAsync<ReaderProtocolException>(() => Task.Run(() => ReaderPayloadCodec.DecodeJournalWaitRequest([.. encoded, 0])), "trailing wait payload rejected");
        await TestAssert.ThrowsAsync<ReaderProtocolException>(() => Task.Run(() => ReaderPayloadCodec.EncodeJournalWaitResponse(new([], false))), "empty event cannot pretend to be a wake");
        await TestAssert.ThrowsAsync<ReaderProtocolException>(() => Task.Run(() => ReaderPayloadCodec.EncodeJournalWaitResponse(new([cursors[0].VolumeId], true))), "timeout cannot include a changed volume");
        await TestAssert.ThrowsAsync<ReaderProtocolException>(() => Task.Run(() => ReaderFrameCodec.Encode(ReaderFrame.Request(ReaderOperation.JournalWaitAny, 1, encoded))),
            "native change wait is limited to CR2");
        TestAssert.Equal(ReaderOperation.JournalWaitAny, ReaderFrameCodec.Decode(ReaderFrameCodec.Encode(ReaderFrame.RequestV2(ReaderOperation.JournalWaitAny, 1, encoded))).Header.Operation,
            "journal wait uses bounded authenticated binary envelope");

        var signals = cursors.Select(_ => new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously)).ToArray();
        var started = 0; var retired = 0;
        async Task Wait(ReaderJournalWaitCursor cursor, CancellationToken token) {
            Interlocked.Increment(ref started);
            try { await signals[Array.IndexOf(cursors, cursor)].Task.WaitAsync(token); }
            finally { await Task.Delay(3); Interlocked.Increment(ref retired); }
        }
        var waiting = ReaderJournalWaitCoordinator.WaitAsync(request, Wait, CancellationToken.None);
        signals[1].SetResult(); var changed = await waiting;
        TestAssert.Equal(cursors[1].VolumeId, changed.ChangedVolumes.Single(), "first changed drive wakes the shared wait");
        TestAssert.Equal(3, retired, "wake does not return until every other wait has retired");
        started = retired = 0;
        var timeout = await ReaderJournalWaitCoordinator.WaitAsync(request with { WaitMilliseconds = 10 },
            async (_, token) => { Interlocked.Increment(ref started); try { await Task.Delay(10000, token); }
                finally { await Task.Delay(3); Interlocked.Increment(ref retired); } }, CancellationToken.None);
        TestAssert.True(timeout.TimedOut, "native request deadline yields no event"); TestAssert.Equal(3, retired, "deadline awaits native retirement");
        using var cancellation = new CancellationTokenSource(); started = retired = 0;
        var cancelled = ReaderJournalWaitCoordinator.WaitAsync(request, async (_, token) => {
            Interlocked.Increment(ref started); try { await Task.Delay(10000, token); } finally { Interlocked.Increment(ref retired); }
        }, cancellation.Token);
        cancellation.Cancel();
        await TestAssert.ThrowsAsync<OperationCanceledException>(() => cancelled, "user cancellation propagates");
        TestAssert.Equal(3, retired, "user cancellation awaits all native waits");
        var starts = 0; var firstRetired = false;
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => ReaderJournalWaitCoordinator.WaitAsync(request, async (_, token) => {
            if (++starts == 2) throw new InvalidOperationException("fixture-start-failed");
            try { await Task.Delay(10000, token); } finally { firstRetired = true; }
        }, CancellationToken.None), "failed wait startup retires previously started operations");
        TestAssert.True(firstRetired, "native startup failure cannot leak an earlier wait");
        starts = 0; firstRetired = false;
        async Task RetireFirst(CancellationToken token) {
            try { await Task.Delay(10000, token); } finally { firstRetired = true; }
        }
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => ReaderJournalWaitCoordinator.WaitAsync(request, (_, token) => {
            if (++starts == 2) throw new InvalidOperationException("fixture-synchronous-start-failed");
            return RetireFirst(token);
        }, CancellationToken.None), "synchronous native startup error also retires already submitted waits");
        TestAssert.True(firstRetired, "synchronous startup error cannot leak the first operation");
        starts = 0;
        await TestAssert.ThrowsAsync<ReaderProtocolException>(() => ReaderJournalWaitCoordinator.WaitAsync(request with { WaitMilliseconds = 0 },
            (_, _) => { starts++; return Task.CompletedTask; }, CancellationToken.None), "invalid wait rejected before native startup");
        TestAssert.Equal(0, starts, "invalid wait never opens native handles");
        // Exercise the exact service wait/next-frame join without elevation or
        // volume access. All native operations here are owned synthetic waits.
        async Task<ReaderJournalWaitResponse> Blocked(CancellationToken token) {
            try { await Task.Delay(10000, token); return new([], true); }
            finally { await Task.Delay(3); Interlocked.Increment(ref retired); }
        }
        var frame = ReaderFrame.RequestV2(ReaderOperation.JournalWaitAny, 10, encoded);
        using (var channelLifetime = new CancellationTokenSource()) {
            retired = 0;
            var cancelFrame = ReaderFrameCodec.Decode(ReaderFrameCodec.Encode(ReaderFrame.RequestV2(ReaderOperation.Cancel, 11,
                ReaderPayloadCodec.EncodeCancelRequest(new(10)))));
            var joined = await ReaderJournalWaitChannel.CompleteAsync(frame, Blocked(channelLifetime.Token), Task.FromResult(cancelFrame), channelLifetime);
            TestAssert.Equal(cancelFrame, joined.Cancellation, "authenticated cancel frame joins the current native wait");
            TestAssert.Equal(1, retired, "cancel acknowledgment follows owned wait retirement");
        }
        using (var disconnectLifetime = new CancellationTokenSource()) {
            retired = 0;
            await TestAssert.ThrowsAsync<ReaderProtocolException>(() => ReaderJournalWaitChannel.CompleteAsync(frame,
                Blocked(disconnectLifetime.Token), Task.FromException<ReaderFrame>(new ReaderProtocolException("truncated-header")), disconnectLifetime),
                "pipe disconnect aborts wait without waiting for request timeout");
            TestAssert.Equal(1, retired, "disconnect awaits owned wait retirement");
        }
        using (var wrongCancelLifetime = new CancellationTokenSource()) {
            var wrong = ReaderFrame.RequestV2(ReaderOperation.Cancel, 11, ReaderPayloadCodec.EncodeCancelRequest(new(9)));
            await TestAssert.ThrowsAsync<ReaderProtocolException>(() => ReaderJournalWaitChannel.CompleteAsync(frame,
                Blocked(wrongCancelLifetime.Token), Task.FromResult(wrong), wrongCancelLifetime), "cancel cannot target an unrelated request");
        }
        using (var wakeLifetime = new CancellationTokenSource()) {
            var nextFrame = new TaskCompletionSource<ReaderFrame>(TaskCreationOptions.RunContinuationsAsynchronously);
            var result = await ReaderJournalWaitChannel.CompleteAsync(frame, Task.FromResult(new ReaderJournalWaitResponse([cursors[0].VolumeId], false)),
                nextFrame.Task, wakeLifetime);
            TestAssert.Equal(cursors[0].VolumeId, result.Response!.ChangedVolumes.Single(), "normal wake retains the next-frame task for the service loop");
            TestAssert.False(nextFrame.Task.IsCompleted, "normal wake cannot consume a later operation");
            nextFrame.SetResult(ReaderFrame.RequestV2(ReaderOperation.Status, 11, ReadOnlyMemory<byte>.Empty));
            TestAssert.Equal(ReaderOperation.Status, (await nextFrame.Task).Header.Operation, "service can receive its next normal operation");
        }
        using var alreadyCancelled = new CancellationTokenSource(); alreadyCancelled.Cancel();
        await TestAssert.ThrowsAsync<OperationCanceledException>(() => ReaderJournalWaitIo.WaitAsync('C', 42, 0, alreadyCancelled.Token),
            "pre-cancelled native wait must not open a volume");
    }
}
