using System.Text.Json;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataBuild;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Host.MetadataScheduling;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Tests;

internal static class MetadataGlobalBuildTests
{
    private static readonly string Volume = MetadataSweepFixture.Volumes[0], Folder = new('1', 16);
    private static readonly FileFactQueuePolicy Scoped = new([Volume], [new(Volume, Folder)], []);
    private sealed class Fixture(string? intent = null, FileFactQueuePolicy? policy = null, int perKind = 4)
    {
        internal JsonElement? Saved = intent is null ? null : CoreProtocolJson.ToElement(new { version = 2, intent, consent = intent != "configured",
            policy = policy ?? MetadataSweepFixture.Policy, scopeLabels = new Dictionary<string, string> { [Volume + ":" + Folder] = "X:\\Assets" } });
        internal readonly MetadataSweepFixture Session = new(perKind);
        internal readonly Catalog Catalog = new();
        internal TaskCompletionSource? BlockSave;
        internal TaskCompletionSource SaveEntered = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal bool Fail;
        internal int Writes;
        internal MetadataGlobalBuildOwner Create() => new(Session, Catalog, new MetadataBuildGrantLifecycle(() => Task.FromResult(Saved?.Clone()), async value => {
            TestAssert.True(MetadataBuildStateSchema.Preferences(value), "global owner writes valid legacy grants"); SaveEntered.TrySetResult();
            if (BlockSave is not null) await BlockSave.Task;
            if (Fail) throw new IOException("synthetic persistence failure"); Saved = value.Clone(); Interlocked.Increment(ref Writes);
        }), MetadataSweepFixture.Specifications, yieldMilliseconds: 0, waitMilliseconds: 2);
    }
    private sealed class Catalog : IMetadataBuildCatalog
    {
        internal CatalogStatusResponse Status = new(MetadataSweepFixture.Volumes.Select((volume, index) => new CoreVolumeStatus(volume,
            index == 0 ? "X:" : "Y:", "NTFS", true, "ready", 0, null, true, false)).ToArray(), [], 1);
        internal Func<Task<CatalogResolveScopeResponse>> Resolve = () => Task.FromResult(new CatalogResolveScopeResponse(true, Volume, Folder, "X:", "ready", true));
        internal int Resolutions;
        public Task<CatalogStatusResponse> ReadStatusAsync(CancellationToken token) { token.ThrowIfCancellationRequested(); return Task.FromResult(Status); }
        public Task<CatalogResolveScopeResponse> ResolveScopeAsync(CatalogResolveScopeRequest request, CancellationToken token) { Resolutions++; return Resolve(); }
    }
    private static async Task CompletedAsync(MetadataGlobalBuildOwner owner)
    {
        for (var step = 0; step < 1000; step++) { if ((await owner.ReadAsync()).Progress.Phase == "completed") return; await Task.Delay(2); }
        throw new InvalidOperationException("global completion test timed out");
    }
    private static async Task CancelTaskAsync()
    {
        foreach(var active in new[]{false,true}) {
            var fixture=new Fixture("paused");var owner=fixture.Create();
            if(active) {
                fixture.Session.BlockAfter=2;await owner.ResumeAsync();
                for(var i=0;fixture.Session.Finished==0||fixture.Session.Live==0;i++) {
                    if(i==1000)throw new Exception("cancel fixture did not enter extraction");await Task.Delay(2);
                }
            }
            var result=await owner.CancelAsync().WaitAsync(TimeSpan.FromSeconds(3));
            TestAssert.Equal("idle",result.Progress.Phase,"cancel returns to idle");
            TestAssert.Equal(0,fixture.Session.Live,"cancel waits for content reads to stop");
            var finished=fixture.Session.Finished;var configurations=fixture.Session.Configurations;
            TestAssert.False(fixture.Saved!.Value.GetProperty("consent").GetBoolean(),"cancel removes execution consent");
            TestAssert.Equal("configured",fixture.Saved.Value.GetProperty("intent").GetString(),"scope remains configuration only");
            await owner.ShutdownAsync();owner=fixture.Create();await owner.RestoreAsync();await owner.NotifyCatalogChangeAsync();
            TestAssert.Equal("idle",(await owner.ReadAsync()).Progress.Phase,"restart does not restore canceled task");
            TestAssert.Equal(configurations,fixture.Session.Configurations,"restore/wake does not execute canceled policy");
            TestAssert.Equal(finished,fixture.Session.Finished,"published results survive cancellation");
            fixture.Session.BlockAfter=int.MaxValue;await owner.StartAsync(new(true,MetadataSweepFixture.Policy));await CompletedAsync(owner);
            TestAssert.True(fixture.Session.Configurations>configurations,"explicit new start is available after cancellation");await owner.ShutdownAsync();
        }
        var failed=new Fixture();var failedOwner=failed.Create();failed.Session.Fault=true;
        await failedOwner.StartAsync(new(true,MetadataSweepFixture.Policy));
        for(var i=0;(await failedOwner.ReadAsync()).Progress.Phase!="failed";i++) {
            if(i==1000)throw new Exception("failure fixture did not finish");await Task.Delay(2);
        }
        var cleared=await failedOwner.CancelAsync();TestAssert.Equal("idle",cleared.Progress.Phase,"failed task can be canceled");
        TestAssert.True(cleared.Progress.ErrorCode is null,"cancellation clears the previous task failure");await failedOwner.ShutdownAsync();
        var pending=new Fixture("configured"){BlockSave=new(TaskCreationOptions.RunContinuationsAsynchronously)};var target=pending.Create();
        var start=target.StartAsync(new(true,MetadataSweepFixture.Policy));await pending.SaveEntered.Task.WaitAsync(TimeSpan.FromSeconds(3));
        var cancel=target.CancelAsync();pending.BlockSave.SetResult();
        await TestAssert.ThrowsAsync<InvalidOperationException>(()=>start,"cancel invalidates an in-flight start");await cancel;
        TestAssert.Equal(0,pending.Session.Configurations,"late grant cannot start canceled work");await target.ShutdownAsync();
        var failing=new Fixture("paused"){Fail=true};target=failing.Create();
        await TestAssert.ThrowsAsync<IOException>(()=>target.CancelAsync(),"persistence failure cannot report successful cancellation");
        TestAssert.Equal("paused",failing.Saved!.Value.GetProperty("intent").GetString(),"failed write retains durable state");
        failing.Fail=false;await target.CancelAsync();await target.ShutdownAsync();
    }
    public static async Task RunAsync()
    {
        await CancelTaskAsync();
        await TerminalNotificationShutdownRaceAsync();
        var fixture = new Fixture(); var owner = fixture.Create();
        TestAssert.Equal("idle", (await owner.ReadAsync()).Progress.Phase, "passive status has no task");
        await owner.RestoreAsync(); await owner.NotifyCatalogChangeAsync(); TestAssert.Equal(0, fixture.Session.Configurations, "fresh install never grants content");
        await owner.SavePolicyAsync(MetadataSweepFixture.Policy); await owner.RestoreAsync(); await owner.NotifyCatalogChangeAsync(); await owner.PauseAsync();
        TestAssert.False(fixture.Saved!.Value.GetProperty("consent").GetBoolean(), "save/pause/restore never promote configuration");
        TestAssert.Equal(0, fixture.Session.Configurations, "configuration never calls the broker");
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => owner.ResumeAsync(), "configuration cannot be resumed as a task"); await owner.ShutdownAsync();
        fixture = new("active"); owner = fixture.Create();
        await Task.WhenAll(owner.RestoreAsync(), owner.RestoreAsync()); await CompletedAsync(owner); await owner.ShutdownAsync();
        TestAssert.Equal(16, fixture.Session.Reads, "saved explicit grant restores once"); TestAssert.Equal("completed", fixture.Saved!.Value.GetProperty("intent").GetString(), "completion persisted before shutdown returns");
        fixture = new("paused"); owner = fixture.Create(); await owner.RestoreAsync(); TestAssert.Equal(0, fixture.Session.Configurations, "manual pause survives restart");
        TestAssert.Equal("paused", (await owner.ReadAsync()).Progress.Phase, "paused intent projection"); await owner.ResumeAsync(); await CompletedAsync(owner); await owner.ShutdownAsync();
        fixture = new("completed", perKind: 0); owner = fixture.Create(); await owner.RestoreAsync(); await owner.NotifyCatalogChangeAsync(); await CompletedAsync(owner);
        TestAssert.Equal(0, fixture.Session.Discoveries, "completed grant restores dirty hints only"); TestAssert.True(fixture.Session.Changes > 0, "dirty consumer restored");
        await owner.PauseAsync(); var configurations = fixture.Session.Configurations; await owner.NotifyCatalogChangeAsync();
        TestAssert.Equal(configurations, fixture.Session.Configurations, "paused maintenance cannot restart from catalog wakes"); await owner.ShutdownAsync();
        fixture = new("active", Scoped); fixture.Catalog.Resolve = () => Task.FromResult(new CatalogResolveScopeResponse(true, Volume, new('2', 16), "X:", "ready", true));
        owner = fixture.Create(); await owner.RestoreAsync(); TestAssert.Equal("metadata-build-scope-changed", (await owner.ReadAsync()).Progress.ErrorCode, "recreated folder loses previous grant");
        TestAssert.Equal(0, fixture.Session.Configurations, "changed directory never configures execution"); await owner.ShutdownAsync();
        fixture = new("active"); fixture.Catalog.Status = fixture.Catalog.Status with { Tasks = [new("base", "synchronize", "running", null)] }; owner = fixture.Create();
        await owner.RestoreAsync(); TestAssert.Equal(0, fixture.Session.Configurations, "base preparation defers body extraction");
        fixture.Catalog.Status = fixture.Catalog.Status with { Tasks = [] }; await owner.RestoreAsync(); await CompletedAsync(owner); await owner.ShutdownAsync();
        foreach(var unavailable in new[]{"building","catchingUp","needsRebuild","offline"}) {
            fixture=new("completed",perKind:0);owner=fixture.Create();var status=fixture.Catalog.Status;
            fixture.Catalog.Status=status with{Volumes=status.Volumes.Select(v=>v with{State=unavailable,Queryable=false}).ToArray()};
            await owner.RestoreAsync();TestAssert.Equal(0,fixture.Session.Configurations,"unavailable base indexes defer restored content work");
            fixture.Catalog.Status=status;await owner.RestoreAsync();await owner.NotifyCatalogChangeAsync();await CompletedAsync(owner);await owner.ShutdownAsync();
            TestAssert.True(fixture.Session.Changes>0,"a later ready notification can resume the deferred maintenance grant");
        }
        foreach (var shutdown in new[] { false, true }) {
            fixture = new("active", Scoped); var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var resolve = new TaskCompletionSource<CatalogResolveScopeResponse>(TaskCreationOptions.RunContinuationsAsynchronously);
            fixture.Catalog.Resolve = () => { entered.TrySetResult(); return resolve.Task; }; owner = fixture.Create();
            var restoring = owner.RestoreAsync(); await entered.Task.WaitAsync(TimeSpan.FromSeconds(3));
            if (shutdown) await owner.ShutdownAsync(); else await owner.PauseAsync();
            resolve.SetResult(new(true, Volume, Folder, "X:", "ready", true)); await restoring;
            TestAssert.Equal(0, fixture.Session.Configurations, "late scope reply cannot undo pause/shutdown");
            TestAssert.Equal(shutdown ? "active" : "paused", fixture.Saved!.Value.GetProperty("intent").GetString(), "exit retains intention while explicit pause is durable");
            if (!shutdown) await owner.ShutdownAsync();
        }
        foreach (var configured in new[] { false, true }) {
            fixture = new("configured") { BlockSave = new(TaskCreationOptions.RunContinuationsAsynchronously) }; owner = fixture.Create();
            var writing = configured ? owner.SavePolicyAsync(MetadataSweepFixture.Policy) : owner.StartAsync(new(true, MetadataSweepFixture.Policy));
            await fixture.SaveEntered.Task.WaitAsync(TimeSpan.FromSeconds(3)); var pausing = owner.PauseAsync();
            TestAssert.Equal(0, fixture.Session.Configurations, "pending persistence cannot configure content"); fixture.BlockSave.SetResult();
            if (configured) await writing; else await TestAssert.ThrowsAsync<InvalidOperationException>(() => writing, "pause revokes pending start");
            await pausing;
            TestAssert.Equal(configured ? "configured" : "paused", fixture.Saved!.Value.GetProperty("intent").GetString(), "late write cannot escape durable pause or promote configuration");
            TestAssert.Equal(0, fixture.Session.Configurations, "no late execution after paused write"); await owner.ShutdownAsync();
        }
        fixture = new("active") { Fail = true }; owner = fixture.Create(); await owner.RestoreAsync();
        TestAssert.Equal("failed", (await owner.ReadAsync()).Progress.Phase, "restoration's own failed grant is visible");
        TestAssert.Equal(0, fixture.Session.Configurations, "failed restored grant never starts");
        await TestAssert.ThrowsAsync<IOException>(() => owner.ShutdownAsync(), "failed accepted write remains visible at shutdown");
        Console.WriteLine("Core global metadata: configuration-only, active/completed/paused restore, deferred base readiness, identity loss, pending scope/write cancellation and persistence failures passed.");
    }
    private static async Task TerminalNotificationShutdownRaceAsync()
    {
        foreach (var failed in new[] { false, true }) {
            var fixture = new Fixture("active", perKind: 1);
            fixture.Session.ExecutionGate = new(TaskCreationOptions.RunContinuationsAsynchronously); fixture.Session.Fault = failed;
            var owner = fixture.Create(); await owner.RestoreAsync();
            for (var step = 0; fixture.Session.Live == 0 && step < 1000; step++) await Task.Delay(2);
            TestAssert.Equal(1, fixture.Session.Live, "synthetic execution has reached its controlled gate");
            var flags = System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic;
            var ownerGate = typeof(MetadataGlobalBuildOwner).GetField("gate", flags)!.GetValue(owner)!;
            var sweep = (MetadataBuildSweep)typeof(MetadataGlobalBuildOwner).GetField("sweep", flags)!.GetValue(owner)!;
            Task shutdown;
            // Hold notification admission, not the progress snapshot: deterministically expose the publication gap.
            lock (ownerGate) {
                fixture.Session.ExecutionGate.SetResult();
                TestAssert.True(SpinWait.SpinUntil(() => sweep.Snapshot.Phase == (failed ? "failed" : "completed"), TimeSpan.FromSeconds(5)), "terminal snapshot published before its owner callback");
                shutdown = owner.ShutdownAsync();
            }
            await shutdown; await sweep.WaitForIdleAsync();
            TestAssert.Equal(failed ? "paused" : "completed", fixture.Saved!.Value.GetProperty("intent").GetString(), "shutdown persists terminal state even when its notification was pending");
            TestAssert.Equal(0, fixture.Session.Live, "terminal shutdown joins all synthetic reads");
        }
    }
}
