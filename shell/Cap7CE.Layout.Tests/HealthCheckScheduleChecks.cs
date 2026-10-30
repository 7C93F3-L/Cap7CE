using Cap7CE.WinUI.Services;
internal static class HealthCheckScheduleChecks
{
    public static void Run()
    {
        var now = DateTimeOffset.UtcNow;
        var schedule = new HealthCheckSchedule(null);
        if (schedule.TryStart(now, false) || schedule.Delay(now, false) is not null) throw new Exception("Foreground started health check");
        if (!schedule.TryStart(now, true)) throw new Exception("First background check did not start");
        if (schedule.TryStart(now, true) || schedule.Delay(now, false) is not null || schedule.TryStart(now, true)) throw new Exception("Running check repeated or foreground transition reset it");
        schedule.Complete(now);
        if (schedule.TryStart(now.AddDays(6), true)) throw new Exception("Check started before due");
        if (schedule.Delay(now.AddDays(6), true) != TimeSpan.FromDays(1)) throw new Exception("Due timer wrong");
        var restored = new HealthCheckSchedule(now);
        if (restored.TryStart(now.AddDays(7), false) || !restored.TryStart(now.AddDays(7), true)) throw new Exception("Restored due gate wrong");
        Console.WriteLine("Health schedule passed: first run, foreground gate, no overlap, foreground return, seven-day due and restart.");
    }
}
