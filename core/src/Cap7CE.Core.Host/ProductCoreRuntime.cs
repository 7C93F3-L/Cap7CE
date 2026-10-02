using System.Collections.Concurrent;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Protocol;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Host;

public sealed class ProductCoreRuntime : IAsyncDisposable
{
    private readonly CatalogV2Database catalog;
    private readonly CatalogSynchronizationService synchronizer;
    private readonly ConcurrentDictionary<string, RuntimeTask> tasks = new(StringComparer.Ordinal);
    private readonly CancellationTokenSource shutdown = new();

    public ProductCoreRuntime(
        CatalogV2Database catalog,
        ICatalogReaderSessionFactory readerFactory)
    {
        this.catalog = catalog;
        synchronizer = new CatalogSynchronizationService(catalog, readerFactory);
    }

    public CatalogV2Database Catalog => catalog;

    public static string DefaultCatalogPath()
    {
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(local)) throw new InvalidOperationException("local-app-data-unavailable");
        return Path.Combine(local, "Cap7CE", "Core", "v1", "catalog.db");
    }

    public Task InitializeAsync(CancellationToken token = default) => catalog.InitializeAsync(token);

    public async Task<VolumeListResponse> DiscoverVolumesAsync(CancellationToken token)
    {
        var volumes = await synchronizer.DiscoverAsync(token);
        return new VolumeListResponse(volumes.Select(ToStatus).ToArray());
    }

    public async Task<VolumeSelectionResponse> SelectVolumesAsync(
        VolumeSelectionRequest request,
        CancellationToken token)
    {
        ArgumentNullException.ThrowIfNull(request);
        await catalog.SetVolumeSelectionAsync(request.VolumeIds, token);
        return new VolumeSelectionResponse((await catalog.ReadVolumesAsync(token))
            .Where(volume => volume.Selected)
            .Select(volume => volume.VolumeId)
            .ToArray());
    }

    public async Task<CatalogStatusResponse> ReadStatusAsync(CancellationToken token)
    {
        var volumes = await catalog.ReadVolumesAsync(token);
        return new CatalogStatusResponse(
            volumes.Select(ToStatus).ToArray(),
            tasks.Values.Select(task => task.Snapshot()).OrderBy(task => task.TaskId, StringComparer.Ordinal).ToArray(),
            await catalog.ReadRevisionAsync(token));
    }

    public async Task<CatalogResolveScopeResponse> ResolveScopeAsync(
        CatalogResolveScopeRequest request,
        CancellationToken token)
    {
        ArgumentNullException.ThrowIfNull(request);
        var (displayName, relativePath) = ParseLocalDirectoryPath(request.Path);
        var volume = (await catalog.ReadVolumesAsync(token)).SingleOrDefault(candidate =>
            string.Equals(candidate.DisplayName, displayName, StringComparison.OrdinalIgnoreCase));
        if (volume is null)
        {
            return new CatalogResolveScopeResponse(false, null, null, null, null, false);
        }
        var status = ToStatus(volume);
        if (relativePath.Length == 0)
        {
            return new CatalogResolveScopeResponse(
                true, volume.VolumeId, null, volume.DisplayName, status.State, status.Queryable);
        }
        var directory = await catalog.ResolveDirectoryAsync(volume.VolumeId, relativePath, token);
        return directory is null
            ? new CatalogResolveScopeResponse(false, volume.VolumeId, null, volume.DisplayName,
                status.State, status.Queryable)
            : new CatalogResolveScopeResponse(true, volume.VolumeId, directory.Identity.FileReference,
                volume.DisplayName, status.State, status.Queryable);
    }

    public CatalogBuildResponse StartSynchronization(CatalogBuildRequest request, bool rebuild)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (request.VolumeIds.Count > CoreProtocol.MaximumVolumeIds
            || request.VolumeIds.Distinct(StringComparer.Ordinal).Count() != request.VolumeIds.Count)
        {
            throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Catalog volume selection is invalid.");
        }
        var taskId = "catalog-" + Guid.NewGuid().ToString("N");
        var cancellation = CancellationTokenSource.CreateLinkedTokenSource(shutdown.Token);
        var runtimeTask = new RuntimeTask(taskId, rebuild ? "rebuild" : "synchronize", cancellation);
        if (!tasks.TryAdd(taskId, runtimeTask)) throw new InvalidOperationException("catalog-task-id-collision");
        runtimeTask.Work = Task.Run(async () =>
        {
            try
            {
                var measurements = await synchronizer.SynchronizeAsync(request.VolumeIds, rebuild, cancellation.Token);
                runtimeTask.Complete("completed", null, measurements);
            }
            catch (OperationCanceledException)
            {
                runtimeTask.Complete("cancelled", null, []);
            }
            catch (CatalogReaderDiscontinuityException)
            {
                runtimeTask.Complete("failed", "journal-discontinuous", []);
            }
            catch (Exception error) when (error is not OutOfMemoryException)
            {
                runtimeTask.Complete("failed", ClassifyTaskFailure(error), []);
            }
        }, CancellationToken.None);
        return new CatalogBuildResponse(taskId, true);
    }

    internal IReadOnlyList<CatalogSynchronizationMeasurement> ReadTaskMeasurements(string taskId) =>
        tasks.TryGetValue(taskId, out var task)
            ? task.ReadMeasurements()
            : throw new KeyNotFoundException("catalog-task-not-found");

    public CatalogCancelResponse CancelTask(CatalogCancelRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var accepted = tasks.TryGetValue(request.TaskId, out var task) && task.TryCancel();
        return new CatalogCancelResponse(accepted);
    }

    public async Task<CatalogV2QueryPage> QueryAsync(
        SearchStartRequest request,
        CatalogQueryCursorKey? after,
        CancellationToken token)
    {
        var scope = ToScope(request.Scope);
        var type = request.EntryType switch
        {
            null or "any" => CatalogEntryType.Any,
            "file" => CatalogEntryType.File,
            "directory" => CatalogEntryType.Directory,
            _ => throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Entry type is invalid.")
        };
        return await catalog.QueryAsync(new CatalogV2Query(
            request.Query,
            request.VolumeIds,
            scope,
            request.Extension,
            type,
            request.PageSize,
            after), token);
    }

    public async Task ShutdownAsync()
    {
        shutdown.Cancel();
        var pending = tasks.Values.Select(task => task.Work).Where(task => task is not null).Cast<Task>().ToArray();
        if (pending.Length > 0)
        {
            try { await Task.WhenAll(pending).WaitAsync(TimeSpan.FromSeconds(10)); }
            catch (Exception error) when (error is TimeoutException or OperationCanceledException) { }
        }
    }

    public async ValueTask DisposeAsync()
    {
        await ShutdownAsync();
        foreach (var task in tasks.Values) task.Dispose();
        shutdown.Dispose();
    }

    private static CatalogQueryScope ToScope(CoreSearchScopeRequest? scope) => scope?.Kind switch
    {
        null or "all-volumes" => CatalogQueryScope.AllVolumes(),
        "directory-descendants" when scope.VolumeId is not null && scope.RootFileReference is not null =>
            CatalogQueryScope.Descendants(scope.VolumeId, scope.RootFileReference),
        "direct-children" when scope.VolumeId is not null && scope.RootFileReference is not null =>
            CatalogQueryScope.DirectChildren(scope.VolumeId, scope.RootFileReference),
        "saved-scope" when scope.SavedScopeId is not null => CatalogQueryScope.Saved(scope.SavedScopeId),
        _ => throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Search scope is invalid.")
    };

    private static (string DisplayName, string RelativePath) ParseLocalDirectoryPath(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 32767 || value.IndexOf('\0') >= 0)
        {
            throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Catalog scope path is invalid.");
        }
        var normalized = value.Replace('/', '\\');
        if (normalized.Length < 3 || !char.IsAsciiLetter(normalized[0]) || normalized[1] != ':'
            || normalized[2] != '\\' || normalized.IndexOf(':', 2) >= 0)
        {
            throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Catalog scope path is invalid.");
        }
        var segments = normalized[3..].TrimEnd('\\').Split('\\', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Any(segment => segment is "." or ".."))
        {
            throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Catalog scope path is invalid.");
        }
        return ($"{char.ToUpperInvariant(normalized[0])}:", string.Join('\\', segments));
    }

    private static string ClassifyTaskFailure(Exception error) => error switch
    {
        CatalogConcurrencyException => "catalog-concurrency",
        CatalogSchemaException => "catalog-schema",
        CatalogStateTransitionException => "catalog-state",
        ReaderProtocolException => "reader-protocol",
        ReaderRepairRequiredException => "reader-repair-required",
        ReaderServiceAccessDeniedException => "reader-access-denied",
        ReaderServiceUnavailableException => "reader-unavailable",
        TimeoutException => "reader-timeout",
        UnauthorizedAccessException => "access-denied",
        IOException => "io-failure",
        ArgumentException => "invalid-reader-record",
        _ when string.Equals(error.GetType().Name, "SqliteException", StringComparison.Ordinal) =>
            "catalog-sqlite",
        _ => "catalog-task-failed"
    };

    private static CoreVolumeStatus ToStatus(CatalogV2VolumeSnapshot volume) => new(
        volume.VolumeId,
        volume.DisplayName,
        volume.FileSystem,
        volume.Selected,
        volume.State switch
        {
            CatalogV2VolumeState.CatchingUp => "catchingUp",
            CatalogV2VolumeState.NeedsRebuild => "needsRebuild",
            _ => volume.State.ToString().ToLowerInvariant()
        },
        volume.Processed,
        volume.Total,
        volume.State is CatalogV2VolumeState.Ready or CatalogV2VolumeState.CatchingUp,
        volume.State == CatalogV2VolumeState.NeedsRebuild);

    private sealed class RuntimeTask : IDisposable
    {
        private readonly object gate = new();
        private readonly CancellationTokenSource cancellation;
        private string state = "running";
        private string? errorCode;
        private IReadOnlyList<CatalogSynchronizationMeasurement> measurements = [];

        public RuntimeTask(string taskId, string kind, CancellationTokenSource cancellation)
        {
            TaskId = taskId;
            Kind = kind;
            this.cancellation = cancellation;
        }

        public string TaskId { get; }
        public string Kind { get; }
        public Task? Work { get; set; }

        public bool TryCancel()
        {
            lock (gate)
            {
                if (state != "running") return false;
                cancellation.Cancel();
                return true;
            }
        }

        public void Complete(
            string nextState,
            string? nextError,
            IReadOnlyList<CatalogSynchronizationMeasurement> nextMeasurements)
        {
            lock (gate)
            {
                state = nextState;
                errorCode = nextError;
                measurements = nextMeasurements.ToArray();
            }
        }

        public IReadOnlyList<CatalogSynchronizationMeasurement> ReadMeasurements()
        {
            lock (gate) return measurements.ToArray();
        }

        public CoreCatalogTaskStatus Snapshot()
        {
            lock (gate) return new CoreCatalogTaskStatus(TaskId, Kind, state, errorCode);
        }

        public void Dispose() => cancellation.Dispose();
    }
}
