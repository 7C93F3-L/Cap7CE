using System.Security.Principal;
using System.Text.Json;

namespace Cap7CE.Core.Host;

public sealed record ReaderFixtureCliReport(
    string Status,
    bool FixtureOnly,
    bool ClientStandard,
    bool ServiceAuthenticated,
    bool RestrictedServiceSid,
    bool MinimalServicePrivileges,
    bool DemandStart,
    bool LocalSystem,
    bool ExpectedBinaryPath,
    bool ExpectedBinaryVersion,
    bool ExcessiveRightsDenied,
    bool RemoteClientsRejected,
    int Pages,
    int Records,
    int JournalRecords,
    bool SourceFilesRead,
    bool NetworkUsed);

public static class ReaderFixtureCli
{
    public static async Task<ReaderFixtureCliReport> RunAsync(CancellationToken cancellationToken)
    {
        RequireStandardClient();
        var result = await ReaderServiceClient.RunFixtureAsync(cancellationToken);
        var identity = result.ServiceIdentity;
        return new(
            "passed",
            true,
            true,
            identity.Passed,
            identity.RestrictedServiceSid,
            identity.MinimalPrivileges,
            identity.DemandStart,
            identity.LocalSystem,
            identity.ExpectedBinaryPath,
            identity.ExpectedBinaryVersion,
            result.ExcessiveRightsDenied,
            result.RemoteClientsRejected,
            result.Pages,
            result.Records,
            result.JournalRecords,
            false,
            false);
    }

    public static async Task<ReaderFixtureCliReport> RunDisconnectAsync(CancellationToken cancellationToken)
    {
        RequireStandardClient();
        var identity = await ReaderServiceClient.ConnectAndDisconnectAsync(cancellationToken);
        return new(
            "disconnected",
            true,
            true,
            identity.Passed,
            identity.RestrictedServiceSid,
            identity.MinimalPrivileges,
            identity.DemandStart,
            identity.LocalSystem,
            identity.ExpectedBinaryPath,
            identity.ExpectedBinaryVersion,
            true,
            false,
            0,
            0,
            0,
            false,
            false);
    }

    public static string Serialize(ReaderFixtureCliReport report) => JsonSerializer.Serialize(report);

    private static void RequireStandardClient()
    {
        using var identity = WindowsIdentity.GetCurrent();
        if (new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))
        {
            throw new UnauthorizedAccessException("reader-client-must-be-standard");
        }
    }
}
