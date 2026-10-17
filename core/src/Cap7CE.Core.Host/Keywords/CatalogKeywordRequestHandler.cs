using Cap7CE.Core.Catalog.Keywords;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.Keywords;

internal static class CatalogKeywordRequestHandler
{
    private sealed record ReadRequest(CatalogKeywordIdentity Identity);
    private sealed record WriteRequest(CatalogKeywordIdentity Identity, IReadOnlyList<string> Keywords, string? ExpectedRevision);
    private sealed record ImportRequest(IReadOnlyList<CatalogLegacyKeywords> Entries);
    internal static bool Supports(string operation) => operation is "keywords.read" or "keywords.write" or "keywords.import";
    internal static async Task<CoreResponseEnvelope> DispatchAsync(ProductCoreRuntime runtime, CoreRequestEnvelope request, CancellationToken token)
    {
        var store = new CatalogKeywordStore(runtime.Catalog.DatabasePath);
        try
        {
            object body; long revision;
            switch (request.Operation)
            {
                case "keywords.read":
                    body = await store.ReadAsync(CoreRequestDispatcher.ReadBody<ReadRequest>(request).Identity, token);
                    revision = await runtime.Catalog.ReadRevisionAsync(token); break;
                case "keywords.write":
                    var write = CoreRequestDispatcher.ReadBody<WriteRequest>(request);
                    var result = await store.WriteAsync(write.Identity, write.Keywords, write.ExpectedRevision, token);
                    body = result; revision = result.CatalogRevision; break;
                case "keywords.import":
                    var imported = await store.ImportAsync(CoreRequestDispatcher.ReadBody<ImportRequest>(request).Entries, token);
                    body = imported; revision = imported.CatalogRevision; break;
                default: throw new ArgumentException("Unsupported keyword operation.");
            }
            runtime.ChangeSignal.PublishCatalog(revision);
            return CoreResponseEnvelope.Success(request.RequestId, revision, body);
        }
        catch (ArgumentException) { throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Keyword parameters or file identity are invalid."); }
    }
}
