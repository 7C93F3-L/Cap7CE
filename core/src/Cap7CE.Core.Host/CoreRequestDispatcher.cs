using System.Collections.Concurrent;
using System.Text.Json;
using Cap7CE.Core.Adapters;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Protocol;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Host.CatalogMaintenance;

namespace Cap7CE.Core.Host;

public sealed class CoreRequestDispatcher
{
    private readonly ConcurrentDictionary<string, CancellationTokenSource> activeRequests = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim executionSlots = new(2, 2);
    private readonly IMetadataSearchSource source;
    private readonly SearchCursorCodec cursors;
    private readonly ProductCoreRuntime? runtime;
    private readonly ProductSearchCursorCodec? productCursors;
    private readonly CatalogMaintenanceRequestHandler? maintenance;

    public CoreRequestDispatcher(IMetadataSearchSource source, SearchCursorCodec cursors)
    {
        this.source = source;
        this.cursors = cursors;
    }

    public CoreRequestDispatcher(ProductCoreRuntime runtime, ProductSearchCursorCodec cursors)
    {
        this.runtime = runtime;
        productCursors = cursors;
        maintenance = new(runtime.ChangeSignal);
        source = null!;
        this.cursors = null!;
    }

    public IReadOnlyList<string> Capabilities => runtime is null
        ? CoreOperations.P11Capabilities
        : CoreOperations.P31Capabilities.Concat(runtime.FileFacts is null ? [] : CoreOperations.FileFactCapabilities)
            .Concat(runtime.MaintenanceEnabled ? [CoreOperations.CatalogAwaitChanges] : Array.Empty<string>()).ToArray();

    public bool SyntheticFixture => runtime is null;

    public async Task<CoreResponseEnvelope> DispatchAsync(
        CoreRequestEnvelope request,
        CancellationToken sessionCancellationToken)
    {
        if (request.Operation == CoreOperations.SearchCancel)
        {
            return HandleCancel(request);
        }

        using var clientCancellation = new CancellationTokenSource();
        if (!activeRequests.TryAdd(request.RequestId, clientCancellation))
        {
            return Failure(request, CoreErrorCodes.DuplicateRequest, "dispatch", false, "Request identifier is already active.");
        }

        using var deadlineCancellation = new CancellationTokenSource(request.DeadlineMs);
        using var linkedCancellation = CancellationTokenSource.CreateLinkedTokenSource(
            clientCancellation.Token,
            deadlineCancellation.Token,
            sessionCancellationToken);
        try
        {
            if (request.Operation == CoreOperations.CatalogAwaitChanges && runtime?.MaintenanceEnabled == true)
                return await maintenance!.DispatchAsync(request, linkedCancellation.Token);
            await executionSlots.WaitAsync(linkedCancellation.Token);
            try
            {
                return await Task.Run(() => ExecuteOperationAsync(request, linkedCancellation.Token), linkedCancellation.Token);
            }
            finally { executionSlots.Release(); }
        }
        catch (OperationCanceledException)
        {
            if (clientCancellation.IsCancellationRequested)
            {
                return Failure(request, CoreErrorCodes.Cancelled, "execution", false, "Request was cancelled.");
            }
            if (deadlineCancellation.IsCancellationRequested)
            {
                return Failure(request, CoreErrorCodes.DeadlineExceeded, "execution", true, "Request deadline was exceeded.");
            }
            return Failure(request, CoreErrorCodes.Cancelled, "session", true, "Session ended before completion.");
        }
        catch (CoreProtocolException error)
        {
            return Failure(request, error.Code, "validation", false, error.Message);
        }
        catch (JsonException)
        {
            return Failure(request, CoreErrorCodes.InvalidRequest, "validation", false, "Request body is invalid.");
        }
        catch (Exception)
        {
            return Failure(request, CoreErrorCodes.Internal, "execution", true, "Request failed internally.");
        }
        finally
        {
            activeRequests.TryRemove(request.RequestId, out _);
        }
    }

