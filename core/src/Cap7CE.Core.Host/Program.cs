using System.Text.Json;
using System.Security.Cryptography;
using Cap7CE.Core.Host;
using Cap7CE.Core.Catalog;

if (!CoreHostOptions.TryParse(args, out var options))
{
    Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "invalid-arguments" }));
    return 2;
}

if (options.Mode == CoreHostMode.Describe)
{
    Console.WriteLine(JsonSerializer.Serialize(CoreHostScaffold.Describe()));
    return 0;
}

if (options.Mode == CoreHostMode.CatalogNativeDependencyProbe)
{
    try
    {
        var report = await CatalogNativeDependencyProbe.RunAsync();
        Console.WriteLine(JsonSerializer.Serialize(new
        {
            status = report.Status,
            inMemory = report.InMemory,
            sourceFilesRead = report.SourceFilesRead
        }));
        return 0;
    }
    catch
    {
        Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "failed", error = "native-sqlite-unavailable" }));
        return 9;
    }
}

if (options.Mode == CoreHostMode.CatalogReadOnly)
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(2));
    try
    {
        var report = await CatalogReadOnlyCli.RunAsync(Console.In, timeout.Token);
        Console.WriteLine(CatalogReadOnlyCli.Serialize(report));
        return 0;
    }
    catch (OperationCanceledException)
    {
        Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "failed", error = "catalog-readonly-timeout" }));
        return 4;
    }
    catch
    {
        Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "failed", error = "catalog-readonly-failed" }));
        return 4;
    }
}

if (options.Mode is CoreHostMode.ReaderFixtureClient or CoreHostMode.ReaderFixtureDisconnect)
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(45));
    try
    {
        var report = options.Mode == CoreHostMode.ReaderFixtureClient
            ? await ReaderFixtureCli.RunAsync(timeout.Token)
            : await ReaderFixtureCli.RunDisconnectAsync(timeout.Token);
        Console.WriteLine(ReaderFixtureCli.Serialize(report));
        return report.Status is "passed" or "disconnected" ? 0 : 5;
    }
    catch (OperationCanceledException)
    {
        Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "failed", error = "reader-timeout" }));
        return 5;
    }
    catch
    {
        Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "failed", error = "reader-client-failed" }));
        return 5;
    }
}

if (options.Mode == CoreHostMode.ReaderVolumeProbe)
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(2));
    try
    {
        var report = await ReaderVolumeCli.RunAsync(timeout.Token);
        Console.WriteLine(ReaderVolumeCli.Serialize(report));
        return report.Status == "passed" ? 0 : 6;
    }
    catch (OperationCanceledException)
    {
        Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "failed", error = "reader-volume-timeout" }));
        return 6;
    }
    catch
    {
        Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "failed", error = "reader-volume-failed" }));
        return 6;
    }
}

if (options.Mode is CoreHostMode.CoreP31Probe or CoreHostMode.CoreP31InitialProbe)
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(30));
    try
    {
        var report = await CoreP31ValidationCli.RunAsync(
            timeout.Token,
            options.Mode == CoreHostMode.CoreP31InitialProbe);
        Console.WriteLine(CoreP31ValidationCli.Serialize(report));
        return report.Status == "passed" ? 0 : 8;
    }
    catch (OperationCanceledException)
    {
        Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "failed", error = "core-p31-timeout" }));
        return 8;
    }
    catch
    {
        Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "failed", error = "core-p31-failed" }));
        return 8;
    }
}

if (options.Mode == CoreHostMode.CoreP37Probe)
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(15));
    try
    {
        var report = await CoreP37ValidationCli.RunAsync(timeout.Token);
        Console.WriteLine(CoreP37ValidationCli.Serialize(report));
        return report.Status == "passed" ? 0 : 10;
    }
    catch (OperationCanceledException)
    {
        Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "failed", error = "core-p37-timeout" }));
        return 10;
    }
    catch
    {
        Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "failed", error = "core-p37-failed" }));
        return 10;
    }
}

