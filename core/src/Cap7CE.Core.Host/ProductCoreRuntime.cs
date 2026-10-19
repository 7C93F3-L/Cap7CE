using System.Collections.Concurrent;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Protocol;
using Cap7CE.Core.Reader.Protocol;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Host.CatalogMaintenance;
using Cap7CE.Core.Host.CatalogStorage;
using Cap7CE.Core.Catalog.DirectoryEntries;

namespace Cap7CE.Core.Host;

public sealed class ProductCoreRuntime : IAsyncDisposable
{
    private readonly CatalogV2Database catalog;
    private CatalogSynchronizationService synchronizer;
    private readonly ConcurrentDictionary<string, RuntimeTask> tasks = new(StringComparer.Ordinal);
    private readonly CancellationTokenSource shutdown = new();
    private readonly CatalogReaderOwnership readerOwnership;
    private readonly CatalogPreparationDiagnostics? diagnostics;
    private readonly ICatalogReaderSessionFactory readerFactory;
    private readonly bool ownStorage, createEntryCatalog;
    private CatalogStorageLease? storageLease;
    private readonly SemaphoreSlim initialization = new(1, 1);
    private bool initialized;

    public ProductCoreRuntime(
        CatalogV2Database catalog,
        ICatalogReaderSessionFactory readerFactory,
        FileFactHostSession? fileFacts = null, CatalogPreparationDiagnostics? diagnostics = null,
        bool ownStorage = false, bool createEntryCatalog = false)
    {
        this.catalog = catalog;
        this.readerFactory = readerFactory;
        this.diagnostics = diagnostics;
        this.ownStorage = ownStorage; this.createEntryCatalog = createEntryCatalog;
        readerOwnership = new(diagnostics);
        synchronizer = new CatalogSynchronizationService(catalog, readerFactory, diagnostics);
        FileFacts = fileFacts;
    }

    public CatalogV2Database Catalog => catalog;
    public FileFactHostSession? FileFacts { get; }
    public CatalogChangeSignal ChangeSignal { get; } = new();
    public bool MaintenanceEnabled { get; private set; }
    public bool FileEntryModeEnabled { get; private set; }

    public static string DefaultCatalogPath()
    {
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(local)) throw new InvalidOperationException("local-app-data-unavailable");
        return Path.Combine(local, "Cap7CE", "Core", "v1", "catalog.db");
    }

    public async Task InitializeAsync(CancellationToken token = default)
    {
        await initialization.WaitAsync(token);
        try {
            if (initialized) return;
            if (ownStorage) storageLease = CatalogStorageLease.Acquire(catalog.DatabasePath, createDirectory: true);
            await catalog.InitializeAsync(token, createEntryCatalog);
            FileEntryModeEnabled = await new CatalogFileEntryActivation(catalog).ReadEnabledAsync(token);
            synchronizer = new(catalog, readerFactory, diagnostics, captureFileEntries: FileEntryModeEnabled);
            ChangeSignal.PublishCatalog(await catalog.ReadRevisionAsync(token)); initialized = true;
        }
        catch { storageLease?.Dispose(); storageLease = null; throw; }
        finally { initialization.Release(); }
    }

    public async Task ActivateMaintenanceAsync(
        Func<IReadOnlyList<CatalogV2VolumeSnapshot>, CancellationToken, Task<IReadOnlyList<FileFactOwnedStorageRoot>>> resolveRoots,
        CancellationToken token = default)
    {
        if (MaintenanceEnabled) throw new InvalidOperationException("reader-monitor-already-configured");
        ChangeSignal.SetState("starting");
        await CatalogMaintenanceActivation.StartAsync(readerOwnership, catalog, readerFactory, ChangeSignal, resolveRoots, token, diagnostics, FileEntryModeEnabled);
        MaintenanceEnabled = true;
    }

    public async Task<VolumeListResponse> DiscoverVolumesAsync(CancellationToken token)
    {
        var volumes = await readerOwnership.RunExclusiveAsync(synchronizer.DiscoverAsync, token, "discover");
        ChangeSignal.PublishCatalog(await catalog.ReadRevisionAsync(token));
        return new VolumeListResponse(volumes.Select(ToStatus).ToArray());
    }

    public async Task<VolumeSelectionResponse> SelectVolumesAsync(
        VolumeSelectionRequest request,
        CancellationToken token)
    {
        ArgumentNullException.ThrowIfNull(request);
        return await readerOwnership.RunExclusiveAsync(async ownershipToken => {
            await catalog.SetVolumeSelectionAsync(request.VolumeIds, ownershipToken);
            ChangeSignal.PublishCatalog(await catalog.ReadRevisionAsync(ownershipToken));
            return new VolumeSelectionResponse((await catalog.ReadVolumesAsync(ownershipToken))
                .Where(volume => volume.Selected).Select(volume => volume.VolumeId).ToArray());
        }, token, "select");
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
            var root = await Cap7CE.Core.Catalog.Queries.CatalogVolumeRootResolver.ResolveAsync(catalog, volume.VolumeId, token);
            return new CatalogResolveScopeResponse(
                true, volume.VolumeId, null, volume.DisplayName, status.State, status.Queryable,
                root?.Identity.FileReference);
        }
        var directory = await catalog.ResolveDirectoryAsync(volume.VolumeId, relativePath, token);
        return directory is null
            ? new CatalogResolveScopeResponse(false, volume.VolumeId, null, volume.DisplayName,
                status.State, status.Queryable)
            : new CatalogResolveScopeResponse(true, volume.VolumeId, directory.Identity.FileReference,
                volume.DisplayName, status.State, status.Queryable, directory.Identity.FileReference);
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
                var measurements = await readerOwnership.RunExclusiveAsync(
                    ownershipToken => synchronizer.SynchronizeAsync(request.VolumeIds, rebuild, ownershipToken), cancellation.Token, rebuild ? "rebuild" : "synchronize");
                ChangeSignal.PublishCatalog(await catalog.ReadRevisionAsync(cancellation.Token));
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
        CancellationToken token,
        long? expectedCatalogRevision = null)
    {
        ArgumentNullException.ThrowIfNull(request);
        try
        {
            var query = ProductSearchQueryMapper.Map(request, after);
            if (expectedCatalogRevision is { } expected) query = query with { ExpectedRevision = new(expected) };
            return await catalog.QueryAsync(query, token);
        }
        catch (CatalogConcurrencyException) when (expectedCatalogRevision is not null)
        { throw new CoreProtocolException(CoreErrorCodes.InvalidCursor, "Catalog changed during pagination."); }
        catch (ArgumentException) { throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Search parameters are invalid."); }
    }

    public async Task ShutdownAsync()
    {
        shutdown.Cancel();
        await readerOwnership.ShutdownAsync();
        ChangeSignal.SetState("stopped");
        var pending = tasks.Values.Select(task => task.Work).Where(task => task is not null).Cast<Task>().ToArray();
        if (pending.Length > 0)
        {
            try { await Task.WhenAll(pending).WaitAsync(TimeSpan.FromSeconds(10)); }
            catch (Exception error) when (error is TimeoutException or OperationCanceledException) { }
        }
    }

    public async ValueTask DisposeAsync()
    {
        try {
            await ShutdownAsync();
            if (FileFacts is not null) await FileFacts.DisposeAsync();
            foreach (var task in tasks.Values) task.Dispose();
            await readerOwnership.DisposeAsync();
        }
        finally { storageLease?.Dispose(); shutdown.Dispose(); }
    }

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
        NotSupportedException unsupported when unsupported.Message == "reader-entry-names-unavailable" => "reader-repair-required",
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
