using Cap7CE.Core.Host.CatalogMaintenance;

namespace Cap7CE.Core.Tests;

internal static class CatalogReaderOwnershipTests
{
    private static TaskCompletionSource NewSignal() => new(TaskCreationOptions.RunContinuationsAsynchronously);
    public static async Task RunAsync()
    {
        await using var ownership = new CatalogReaderOwnership();
        var started = NewSignal(); var retiring = NewSignal(); var retired = NewSignal(); var allowRetirement = NewSignal();
        var restarted = NewSignal(); var monitorCount = 0; var readers = 0; var maxReaders = 0;
        await ownership.ActivateAsync(async token => {
            var active = Interlocked.Increment(ref readers); maxReaders = Math.Max(maxReaders, active);
            var count = Interlocked.Increment(ref monitorCount);
            if (count == 1) started.TrySetResult(); else restarted.TrySetResult();
            try { await Task.Delay(Timeout.Infinite, token); }
            finally {
                if (count == 1) {
                    retiring.TrySetResult(); await allowRetirement.Task;
                }
                Interlocked.Decrement(ref readers); retired.TrySetResult();
            }
        });
        await started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var manualEntered = NewSignal(); var releaseManual = NewSignal();
        var manual = ownership.RunExclusiveAsync(async token => {
            TestAssert.True(retired.Task.IsCompleted, "explicit Reader work starts only after monitor and session retire");
            var active = Interlocked.Increment(ref readers); maxReaders = Math.Max(maxReaders, active);
            manualEntered.TrySetResult();
            try { await releaseManual.Task.WaitAsync(token); return 42; }
            finally { Interlocked.Decrement(ref readers); }
        });
        await retiring.Task.WaitAsync(TimeSpan.FromSeconds(5));
        TestAssert.False(manualEntered.Task.IsCompleted, "cancel request alone cannot hand off an active Reader lease");
        allowRetirement.TrySetResult(); await manualEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var nextEntered = NewSignal();
        var next = ownership.RunExclusiveAsync(token => { nextEntered.TrySetResult(); return Task.FromResult(99); });
        TestAssert.False(nextEntered.Task.IsCompleted, "concurrent explicit operations remain serialized");
        releaseManual.TrySetResult(); TestAssert.Equal(42, await manual, "manual result preserved");
        TestAssert.Equal(99, await next, "queued manual operation completes");
        await restarted.Task.WaitAsync(TimeSpan.FromSeconds(5));
        TestAssert.Equal(1, maxReaders, "monitor and manual callbacks never overlap Reader ownership");
        var activeManual = NewSignal();
        var interrupted = ownership.RunExclusiveAsync(async token => {
            activeManual.TrySetResult(); await Task.Delay(Timeout.Infinite, token); return 0;
        });
        await activeManual.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await ownership.ShutdownAsync();
        await TestAssert.ThrowsAsync<OperationCanceledException>(() => interrupted, "shutdown cancels explicit work before waiting for ownership retirement");
        var finalMonitorCount = monitorCount;
        await ownership.ShutdownAsync(); TestAssert.Equal(finalMonitorCount, monitorCount, "repeated shutdown does not restart monitor");
        await TestAssert.ThrowsAsync<OperationCanceledException>(() => ownership.RunExclusiveAsync(token => Task.FromResult(1)), "stopped owner cannot issue new Reader work");

        await using var failed = new CatalogReaderOwnership(); var failedRuns = 0;
        await failed.ActivateAsync(token => { Interlocked.Increment(ref failedRuns); throw new NotSupportedException(); });
        // Joining the monitor via the next explicit lease observes its error;
        // that meaningful operation permits exactly one new monitor attempt.
        TestAssert.Equal(1, await failed.RunExclusiveAsync(token => Task.FromResult(1)), "unsupported monitor does not poison explicit base browsing");
        await failed.ShutdownAsync();
        TestAssert.True(failedRuns <= 2, "unsupported capability never causes an autonomous retry loop");
    }
}
