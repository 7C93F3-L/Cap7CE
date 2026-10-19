using System.Text.Json;
using System.Text.Json.Nodes;
using Cap7CE.Core.Host.MetadataBuild;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Host.MetadataScheduling;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Tests;

internal static class MetadataDirectoryCoordinatorTests
{
    private static MetadataDirectoryBuildRequest Request(string path = "X:\\Assets") => new(path, true);
    private static async Task UntilAsync(Func<Task<bool>> condition)
    {
        for (var step = 0; step < 1500; step++) { if (await condition()) return; await Task.Delay(2); }
        throw new InvalidOperationException("directory coordinator test timed out");
    }
    public static async Task RunAsync()
    {
        var fixture = new MetadataDirectoryFixture(); var owner = fixture.Create();
        TestAssert.Equal("idle", (await owner.ReadAsync()).Progress.Phase, "status reads no source");
        await Task.WhenAll(owner.StartDirectoryAsync(Request()), owner.StartDirectoryAsync(Request("x:/Assets/")));
        await UntilAsync(async () => (await owner.ReadAsync()).DirectoryTask?.Pending == 0);
        TestAssert.Equal("inside,nested", string.Join(',', fixture.Finished), "only directory and recursive descendants execute");
        TestAssert.Equal(1, fixture.Configurations, "duplicate paths coalesce"); TestAssert.True(fixture.SavedGlobal is null, "directory grant does not create global policy");
        await owner.StartDirectoryAsync(Request()); await UntilAsync(async () => (await owner.ReadAsync()).DirectoryTask?.Pending == 0);
        TestAssert.Equal(2, fixture.Reads, "valid facts skip repeated directory reading");
        await owner.StartAsync(new(true, MetadataDirectoryFixture.GlobalPolicy)); await UntilAsync(() => Task.FromResult(fixture.Finished.Length == 3)); await owner.ShutdownAsync();
        fixture = new() { BlockGlobal = true }; owner = fixture.Create(); await owner.StartAsync(new(true, MetadataDirectoryFixture.GlobalPolicy));
        await UntilAsync(() => Task.FromResult(fixture.Reads > 0)); await owner.StartDirectoryAsync(Request());
        await UntilAsync(() => Task.FromResult(fixture.Finished.Length == 2)); TestAssert.Equal("inside,nested", string.Join(',', fixture.Finished), "directory preempts global work");
        fixture.BlockGlobal = false; await UntilAsync(() => Task.FromResult(fixture.Finished.Length == 3));
        TestAssert.Equal(1, fixture.MaximumLive, "borrowed session has one active reader");
        TestAssert.True(fixture.SavedGlobal!.Value.GetProperty("policy").GetProperty("includes")[0].GetProperty("rootFileReference").ValueKind == JsonValueKind.Null, "global scope is not replaced"); await owner.ShutdownAsync();
        fixture = new() { Building = true }; owner = fixture.Create(); await owner.StartDirectoryAsync(Request());
        await UntilAsync(async () => (await owner.ReadAsync()).Progress.Phase == "waiting"); TestAssert.Equal(0, fixture.Configurations, "base preparation never widens directory grant");
        await owner.PauseAsync(); await owner.ShutdownAsync(); TestAssert.Equal("paused", fixture.SavedDirectory!.Value.GetProperty("intent").GetString(), "manual pause persisted");
        var resumed = fixture.Create(); await resumed.RestoreAsync(); TestAssert.Equal("paused", (await resumed.ReadAsync()).Progress.Phase, "paused queue does not run after restart");
        fixture.Building = false; await resumed.ResumeAsync(); await UntilAsync(() => Task.FromResult(fixture.Finished.Length == 2)); await resumed.ShutdownAsync();
        fixture = new() { BlockAll = true }; owner = fixture.Create(); await owner.StartDirectoryAsync(Request());
        await UntilAsync(() => Task.FromResult(fixture.Reads == 1)); await owner.ShutdownAsync();
        TestAssert.Equal("active", fixture.SavedDirectory!.Value.GetProperty("intent").GetString(), "exit preserves active queue intention");
        fixture.BlockAll = false; resumed = fixture.Create(); await resumed.RestoreAsync(); await UntilAsync(() => Task.FromResult(fixture.Finished.Length == 2)); await resumed.ShutdownAsync();
        fixture = new() { BlockAll = true }; owner = fixture.Create(); await owner.StartDirectoryAsync(Request());
        await UntilAsync(() => Task.FromResult(fixture.Reads == 1)); await owner.PauseAsync(); fixture.Changed = true; fixture.BlockAll = false; await owner.ResumeAsync();
        await UntilAsync(async () => (await owner.ReadAsync()).Progress.Phase == "failed");
        TestAssert.Equal("metadata-directory-changed", (await owner.ReadAsync()).Progress.ErrorCode, "recreated directory rejected");
        TestAssert.Equal(0, fixture.Finished.Length, "rebound scope never reaches reader"); await owner.CancelDirectoriesAsync(); await owner.ShutdownAsync();
        fixture = new() { Building = true }; owner = fixture.Create();
        for (var index = 0; index < 32; index++) await owner.StartDirectoryAsync(Request("X:\\Folder" + index));
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => owner.StartDirectoryAsync(Request("X:\\Overflow")), "queue bound");
        TestAssert.Equal(32, (await owner.ReadAsync()).DirectoryTask!.Pending, "all bounded jobs retained"); await owner.CancelDirectoriesAsync();
        TestAssert.Equal(0, fixture.Configurations, "cancel before base ready reads no content"); await owner.ShutdownAsync();
        fixture = new(); var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fixture.ResolveGate = _ => { entered.TrySetResult(); return release.Task; }; owner = fixture.Create();
        var late = owner.StartDirectoryAsync(Request()); await entered.Task.WaitAsync(TimeSpan.FromSeconds(3)); await owner.PauseAsync(); release.SetResult();
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => late, "pause revokes a pending admission"); TestAssert.Equal(0, fixture.Configurations, "late resolve does not grant content"); await owner.ShutdownAsync();
        fixture = new(); fixture.SaveGlobal("paused"); var savedGlobal = fixture.SavedGlobal!.Value.GetRawText(); owner = fixture.Create();
        await owner.StartDirectoryAsync(Request()); await UntilAsync(async () => (await owner.ReadAsync()).DirectoryTask is null);
        TestAssert.Equal("paused", (await owner.ReadAsync()).Progress.Phase, "previous global pause restored after directory completion");
        TestAssert.Equal(savedGlobal, fixture.SavedGlobal!.Value.GetRawText(), "temporary task never overwrites global settings"); await owner.ShutdownAsync();
        fixture = new() { FailDirectoryWrites = true }; owner = fixture.Create();
        await TestAssert.ThrowsAsync<MetadataDirectoryStateException>(() => owner.StartDirectoryAsync(Request()), "failed durable grant rejects start");
        await owner.RestoreAsync(); TestAssert.Equal(0, fixture.Configurations, "failed queue save cannot activate executor");
        var failure = (await owner.ReadAsync()).Progress.StorageError!; TestAssert.Equal("ENOSPC", failure.Code, "bounded storage cause");
        fixture.FailDirectoryWrites = false; await owner.CancelDirectoriesAsync(); await owner.ShutdownAsync();
        fixture = new() { BlockDirectoryWrite = new(TaskCreationOptions.RunContinuationsAsynchronously) }; owner = fixture.Create();
        var first = owner.StartDirectoryAsync(Request()); await fixture.DirectoryWriteEntered.Task.WaitAsync(TimeSpan.FromSeconds(3));
        var second = owner.StartDirectoryAsync(Request("X:\\Other")); fixture.BlockDirectoryWrite.SetResult(); await Task.WhenAll(first, second);
        await UntilAsync(() => Task.FromResult(fixture.Finished.Length == 3)); TestAssert.Equal(1, fixture.MaximumLive, "concurrent admissions retain a single reader"); await owner.ShutdownAsync();
        fixture = new() { Building = true };
        fixture.SavedDirectory = CoreProtocolJson.ToElement(new { version = 1, intent = "active", future = "保留", jobs = new[] { new { path = "X:\\Assets", futureJob = true } } });
        owner = fixture.Create(); await owner.RestoreAsync(); await UntilAsync(async () => (await owner.ReadAsync()).Progress.Phase == "waiting"); await owner.PauseAsync(); await owner.ShutdownAsync();
        TestAssert.Equal("保留", fixture.SavedDirectory!.Value.GetProperty("future").GetString(), "unknown queue fields retained");
        TestAssert.True(fixture.SavedDirectory.Value.GetProperty("jobs")[0].GetProperty("futureJob").GetBoolean(), "unknown job fields retained");
        fixture = new() { SavedDirectory = JsonSerializer.SerializeToElement(new { version = 99, jobs = Array.Empty<object>() }) }; owner = fixture.Create();
        await TestAssert.ThrowsAsync<MetadataDirectoryStateException>(() => owner.ReadAsync(), "bad queue fails closed"); TestAssert.Equal(0, fixture.Configurations, "bad queue never configures");
        await TestAssert.ThrowsAsync<MetadataDirectoryStateException>(() => owner.ShutdownAsync(), "bad queue survives shutdown unchanged");
        fixture = new(); fixture.SaveGlobal("paused"); savedGlobal = fixture.SavedGlobal!.Value.GetRawText(); owner = fixture.Create();
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => owner.StartAllVolumesAsync(false), "whole-volume action requires explicit consent");
        await owner.StartDirectoryAsync(Request()); await UntilAsync(() => Task.FromResult(fixture.Finished.Length == 2));
        await owner.StartAllVolumesAsync(true); await UntilAsync(() => Task.FromResult(fixture.Finished.Length == 3));
        TestAssert.Equal(3, fixture.Reads, "whole volume only extracts the remaining file");
        TestAssert.Equal(savedGlobal, fixture.SavedGlobal!.Value.GetRawText(), "whole-volume quick action preserves saved global settings"); await owner.ShutdownAsync();
        fixture = new() { DisplayName = "network share" }; owner = fixture.Create();
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => owner.StartAllVolumesAsync(true), "unsupported display name cannot become a source path");
        TestAssert.Equal(0, fixture.Configurations, "invalid whole-volume request never reaches extraction"); await owner.ShutdownAsync();
        fixture = new() { Building = true }; owner = fixture.Create();
        for (var index = 0; index < 32; index++) await owner.StartDirectoryAsync(Request("X:\\Bound" + index));
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => owner.StartAllVolumesAsync(true), "whole-volume admission respects the shared queue limit");
        TestAssert.Equal(32, (await owner.ReadAsync()).DirectoryTask!.Pending, "rejected batch preserves existing queue"); await owner.CancelDirectoriesAsync(); await owner.ShutdownAsync();
        Console.WriteLine("Core directory metadata: scoped recursive work, global borrowing, duplicates, pause/restart, waiting, identity change, bounded admission, write failure/order and legacy field retention passed.");
    }
}
