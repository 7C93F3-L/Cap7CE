using Cap7CE.Core.Configuration;
using Cap7CE.Core.Configuration.Host;

if (args is ["--describe"])
{
    Console.WriteLine("{\"protocol\":\"configuration/1\",\"runtimeRequired\":false,\"readerRequired\":false}"); return 0;
}
if (args is not ["--favorites-file", var stateFile] || !Path.IsPathFullyQualified(stateFile)
    || !stateFile.EndsWith(".json", StringComparison.OrdinalIgnoreCase)) return 2;
using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(20));
try
{
    using var lease = FavoriteConfigurationLease.Acquire(stateFile);
    var registry = new FavoriteDirectoryRegistry(new(stateFile));
    FavoriteConfigurationSession.RunAsync(registry, Console.OpenStandardInput(), Console.OpenStandardOutput(), deadline.Token).GetAwaiter().GetResult(); return 0;
}
catch { return 3; } // Never print file paths, names or parser diagnostics to a log.