    private async Task<CoreResponseEnvelope> ExecuteOperationAsync(CoreRequestEnvelope request, CancellationToken token) =>
        request.Operation switch
        {
            CoreOperations.CapabilityStatus when runtime is not null => await CapabilityStatusAsync(request, token),
            CoreOperations.VolumeList when runtime is not null => await VolumeListAsync(request, token),
            CoreOperations.VolumeSelection when runtime is not null => await VolumeSelectionAsync(request, token),
            CoreOperations.CatalogStatus when runtime is not null => await CatalogStatusAsync(request, token),
            CoreOperations.CatalogBuild when runtime is not null => StartCatalogTask(request, rebuild: false),
            CoreOperations.CatalogRebuild when runtime is not null => StartCatalogTask(request, rebuild: true),
            CoreOperations.CatalogCancel when runtime is not null => CancelCatalogTask(request),
            CoreOperations.CatalogResolveScope when runtime is not null => await ResolveScopeAsync(request, token),
            CoreOperations.CoreShutdown when runtime is not null => await ShutdownAsync(request),
            CoreOperations.SearchStart => await StartSearchAsync(request, token),
            CoreOperations.SearchNextPage => await NextPageAsync(request, token),
            _ when runtime?.FileFacts is { } facts && FileFactRequestHandler.Supports(request.Operation) =>
                await FileFactRequestHandler.DispatchAsync(facts, request, token),
            _ => Failure(request, CoreErrorCodes.UnknownOperation, "dispatch", false, "Operation is not supported.")
        };

    private async Task<CoreResponseEnvelope> StartSearchAsync(
        CoreRequestEnvelope request,
        CancellationToken cancellationToken)
    {
        var body = ReadBody<SearchStartRequest>(request);
        if (body.Continuation is not null && (runtime is null || body.Continuation != "live"))
            throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Search continuation is invalid.");
        if (body.Query is null
            || body.Query.Length > CoreProtocol.MaximumQueryLength
            || body.PageSize is < 1 or > CoreProtocol.MaximumPageSize
            || !CoreSearchSorts.IsSupported(body.Sort) || (runtime is null && (body.Sort != CoreSearchSorts.NameAscending || body.ExcludeHidden || body.RandomSeed is not null))
            || body.VolumeIds is null
            || body.VolumeIds.Count > CoreProtocol.MaximumVolumeIds
            || (runtime is null && (body.VolumeIds.Count < 1
                || body.VolumeIds.Any(id => id != SyntheticMetadataSearchSource.VolumeId))))
        {
            throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Search parameters are outside protocol limits.");
        }

        if (runtime is not null)
        {
            var productPage = await runtime.QueryAsync(body, null, cancellationToken);
            return ProductPageResponse(request, body, productPage);
        }

        if (body.TextTarget is not null || body.Facts is not null || body.FileConditions is not null)
            throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Fixture does not support product filters.");
        var page = await source.ReadPageAsync(
            new MetadataSearchPageRequest(body.Query, 0, body.PageSize, body.Sort, body.VolumeIds),
            cancellationToken);
        return PageResponse(request, body.Query, body.PageSize, body.Sort, body.VolumeIds, page);
    }

