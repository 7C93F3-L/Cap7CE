using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Reader.Host;

internal static class ReaderJournalWaitCoordinator
{
    public static async Task<ReaderJournalWaitResponse> WaitAsync(ReaderJournalWaitRequest request,
        Func<ReaderJournalWaitCursor, CancellationToken, Task> wait, CancellationToken token)
    {
        // Reuse binary contract validation before starting any native operation.
        _ = ReaderPayloadCodec.EncodeJournalWaitRequest(request);
        token.ThrowIfCancellationRequested();
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(token);
        lifetime.CancelAfter((int)request.WaitMilliseconds);
        var tasks = new List<Task>();
        try {
            foreach (var cursor in request.Cursors) tasks.Add(wait(cursor, lifetime.Token));
            var first = await Task.WhenAny(tasks);
            try { await first; }
            catch (OperationCanceledException) when (!token.IsCancellationRequested && lifetime.IsCancellationRequested) {
                return new([], true);
            }
            token.ThrowIfCancellationRequested();
            return new(request.Cursors.Where((_, index) => tasks[index].IsCompletedSuccessfully).Select(cursor => cursor.VolumeId).ToArray(), false);
        }
        finally {
            lifetime.Cancel();
            // Returning, cancellation and native errors all await retirement of
            // every owned wait; no buffer or volume handle outlives the request.
            try { await Task.WhenAll(tasks); }
            catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        }
    }
}
