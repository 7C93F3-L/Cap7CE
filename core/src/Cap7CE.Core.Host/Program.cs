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

if (options.Mode == CoreHostMode.ReaderLifecycleClient)
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(45));
    try
    {
        var report = await ReaderLifecycleCli.RunAsync(timeout.Token);
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
    if (options.Mode == CoreHostMode.CatalogServer)
    {
        runtime = new ProductCoreRuntime(
            new CatalogV2Database(ProductCoreRuntime.DefaultCatalogPath()),
            new ReaderV2CatalogSessionFactory());
        await runtime.InitializeAsync(shutdown.Token);
    }
    await using var runtimeScope = runtime;
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
