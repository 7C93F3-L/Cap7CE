using Cap7CE.Core.Reader.Host;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Tests;

internal static class ReaderSnapshotFactsTests
{
    private static ReaderMftRecord[] Records(int count) => Enumerable.Range(1, count)
        .Select(index => new ReaderMftRecord((ulong)index, 5, 0, 0, 32, index % 2 == 0, $"item{index}", "")).ToArray();

    public static async Task RunAsync()
    {
        await BoundedOrderedResultsAsync();
        await CancellationJoinsWorkersAsync();
        await FailureJoinsWorkersAsync();
        using (var bothFailed = new CountdownEvent(2))
        {
            await TestAssert.ThrowsAsync<OutOfMemoryException>(() => Task.Run(() =>
                ReaderSnapshotFacts.Read(Records(2), (reference, _) =>
                {
                    bothFailed.Signal();
                    TestAssert.True(bothFailed.Wait(TimeSpan.FromSeconds(10)), "both failure paths have entered");
                    if (reference == 1) throw new IOException("synthetic ordinary failure");
                    throw new OutOfMemoryException("synthetic fatal failure");
                }, default)), "a concurrent ordinary error must not hide fatal memory exhaustion");
        }
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        var calls = 0;
        await TestAssert.ThrowsAsync<OperationCanceledException>(() => Task.Run(() =>
            ReaderSnapshotFacts.Read(Records(1), (_, _) => { calls++; return null; }, cancelled.Token)),
            "pre-cancelled pages do not start native reads");
        TestAssert.Equal(0, calls, "cancel before dispatch does no IO");
        await TestAssert.ThrowsAsync<ArgumentOutOfRangeException>(() => Task.Run(() =>
            ReaderSnapshotFacts.Read(Records(ReaderProtocol.MaximumRecordsPerPage + 1), (_, _) => { calls++; return null; }, default)),
            "page limit is checked before allocating or dispatching facts");
        TestAssert.Equal(0, calls, "oversized pages do no IO");
        TestAssert.Equal(0, ReaderSnapshotFacts.Read([], (_, _) => throw new Exception("unexpected read"), default).Length,
            "an empty terminal page does not dispatch work");
        await TestAssert.ThrowsAsync<OutOfMemoryException>(() => Task.Run(() =>
            ReaderSnapshotFacts.Read(Records(1), (_, _) => throw new OutOfMemoryException("synthetic failure"), default)),
            "parallel execution must preserve the fatal-memory exception boundary");
    }

    private static async Task BoundedOrderedResultsAsync()
    {
        var records = Records(16);
        var expected = records.Select(record => record.FileReference == 3 ? null :
            new ReaderBasicFacts(record.FileReference * 10, 1, 2, 32, record.FileReference == 5 ? 2u : 1u)).ToArray();
        using var firstTwo = new CountdownEvent(2);
        var active = 0; var peak = 0; var calls = 0; var seen = new int[records.Length];
        var actual = await Task.Run(() => ReaderSnapshotFacts.Read(records, (reference, directory) =>
        {
            var running = Interlocked.Increment(ref active);
            int old;
            do { old = Volatile.Read(ref peak); if (old >= running) break; }
            while (Interlocked.CompareExchange(ref peak, running, old) != old);
            try
            {
                if (Interlocked.Increment(ref calls) <= 2)
                {
                    firstTwo.Signal();
                    TestAssert.True(firstTwo.Wait(TimeSpan.FromSeconds(10)), "two reads can overlap");
                }
                var index = checked((int)reference - 1);
                TestAssert.Equal(records[index].IsDirectory, directory, "directory open flags keep their source record");
                Interlocked.Increment(ref seen[index]);
                return expected[index];
            }
            finally { Interlocked.Decrement(ref active); }
        }, default));
        TestAssert.Equal(2, peak, "at most two native attribute handles may be in flight");
        TestAssert.Equal(0, active, "all reads finish before cache/output consumption");
        TestAssert.True(seen.All(count => count == 1), "each physical record is read exactly once");
        TestAssert.True(actual.SequenceEqual(expected), "source order, unavailable facts and link counts are preserved");
    }

    private static async Task CancellationJoinsWorkersAsync()
    {
        using var entered = new CountdownEvent(2);
        using var release = new ManualResetEventSlim();
        using var cancel = new CancellationTokenSource();
        var active = 0; var calls = 0;
        var work = Task.Run(() => ReaderSnapshotFacts.Read(Records(32), (_, _) =>
        {
            Interlocked.Increment(ref calls); Interlocked.Increment(ref active); entered.Signal();
            try { TestAssert.True(release.Wait(TimeSpan.FromSeconds(10)), "test releases in-flight handles"); return null; }
            finally { Interlocked.Decrement(ref active); }
        }, cancel.Token));
        try
        {
            TestAssert.True(entered.Wait(TimeSpan.FromSeconds(10)), "both native reads entered before cancellation");
            cancel.Cancel(); await Task.Delay(30);
            TestAssert.False(work.IsCompleted, "cancellation cannot abandon in-flight handle owners");
        }
        finally { release.Set(); }
        await TestAssert.ThrowsAsync<OperationCanceledException>(async () => await work,
            "cancelled page never returns a partially populated fact array");
        TestAssert.Equal(0, active, "cancellation joins all handle owners");
        TestAssert.Equal(2, calls, "cancellation prevents the remaining native reads");
    }

    private static async Task FailureJoinsWorkersAsync()
    {
        using var entered = new CountdownEvent(2);
        using var release = new ManualResetEventSlim();
        using var failed = new ManualResetEventSlim();
        var active = 0; var calls = 0;
        var work = Task.Run(() => ReaderSnapshotFacts.Read(Records(2), (_, _) =>
        {
            Interlocked.Increment(ref active); var first = Interlocked.Increment(ref calls) == 1;
            try
            {
                entered.Signal(); TestAssert.True(entered.Wait(TimeSpan.FromSeconds(10)), "both failure-case readers entered");
                if (first) { failed.Set(); throw new IOException("synthetic native failure"); }
                TestAssert.True(release.Wait(TimeSpan.FromSeconds(10)), "test releases the other handle"); return null;
            }
            finally { Interlocked.Decrement(ref active); }
        }, default));
        try
        {
            TestAssert.True(failed.Wait(TimeSpan.FromSeconds(10)), "one reader fails while another owns a handle");
            TestAssert.False(work.IsCompleted, "failure cannot return before another read is closed");
        }
        finally { release.Set(); }
        await TestAssert.ThrowsAsync<IOException>(async () => await work,
            "native failure classification survives parallel execution");
        TestAssert.Equal(0, active, "failure joins remaining handle owners");
    }
}
