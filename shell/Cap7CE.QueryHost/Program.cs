using System.Security.Cryptography;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;

// Existing-Catalog composition: no initialization, storage lease, Reader or metadata scheduler.
// Only interactive sessions admit explicit manual-keyword read/write operations.
var interactive = args.LastOrDefault() == "--interactive";
if (interactive) args = args[..^1];
if (args is not ["--pipe-name", var pipeName, "--catalog", var catalogPath]
    || !pipeName.StartsWith("cap7ce-phase-f-", StringComparison.Ordinal)
    || pipeName.Length != 47 || !pipeName[15..].All(char.IsAsciiHexDigit)
    || !Path.IsPathFullyQualified(catalogPath) || !File.Exists(catalogPath)) return 2;
var secretLine = await Task.Run(() => Console.In.ReadLine()).WaitAsync(TimeSpan.FromSeconds(10));
if (!CoreHostOptions.TryDecodeSecret(secretLine, out var secret)) return 3;
try
{
    var database = new CatalogV2Database(catalogPath);
    using var startup = new CancellationTokenSource(TimeSpan.FromSeconds(15));
    await new Cap7CE.Core.Catalog.DirectoryEntries.CatalogFileEntryActivation(database).ReadEnabledAsync(startup.Token);
    await using var runtime = new ProductCoreRuntime(database, new ReaderV2CatalogSessionFactory());
    var allowed = new HashSet<string>(StringComparer.Ordinal) {
        CoreOperations.CatalogStatus, CoreOperations.CatalogResolveScope,
        CoreOperations.SearchStart, CoreOperations.SearchNextPage, CoreOperations.SearchCancel,
        CoreOperations.SearchManualKeywords
    };
    if (interactive) { allowed.Add(CoreOperations.KeywordsRead); allowed.Add(CoreOperations.KeywordsWrite); }
    await using var server = new CorePipeServer(pipeName, runtime, allowed);
    Console.WriteLine("ready");
    using var connection = new CancellationTokenSource();
    // EOF on the owning Shell's stdin ends the host even when its UI crashes.
    var ownerEnded = Task.Run(() => Console.In.ReadLine());
    var serving = server.RunAsync(secret, connection.Token);
    await Task.WhenAny(ownerEnded, serving);
    connection.Cancel();
    try { await serving; } catch (OperationCanceledException) { }
    return 0;
}
catch (Exception error) when (error is not OutOfMemoryException)
{
    Console.Error.WriteLine("phase-f-query-host-unavailable");
    return 4;
}
finally { CryptographicOperations.ZeroMemory(secret); }
