namespace Cap7CE.Core.Reader.Host;

// Connection admission is bounded. An authenticated pipe belongs to its client
// until disconnect or SCM stop, including an event-driven journal wait.
internal sealed class ReaderConnectionLifetime : IDisposable
{
    private readonly object gate = new();
    private readonly CancellationTokenSource lifetime;
    private ITimer? admission;
    private bool authenticated, disposed;
    public CancellationToken Token { get; }
    public ReaderConnectionLifetime(CancellationToken stopping, TimeSpan timeout, TimeProvider? clock = null)
    {
        lifetime = CancellationTokenSource.CreateLinkedTokenSource(stopping);
        Token = lifetime.Token;
        admission = (clock ?? TimeProvider.System).CreateTimer(_ => ExpireAdmission(), null, timeout, Timeout.InfiniteTimeSpan);
    }
    private void ExpireAdmission()
    {
        lock (gate) { if (!authenticated && !disposed) lifetime.Cancel(); }
    }
    public void Authenticate()
    {
        lock (gate) {
            ObjectDisposedException.ThrowIf(disposed, this);
            Token.ThrowIfCancellationRequested();
            authenticated = true;
            admission?.Dispose(); admission = null;
        }
    }
    public void Dispose()
    {
        lock (gate) { if (disposed) return; disposed = true; admission?.Dispose(); admission = null; lifetime.Dispose(); }
    }
}
