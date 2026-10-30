namespace Cap7CE.WinUI.Services;

// UI-thread owner. Foreground changes gate starts only; they never cancel work.
internal sealed class HealthCheckSchedule(DateTimeOffset? lastCheck)
{
    public static readonly TimeSpan Period = TimeSpan.FromDays(7);
    private DateTimeOffset? completed = lastCheck;
    private bool running;
    public TimeSpan? Delay(DateTimeOffset now, bool eligible)
    {
        if (!eligible || running) return null;
        var remaining = completed is {} date ? date + Period - now : TimeSpan.Zero;
        return remaining > TimeSpan.Zero ? remaining : TimeSpan.Zero;
    }
    public bool TryStart(DateTimeOffset now, bool eligible)
    {
        if (Delay(now, eligible) != TimeSpan.Zero) return false;
        running = true; return true;
    }
    public void Complete(DateTimeOffset now) { completed = now; running = false; }
}
