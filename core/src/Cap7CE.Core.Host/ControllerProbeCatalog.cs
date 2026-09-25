namespace Cap7CE.Core.Host;

internal static class ControllerProbeCatalog
{
    private const string PipePrefix = "cap7ce-core-p32-";
    private const string DirectoryPrefix = "Cap7CE-Core-P32-";

    public static string ResolveDatabasePath(string pipeName)
    {
        if (!pipeName.StartsWith(PipePrefix, StringComparison.Ordinal))
        {
            throw new ArgumentException("Controller probe pipe name is invalid.", nameof(pipeName));
        }

        var token = pipeName[PipePrefix.Length..];
        if (token.Length != 32 || token.Any(character => character is not (>= '0' and <= '9' or >= 'a' and <= 'f')))
        {
            throw new ArgumentException("Controller probe token is invalid.", nameof(pipeName));
        }

        var temporaryRoot = Path.GetFullPath(Path.GetTempPath());
        var probeRoot = Path.GetFullPath(Path.Combine(temporaryRoot, DirectoryPrefix + token));
        var requiredPrefix = temporaryRoot.EndsWith(Path.DirectorySeparatorChar)
            ? temporaryRoot
            : temporaryRoot + Path.DirectorySeparatorChar;
        if (!probeRoot.StartsWith(requiredPrefix, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Controller probe catalog escaped the temporary directory.");
        }
        return Path.Combine(probeRoot, "catalog.db");
    }
}
