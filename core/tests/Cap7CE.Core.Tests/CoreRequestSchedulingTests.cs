using System.Collections.Concurrent;
using Cap7CE.Core.Adapters;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Tests;

internal static class CoreRequestSchedulingTests
{
    public static async Task RunAsync()
    {
        var source = new GatedSource();
        var dispatcher = new CoreRequestDispatcher(source, new SearchCursorCodec());
        CoreRequestEnvelope Search(string id, int deadline = 5_000) => new(1, id, CoreOperations.SearchStart,
            deadline, CoreProtocolJson.ToElement(new SearchStartRequest(id, 20, CoreSearchSorts.NameAscending, [SyntheticMetadataSearchSource.VolumeId])));
        Task<CoreResponseEnvelope> Cancel(string target) => dispatcher.DispatchAsync(new(1, "cancel-" + target,
            CoreOperations.SearchCancel, 5_000, CoreProtocolJson.ToElement(new SearchCancelRequest(target))), CancellationToken.None);
        var one = dispatcher.DispatchAsync(Search("one"), CancellationToken.None);
        var two = dispatcher.DispatchAsync(Search("two"), CancellationToken.None);
        try
        {
            await source.Started("one").WaitAsync(TimeSpan.FromSeconds(5));
            await source.Started("two").WaitAsync(TimeSpan.FromSeconds(5));
            var expired = await dispatcher.DispatchAsync(Search("expired", 20), CancellationToken.None);
            TestAssert.Equal(CoreErrorCodes.DeadlineExceeded, expired.Error!.Code, "queued deadline honored before executing");
            var three = dispatcher.DispatchAsync(Search("three"), CancellationToken.None);
            var cancel = await Cancel("three");
            TestAssert.True(cancel.Body!.Value.GetProperty("accepted").GetBoolean(), "cancel bypasses occupied worker slots");
            TestAssert.Equal(CoreErrorCodes.Cancelled, (await three).Error!.Code, "queued request cancelled");
            TestAssert.False(source.HasStarted("three") || source.HasStarted("expired"), "cancelled and expired queue entries never reach database worker");
            await Cancel("one");
            TestAssert.Equal(CoreErrorCodes.Cancelled, (await one).Error!.Code, "running request cancelled");
            var four = dispatcher.DispatchAsync(Search("four"), CancellationToken.None);
            await source.Started("four").WaitAsync(TimeSpan.FromSeconds(5));
            source.Release();
            TestAssert.Equal(CoreResponseStatuses.Success, (await two).Status, "other active request remains valid");
            TestAssert.Equal(CoreResponseStatuses.Success, (await four).Status, "cancelled slot reused");
            TestAssert.Equal(2, source.MaximumActive, "request execution concurrency bounded");
            TestAssert.False((await Cancel("one")).Body!.Value.GetProperty("accepted").GetBoolean(), "finished target safely rejects late cancel");
        }
        finally { source.Release(); await Task.WhenAll(one, two); }
    }

    private sealed class GatedSource : IMetadataSearchSource
    {
        private readonly ConcurrentDictionary<string, TaskCompletionSource<bool>> starts = new();
        private readonly TaskCompletionSource<bool> release = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int active;
        private int maximum;
        public long CatalogRevision => 1;
        public int MaximumActive => maximum;
        public Task Started(string id) => starts.GetOrAdd(id, _ => new(TaskCreationOptions.RunContinuationsAsynchronously)).Task;
        public bool HasStarted(string id) => starts.TryGetValue(id, out var start) && start.Task.IsCompleted;
        public void Release() => release.TrySetResult(true);
        public async Task<MetadataSearchPage> ReadPageAsync(MetadataSearchPageRequest request, CancellationToken token)
        {
            var current = Interlocked.Increment(ref active);
            int previous;
            do { previous = Volatile.Read(ref maximum); }
            while (current > previous && Interlocked.CompareExchange(ref maximum, current, previous) != previous);
            starts.GetOrAdd(request.Query, _ => new(TaskCreationOptions.RunContinuationsAsynchronously)).TrySetResult(true);
            try { await release.Task.WaitAsync(token); return new([], null); }
            finally { Interlocked.Decrement(ref active); }
        }
    }
}
