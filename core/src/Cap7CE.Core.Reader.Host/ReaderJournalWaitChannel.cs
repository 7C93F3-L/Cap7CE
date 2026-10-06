using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Reader.Host;

internal sealed record ReaderJournalWaitChannelResult(ReaderJournalWaitResponse? Response, ReaderFrame? Cancellation);

// The authenticated service retains the next-frame task. This boundary joins
// its lifetime with the owned native wait; disconnect and explicit cancellation
// retire all kernel operations before the service acknowledges or exits.
internal static class ReaderJournalWaitChannel
{
    public static async Task<ReaderJournalWaitChannelResult> CompleteAsync(ReaderFrame request,
        Task<ReaderJournalWaitResponse> waiting, Task<ReaderFrame> nextRead, CancellationTokenSource lifetime)
    {
        try {
            if (await Task.WhenAny(waiting, nextRead) == nextRead) {
                var cancel = await nextRead;
                if (cancel.Header.Kind != ReaderMessageKind.Request || cancel.Header.Operation != ReaderOperation.Cancel
                    || cancel.Header.MajorVersion != request.Header.MajorVersion || cancel.Header.RequestId <= request.Header.RequestId
                    || ReaderPayloadCodec.DecodeCancelRequest(cancel.Payload.Span).TargetRequestId != request.Header.RequestId)
                    throw new ReaderProtocolException("journal-wait-requires-cancel");
                lifetime.Cancel();
                try { await waiting; } catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
                return new(null, cancel);
            }
            return new(await waiting, null);
        }
        finally {
            lifetime.Cancel();
            try { await waiting; } catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        }
    }
}
