using Cap7CE.Core.Reader.Host;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Tests;

internal static class ReaderJournalStartupDeadlineTests
{
    public static async Task RunAsync()
    {
        ReaderJournalWaitCursor[] cursors = [new(new(1, 2), 42, 100), new(new(3, 4), 43, 200)];
        var request = new ReaderJournalWaitRequest(cursors, 1);
        var started = 0; var retired = false;
        async Task RetireAsync(CancellationToken token)
        {
            try { await Task.Delay(Timeout.Infinite, token); }
            finally { retired = true; }
        }
        Task Start(ReaderJournalWaitCursor _, CancellationToken token)
        {
            if (started > 0) token.ThrowIfCancellationRequested();
            started++;
            var pending = RetireAsync(token);
            // Hold startup until the real request deadline has expired, so the
            // next volume throws synchronously as ReaderNtfsVolume does.
            TestAssert.True(token.WaitHandle.WaitOne(TimeSpan.FromSeconds(2)), "startup observes its bounded deadline");
            return pending;
        }
        var result = await ReaderJournalWaitCoordinator.WaitAsync(request, Start, CancellationToken.None);
        TestAssert.True(result.TimedOut, "deadline during multi-volume startup is a normal timeout");
        TestAssert.Equal(1, started, "expired startup cannot submit another native operation");
        TestAssert.True(retired, "startup timeout awaits every accepted native operation");

        using var caller = new CancellationTokenSource();
        await TestAssert.ThrowsAsync<OperationCanceledException>(() => ReaderJournalWaitCoordinator.WaitAsync(
            request with { WaitMilliseconds = 30000 }, (_, token) => {
                caller.Cancel(); token.ThrowIfCancellationRequested(); return Task.CompletedTask;
            }, caller.Token), "caller cancellation during startup is not converted to a timeout");
    }
}
