using Cap7CE.Core.Reader.Host;

namespace Cap7CE.Core.Tests;

internal static class ReaderConnectionLifetimeTests
{
    public static void Run()
    {
        var clock = new Clock();
        using (var pending = new ReaderConnectionLifetime(default, TimeSpan.FromMinutes(30), clock)) {
            TestAssert.Equal(TimeSpan.FromMinutes(30), clock.Last!.Due, "configured admission wait");
            TestAssert.Equal(Timeout.InfiniteTimeSpan, clock.Last.Period, "no periodic idle timer");
            clock.Last.Fire(); TestAssert.True(pending.Token.IsCancellationRequested, "untrusted admission expires");
            var rejected = false; try { pending.Authenticate(); } catch (OperationCanceledException) { rejected = true; }
            TestAssert.True(rejected, "expired admission cannot authenticate");
        }
        using var stop = new CancellationTokenSource();
        using (var admitted = new ReaderConnectionLifetime(stop.Token, TimeSpan.FromMinutes(30), clock)) {
            var oldTimer = clock.Last!; admitted.Authenticate();
            oldTimer.Fire(); // Also exercise a callback already queued when admission completed.
            TestAssert.False(admitted.Token.IsCancellationRequested, "a healthy authenticated Reader must survive the old absolute deadline");
            TestAssert.True(oldTimer.Disposed, "authentication retires the one-shot admission timer");
            stop.Cancel(); TestAssert.True(admitted.Token.IsCancellationRequested, "SCM stop still cancels an authenticated session");
        }
        var retired = new ReaderConnectionLifetime(default, TimeSpan.FromSeconds(2), clock);var callback = clock.Last!;
        retired.Dispose();retired.Dispose();callback.Fire();TestAssert.True(callback.Disposed, "disposal retires admission");
        Console.WriteLine("Reader connection lifetime: bounded admission, expired-auth rejection, authenticated deadline retirement, queued timer races, SCM cancellation and timer disposal passed.");
    }
    private sealed class Clock : TimeProvider
    {
        public Timer? Last;
        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period) => Last = new Timer(callback, state, dueTime, period);
    }
    private sealed class Timer(TimerCallback callback, object? state, TimeSpan due, TimeSpan period) : ITimer
    {
        public TimeSpan Due { get; } = due;
        public TimeSpan Period { get; } = period;
        public bool Disposed { get; private set; }
        public void Fire() => callback(state);
        public bool Change(TimeSpan dueTime, TimeSpan nextPeriod) => !Disposed;
        public void Dispose() => Disposed = true;
        public ValueTask DisposeAsync() { Dispose(); return ValueTask.CompletedTask; }
    }
}