if (options.Mode is CoreHostMode.ReaderLifecycleClient
    or CoreHostMode.ReaderCapabilityLifecycleClient
    or CoreHostMode.ReaderP37LifecycleClient)
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(45));
    try
    {
        var report = options.Mode switch
        {
            CoreHostMode.ReaderCapabilityLifecycleClient =>
                await ReaderLifecycleCli.RunCapabilityAsync(timeout.Token),
            CoreHostMode.ReaderP37LifecycleClient =>
                await ReaderLifecycleCli.RunP37LifecycleAsync(timeout.Token),
            _ => await ReaderLifecycleCli.RunAsync(timeout.Token)
        };
        Console.WriteLine(ReaderLifecycleCli.Serialize(report));
        return report.Status is "passed" or "repair-required" or "access-denied" or "not-installed" ? 0 : 7;
    }
    catch (OperationCanceledException)
    {
        Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "failed", error = "reader-lifecycle-timeout" }));
        return 7;
    }
    catch
    {
        Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "failed", error = "reader-lifecycle-failed" }));
        return 7;
    }
}

string? encodedSecret;
try
{
    encodedSecret = await Console.In.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10));
}
catch (TimeoutException)
{
    Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "secret-timeout" }));
    return 3;
}

if (!CoreHostOptions.TryDecodeSecret(encodedSecret, out var sessionSecret))
{
    Console.Error.WriteLine(JsonSerializer.Serialize(new { status = "invalid-secret" }));
    return 3;
}

using var shutdown = new CancellationTokenSource();
Console.CancelKeyPress += (_, eventArgs) =>
{
    eventArgs.Cancel = true;
    shutdown.Cancel();
};

try
{
    ProductCoreRuntime? runtime = null;
    if (options.Mode is CoreHostMode.CatalogServer or CoreHostMode.CatalogControllerProbe)
    {
        var catalogPath = options.Mode == CoreHostMode.CatalogControllerProbe
            ? ControllerProbeCatalog.ResolveDatabasePath(options.PipeName!)
            : ProductCoreRuntime.DefaultCatalogPath();
        var catalog = new CatalogV2Database(catalogPath);
        runtime = new ProductCoreRuntime(catalog, new ReaderV2CatalogSessionFactory(),
            new Cap7CE.Core.Host.MetadataExtraction.FileFactHostSession(catalogPath, resolveOwnedStorage: options.Mode == CoreHostMode.CatalogServer
                ? token => Cap7CE.Core.Host.MetadataExtraction.ProductOwnedStorageResolver.ResolveAsync(catalog, token) : null,
                contentReader: Cap7CE.Core.Host.MetadataWorkers.NodeMetadataResources.FromEnvironment() is { } metadataResources
                    ? new Cap7CE.Core.Host.MetadataWorkers.NodeMetadataWorker(metadataResources) : null), CatalogPreparationDiagnostics.StandardError(),
            ownStorage: options.Mode == CoreHostMode.CatalogServer, createEntryCatalog: options.Mode == CoreHostMode.CatalogServer);
        await runtime.InitializeAsync(shutdown.Token);
        Cap7CE.Core.Host.MetadataBuildHosting.MetadataBuildAssembly.Configure(runtime, catalogPath, options.Mode == CoreHostMode.CatalogServer);
    }
    await using var runtimeScope = runtime;
    if (options.Mode == CoreHostMode.CatalogServer && runtime is not null)
        await runtime.ActivateMaintenanceAsync((ready, token) =>
            Cap7CE.Core.Host.MetadataExtraction.ProductOwnedStorageResolver.ResolveAsync(runtime.Catalog, ready, token), shutdown.Token);
    await using var server = new CorePipeServer(options.PipeName!, runtime);
    Console.WriteLine(JsonSerializer.Serialize(new
    {
        status = "ready",
        protocolVersion = Cap7CE.Core.Protocol.CoreProtocol.CurrentVersion,
        processId = Environment.ProcessId,
        syntheticFixture = runtime is null,
        catalogSchemaVersion = runtime is null ? (int?)null : CatalogV2Contract.SchemaVersion
    }));
    await server.RunAsync(sessionSecret, shutdown.Token);
}
finally
{
    CryptographicOperations.ZeroMemory(sessionSecret);
}
return 0;
