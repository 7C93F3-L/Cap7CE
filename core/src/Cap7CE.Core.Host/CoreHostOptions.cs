namespace Cap7CE.Core.Host;

public enum CoreHostMode
{
    Describe,
    SyntheticServer,
    CatalogServer,
    CatalogControllerProbe,
    CatalogNativeDependencyProbe,
    CatalogReadOnly,
    ReaderFixtureClient,
    ReaderFixtureDisconnect,
    ReaderVolumeProbe,
    CoreP31Probe,
    CoreP31InitialProbe,
    CoreP37Probe,
    ReaderLifecycleClient,
    ReaderCapabilityLifecycleClient,
    ReaderP37LifecycleClient
}

public sealed record CoreHostOptions(CoreHostMode Mode, string? PipeName)
{
    private static readonly string[] PipePrefixes = ["cap7ce-core-p11-", "cap7ce-core-p31-", "cap7ce-core-p32-", "cap7ce-core-p35-"];

    public static bool TryParse(string[] args, out CoreHostOptions options)
    {
        if (args.Length == 0)
        {
            options = new CoreHostOptions(CoreHostMode.Describe, null);
            return true;
        }

        if (args is ["--catalog-readonly"])
        {
            options = new CoreHostOptions(CoreHostMode.CatalogReadOnly, null);
            return true;
        }

        if (args is ["--catalog-native-dependency-probe"])
        {
            options = new CoreHostOptions(CoreHostMode.CatalogNativeDependencyProbe, null);
            return true;
        }

        if (args is ["--reader-fixture-client"])
        {
            options = new CoreHostOptions(CoreHostMode.ReaderFixtureClient, null);
            return true;
        }

        if (args is ["--reader-fixture-disconnect"])
        {
            options = new CoreHostOptions(CoreHostMode.ReaderFixtureDisconnect, null);
            return true;
        }

        if (args is ["--reader-volume-probe"])
        {
            options = new CoreHostOptions(CoreHostMode.ReaderVolumeProbe, null);
            return true;
        }

        if (args is ["--core-p31-probe"])
        {
            options = new CoreHostOptions(CoreHostMode.CoreP31Probe, null);
            return true;
        }

        if (args is ["--core-p31-initial-probe"])
        {
            options = new CoreHostOptions(CoreHostMode.CoreP31InitialProbe, null);
            return true;
        }

        if (args is ["--core-p37-probe"])
        {
            options = new CoreHostOptions(CoreHostMode.CoreP37Probe, null);
            return true;
        }

        if (args is ["--reader-lifecycle-client"])
        {
            options = new CoreHostOptions(CoreHostMode.ReaderLifecycleClient, null);
            return true;
        }

        if (args is ["--reader-capability-lifecycle-client"])
        {
            options = new CoreHostOptions(CoreHostMode.ReaderCapabilityLifecycleClient, null);
            return true;
        }

        if (args is ["--reader-p37-lifecycle-client"])
        {
            options = new CoreHostOptions(CoreHostMode.ReaderP37LifecycleClient, null);
            return true;
        }

        if (args.Length == 3
            && args[0] == "--synthetic-server"
            && args[1] == "--pipe-name"
            && IsValidPipeName(args[2]))
        {
            options = new CoreHostOptions(CoreHostMode.SyntheticServer, args[2]);
            return true;
        }

        if (args.Length == 3
            && args[0] == "--catalog-server"
            && args[1] == "--pipe-name"
            && IsValidPipeName(args[2]))
        {
            options = new CoreHostOptions(CoreHostMode.CatalogServer, args[2]);
            return true;
        }

        if (args.Length == 3
            && args[0] == "--catalog-controller-probe"
            && args[1] == "--pipe-name"
            && IsValidControllerProbePipeName(args[2]))
        {
            options = new CoreHostOptions(CoreHostMode.CatalogControllerProbe, args[2]);
            return true;
        }

        options = new CoreHostOptions(CoreHostMode.Describe, null);
        return false;
    }

    public static bool TryDecodeSecret(string? encodedSecret, out byte[] secret)
    {
        secret = [];
        if (string.IsNullOrWhiteSpace(encodedSecret)) return false;

        try
        {
            secret = Convert.FromBase64String(encodedSecret);
            return secret.Length == 32;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static bool IsValidPipeName(string value) =>
        value.Length is > 20 and <= 128
        && PipePrefixes.Any(prefix => value.StartsWith(prefix, StringComparison.Ordinal))
        && value.All(character => char.IsAsciiLetterOrDigit(character) || character == '-');

    private static bool IsValidControllerProbePipeName(string value) =>
        value.StartsWith("cap7ce-core-p32-", StringComparison.Ordinal)
        && value.Length == "cap7ce-core-p32-".Length + 32
        && value["cap7ce-core-p32-".Length..].All(character => character is >= '0' and <= '9' or >= 'a' and <= 'f');
}
