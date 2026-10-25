using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.CatalogMaintenance;

// One long wait has its own lane; it must not consume either foreground search
// execution slot. It retains ordinary request deadline/session/cancel fencing.
internal sealed class CatalogMaintenanceRequestHandler(CatalogChangeSignal signal)
{
    private int waiting;
    public async Task<CoreResponseEnvelope> DispatchAsync(CoreRequestEnvelope request, CancellationToken token)
    {
        var body = CoreRequestDispatcher.ReadBody<CatalogAwaitChangesRequest>(request);
        if (body.AfterSequence < 0 || body.WaitMilliseconds is < 1 or > 25_000 || body.WaitMilliseconds >= request.DeadlineMs)
            throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Catalog wait parameters are invalid.");
        if (Interlocked.CompareExchange(ref waiting, 1, 0) != 0)
            throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Only one Catalog wait may be active.");
        try { return CoreResponseEnvelope.Success(request.RequestId, 0, await signal.WaitAsync(body, token,request.Operation==CoreOperations.CatalogAwaitScopedChanges)); }
        finally { Volatile.Write(ref waiting, 0); }
    }
}
