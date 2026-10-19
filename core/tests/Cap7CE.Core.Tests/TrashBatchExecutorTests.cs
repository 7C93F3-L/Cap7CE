using Cap7CE.Core.FileOperations;

namespace Cap7CE.Core.Tests;

internal static class TrashBatchExecutorTests
{
    public static async Task RunAsync()
    {
        if (!OperatingSystem.IsWindows()) return;
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-trash-policy-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try {
            var folder = Path.Combine(root, "folder"); Directory.CreateDirectory(folder);
            var child = Path.Combine(folder, "nested.txt"); var a = Path.Combine(root, "一.txt"); var b = Path.Combine(root, "二.txt");
            foreach (var file in new[] { a, b, child }) await File.WriteAllTextAsync(file, "owned fixture");
            var clock = new Clock(); var calls = new List<string>(); var gaps = new List<TimeSpan>();
            var executor = new TrashBatchExecutor(path => { calls.Add(path); return new("deleted"); }, clock,
                time => { gaps.Add(time); clock.Advance(time); return Task.CompletedTask; });
            await executor.RunAsync([new(a, false)], [], false);
            await executor.RunAsync([new(b, false)], [], false);
            TestAssert.Equal(1, gaps.Count, "first operation has no wait; later requests share the Core cooldown");
            TestAssert.Equal(TimeSpan.FromMilliseconds(250), gaps[0], "250ms gap survives request boundaries");
            calls.Clear();
            var batch = await executor.RunAsync([new(child, false), new(folder, true), new(a, false), new(a.ToUpperInvariant(), false)], [], true);
            TestAssert.True(batch.Success && batch.TotalCount == 3 && batch.DeletedPaths.Count == 3, "catalog deduplicates paths and retains child outcomes");
            TestAssert.Equal(2, calls.Count, "successfully recycled parent suppresses a second child action");
            TestAssert.True(batch.DeletedPaths.Contains(a.ToUpperInvariant(), StringComparer.Ordinal), "duplicate path retains the last item's spelling");
            TestAssert.False(calls.Contains(child), "nested item is only covered after parent success");
            calls.Clear();
            var cache = Path.Combine(root, "cache"); Directory.CreateDirectory(cache); var cached = Path.Combine(cache, "preview"); await File.WriteAllTextAsync(cached, "preserve");
            var blocked = await executor.RunAsync([new(Path.GetPathRoot(root)!, true), new(cached, false), new(folder, false), new(Path.Combine(root, "missing"), false)], [cache], true);
            TestAssert.True(!blocked.Success && blocked.FailedItems.Count == 4 && blocked.DeletedPaths.Count == 0, "root/cache/type/missing checks remain per-item failures");
            TestAssert.Equal(0, calls.Count, "rejected sources never reach physical backend");
            var parentAttempts = 0; calls.Clear();
            var partial = new TrashBatchExecutor(path => { calls.Add(path); if (path == folder) { parentAttempts++; return new("failed", Error: -2147024891); } return new("deleted"); }, clock,
                time => { clock.Advance(time); return Task.CompletedTask; });
            var failures = await partial.RunAsync([new(folder, true), new(child, false)], [], true);
            TestAssert.True(!failures.Success && failures.FailedItems.Count == 1 && failures.DeletedPaths.SequenceEqual([child]),
                "failed parent does not cover a child's independent outcome");
            TestAssert.Equal(2, parentAttempts, "physical failures receive exactly two attempts");
            var attempts = 0;
            var retry = new TrashBatchExecutor(_ => ++attempts == 1 ? new("failed", Error: -2147467260) : new("deleted"), clock,
                time => { clock.Advance(time); return Task.CompletedTask; });
            TestAssert.True((await retry.RunAsync([new(a, false)], [], false)).Success && attempts == 2,
                "an isolated first failure can recover on the existing second attempt");
            var junction = Path.Combine(root, "junction");
            var start = new System.Diagnostics.ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "cmd.exe")) {
                UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            foreach (var argument in new[] { "/c", "mklink", "/J", junction, folder }) start.ArgumentList.Add(argument);
            using (var process = System.Diagnostics.Process.Start(start)!) { await process.WaitForExitAsync(); TestAssert.Equal(0, process.ExitCode, "owned junction fixture is created without elevation"); }
            calls.Clear();
            var strict = await executor.RunAsync([new(junction, true)], [], true);
            TestAssert.Equal("target-changed", strict.FailedItems.Single().Code, "catalog rejects direct junctions as before");
            TestAssert.Equal(0, calls.Count, "rejected junction cannot reach backend");
            TestAssert.True((await executor.RunAsync([new(junction, true)], [], false)).Success, "legacy stat behavior follows junction target kind");
            TestAssert.True(await File.ReadAllTextAsync(cached) == "preserve" && Directory.Exists(folder), "fake backend policy tests leave original bytes and directories intact");
            Console.WriteLine("Core trash policy: last-item dedup, ordered nesting, protected/type/missing checks, two attempts and cross-request 250ms cooldown passed.");
        } finally {
            var link = Path.Combine(root, "junction");
            if (Directory.Exists(link)) Directory.Delete(link);
            Directory.Delete(root, recursive: true);
        }
    }
    private sealed class Clock : TimeProvider
    {
        private long timestamp;
        public override long TimestampFrequency => 1000;
        public override long GetTimestamp() => timestamp;
        public void Advance(TimeSpan span) => timestamp += (long)Math.Ceiling(span.TotalMilliseconds);
    }
}
