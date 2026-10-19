using Cap7CE.Core.Catalog.FileFacts;

namespace Cap7CE.Core.Host.MetadataExtraction;

public sealed record FileFactExecutionResult(FileFactBrokerCompletion Completion, string? State);

// One active content task. Reconfiguration/pausing revoke its token before policy publication.
internal sealed class FileFactExecutionOwner(IFileFactContentReader reader) : IAsyncDisposable
{
    private readonly object gate = new();
    private Generation epoch = new();
    private Task<FileFactExecutionResult>? running;
    public Task<FileFactExecutionResult> ExecuteAsync(FileFactExtractionTicket ticket,
        Func<FileFactExtractionResult, CancellationToken, Task<FileFactBrokerCompletion>> publish, CancellationToken token)
    {
        lock (gate) {
            if (running is { IsCompleted: false }) throw new FileFactWorkerException("metadata-worker-busy");
            var linked = CancellationTokenSource.CreateLinkedTokenSource(token, epoch.Cancellation.Token);
            return running = RunAsync(ticket, publish, linked, epoch);
        }
    }
    public void Revoke()
    {
        lock (gate) { epoch.Cancellation.Cancel(); epoch.Cancellation.Dispose(); epoch = new(); }
    }
    public async Task ReleaseAsync()
    {
        Task? work;
        lock (gate) { work = running; }
        if (work is not null) try { await work; } catch { /* Its request already owns the outcome. */ }
        await reader.ReleaseAsync();
    }
    public async ValueTask DisposeAsync() { Revoke(); await ReleaseAsync(); await reader.DisposeAsync(); epoch.Cancellation.Dispose(); }
    private async Task<FileFactExecutionResult> RunAsync(FileFactExtractionTicket ticket,
        Func<FileFactExtractionResult, CancellationToken, Task<FileFactBrokerCompletion>> publish, CancellationTokenSource linked, Generation generation)
    {
        using (linked) {
            var token = linked.Token;
            FileFactExtractionResult result;
            try { result = await reader.ReadAsync(ticket, token); generation.Failures = 0; }
            catch (FileFactWorkerException error) when (error.Message is "metadata-worker-exited" or "metadata-worker-timeout") {
                token.ThrowIfCancellationRequested();
                if (++generation.Failures >= 3) throw;
                result = new(FileFactState.Failed, ErrorCode: error.Message);
            }
            token.ThrowIfCancellationRequested();
            var completion = await publish(result, token);
            return new(completion, result.State switch { FileFactState.Indexed => "indexed", FileFactState.Unsupported => "unsupported", _ => "failed" });
        }
    }
    private sealed class Generation { public CancellationTokenSource Cancellation { get; } = new(); public int Failures; }
}