    private async Task<CoreResponseEnvelope> NextPageAsync(
        CoreRequestEnvelope request,
        CancellationToken cancellationToken)
    {
        var body = ReadBody<SearchNextPageRequest>(request);
        if (string.IsNullOrWhiteSpace(body.Cursor))
        {
            throw new CoreProtocolException(CoreErrorCodes.InvalidCursor, "Cursor is invalid or expired.");
        }
        if (runtime is not null)
        {
            var revision = await runtime.Catalog.ReadRevisionAsync(cancellationToken);
            var productCursor = productCursors!.Read(body.Cursor, revision);
            var start = new SearchStartRequest(
                productCursor.Query,
                productCursor.PageSize,
                productCursor.Sort,
                productCursor.VolumeIds,
                productCursor.Scope,
                productCursor.Extension,
                productCursor.EntryType,
                productCursor.TextTarget,
                productCursor.Facts,
                productCursor.FileConditions,
                productCursor.Continuation, productCursor.ExcludeHidden, productCursor.RandomSeed);
            var productPage = await runtime.QueryAsync(start, productCursor.After, cancellationToken,
                productCursor.Continuation == "live" ? null : productCursor.CatalogRevision);
            return ProductPageResponse(request, start, productPage);
        }

        var cursor = cursors.Read(body.Cursor, source.CatalogRevision);
        var page = await source.ReadPageAsync(
            new MetadataSearchPageRequest(
                cursor.Query, cursor.Offset, cursor.PageSize, cursor.Sort, cursor.VolumeIds),
            cancellationToken);
        return PageResponse(request, cursor.Query, cursor.PageSize, cursor.Sort, cursor.VolumeIds, page);
    }

    private CoreResponseEnvelope HandleCancel(CoreRequestEnvelope request)
    {
        SearchCancelRequest body;
        try
        {
            body = ReadBody<SearchCancelRequest>(request);
        }
        catch (Exception error) when (error is JsonException or CoreProtocolException)
        {
            return Failure(request, CoreErrorCodes.InvalidRequest, "validation", false, "Cancellation request is invalid.");
        }

        if (string.IsNullOrEmpty(body.TargetRequestId))
        {
            return Failure(request, CoreErrorCodes.InvalidRequest, "validation", false, "Cancellation target is invalid.");
        }
        var accepted = activeRequests.TryGetValue(body.TargetRequestId, out var cancellation);
        if (accepted)
        {
            try { cancellation!.Cancel(); }
            catch (ObjectDisposedException) { accepted = false; }
        }
        return CoreResponseEnvelope.Success(
            request.RequestId,
            runtime is null ? source.CatalogRevision : 0,
            new SearchCancelResponse(accepted));
    }

    private async Task<CoreResponseEnvelope> CapabilityStatusAsync(
        CoreRequestEnvelope request,
        CancellationToken token)
    {
        RequireEmptyBody(request);
        return CoreResponseEnvelope.Success(
            request.RequestId,
            await runtime!.Catalog.ReadRevisionAsync(token),
            new CapabilityStatusResponse(
                "available",
                CatalogV2Contract.SchemaVersion,
                CatalogV2Contract.PathStrategy,
                false,
                false,
                false,
                false));
    }

    private async Task<CoreResponseEnvelope> VolumeListAsync(
        CoreRequestEnvelope request,
        CancellationToken token)
    {
        RequireEmptyBody(request);
        var response = await runtime!.DiscoverVolumesAsync(token);
        return CoreResponseEnvelope.Success(
            request.RequestId,
            await runtime.Catalog.ReadRevisionAsync(token),
            response);
    }

    private async Task<CoreResponseEnvelope> VolumeSelectionAsync(
        CoreRequestEnvelope request,
        CancellationToken token)
    {
        var response = await runtime!.SelectVolumesAsync(ReadBody<VolumeSelectionRequest>(request), token);
        return CoreResponseEnvelope.Success(
            request.RequestId,
            await runtime.Catalog.ReadRevisionAsync(token),
            response);
    }

    private async Task<CoreResponseEnvelope> CatalogStatusAsync(
        CoreRequestEnvelope request,
        CancellationToken token)
    {
        RequireEmptyBody(request);
        var response = await runtime!.ReadStatusAsync(token);
        return CoreResponseEnvelope.Success(request.RequestId, response.CatalogRevision, response);
    }

    private CoreResponseEnvelope StartCatalogTask(CoreRequestEnvelope request, bool rebuild)
    {
        var response = runtime!.StartSynchronization(ReadBody<CatalogBuildRequest>(request), rebuild);
        return CoreResponseEnvelope.Success(request.RequestId, 0, response);
    }

    private CoreResponseEnvelope CancelCatalogTask(CoreRequestEnvelope request)
    {
        var response = runtime!.CancelTask(ReadBody<CatalogCancelRequest>(request));
        return CoreResponseEnvelope.Success(request.RequestId, 0, response);
    }

    private async Task<CoreResponseEnvelope> ResolveScopeAsync(
        CoreRequestEnvelope request,
        CancellationToken token)
    {
        var response = await runtime!.ResolveScopeAsync(ReadBody<CatalogResolveScopeRequest>(request), token);
        return CoreResponseEnvelope.Success(
            request.RequestId,
            await runtime.Catalog.ReadRevisionAsync(token),
            response);
    }

    private async Task<CoreResponseEnvelope> ShutdownAsync(CoreRequestEnvelope request)
    {
        RequireEmptyBody(request);
        await runtime!.ShutdownAsync();
        return CoreResponseEnvelope.Success(request.RequestId, 0, new CoreShutdownResponse(true));
    }

    internal static T ReadBody<T>(CoreRequestEnvelope request)
        where T : class
    {
        if (request.Body.ValueKind != JsonValueKind.Object)
        {
            throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Request body must be an object.");
        }
        return request.Body.Deserialize<T>(CoreProtocolJson.Options)
            ?? throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Request body is missing.");
    }

    internal static void RequireEmptyBody(CoreRequestEnvelope request)
    {
        if (request.Body.ValueKind != JsonValueKind.Object || request.Body.EnumerateObject().Any())
        {
            throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Request body must be an empty object.");
        }
    }

    private CoreResponseEnvelope PageResponse(
        CoreRequestEnvelope request,
        string query,
        int pageSize,
        string sort,
        IReadOnlyList<string> volumeIds,
        MetadataSearchPage page)
    {
        var items = page.Items.Select(item => new BasicSearchItem(
            item.Id, item.Name, item.RelativePath, item.Extension, item.IsDirectory)).ToArray();
        var nextCursor = page.NextOffset is long offset
            ? cursors.Create(query, offset, pageSize, sort, volumeIds, source.CatalogRevision)
            : null;
        var response = new SearchPageResponse(items, nextCursor, nextCursor is null, source.CatalogRevision);
        return CoreResponseEnvelope.Success(request.RequestId, source.CatalogRevision, response);
    }

    private CoreResponseEnvelope ProductPageResponse(
        CoreRequestEnvelope request,
        SearchStartRequest start,
        CatalogV2QueryPage page)
    {
        var items = page.Items.Select(item => new BasicSearchItem(
            $"{item.Identity.VolumeId}:{item.Identity.FileReference}",
            item.Name,
            item.RelativePath,
            item.Extension,
            item.IsDirectory,
            item.Identity.VolumeId,
            item.Identity.FileReference,
            item.SizeBytes,
            item.CreatedUtcTicks,
            item.ModifiedUtcTicks,
            item.Attributes)).ToArray();
        var nextCursor = page.Next is null ? null : productCursors!.Create(new ProductSearchCursorToken(
            start.Query,
            start.PageSize,
            start.VolumeIds,
            start.Scope ?? new CoreSearchScopeRequest("all-volumes"),
            start.Extension,
            start.EntryType ?? "any",
            page.Next,
            page.CatalogRevision,
            TextTarget: start.TextTarget,
            Facts: start.Facts,
            FileConditions: start.FileConditions,
            Continuation: start.Continuation, Sort: start.Sort, ExcludeHidden: start.ExcludeHidden, RandomSeed: start.RandomSeed));
        return CoreResponseEnvelope.Success(request.RequestId, page.CatalogRevision,
            new SearchPageResponse(items, nextCursor, nextCursor is null, page.CatalogRevision, page.FactRevision));
    }

    private CoreResponseEnvelope Failure(
        CoreRequestEnvelope request,
        string code,
        string stage,
        bool retryable,
        string message) => CoreResponseEnvelope.Failure(
            request.RequestId,
            runtime is null ? source.CatalogRevision : 0,
            code,
            stage,
            retryable,
            message);
}
