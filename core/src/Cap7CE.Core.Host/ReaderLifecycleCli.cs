using System.Security.Principal;
using System.Text.Json;

namespace Cap7CE.Core.Host;

public sealed record ReaderLifecycleCliReport(
    string Status,
    string? Reason,
    bool ClientStandard,
    bool ServiceStartedByClient,
    bool ServiceAlreadyRunning,
    bool ProhibitedServiceRightsDenied,
    bool ServiceAuthenticated,
    bool ExpectedBinaryPath,
    bool ExpectedBinaryVersion,
    bool DemandStart,
    bool RemoteClientsRejected,
    bool ElevationRequested,
    bool SourceFilesRead,
    bool SourceVolumeWritten,
    bool NetworkUsed);

public static class ReaderLifecycleCli
{
    public static async Task<ReaderLifecycleCliReport> RunAsync(CancellationToken cancellationToken)
    {
        RequireStandardClient();
        try
        {
            var start = await ReaderServiceController.EnsureStartedAsync(
                ReaderClientConstants.Lifecycle, cancellationToken);
            var fixture = await ReaderServiceClient.RunFixtureAsync(
                ReaderClientConstants.Lifecycle, cancellationToken);
            var identity = fixture.ServiceIdentity;
            return new(
                "passed", null, true,
                start.StartedByClient, start.AlreadyRunning, start.ProhibitedRightsDenied,
                identity.Passed, identity.ExpectedBinaryPath, identity.ExpectedBinaryVersion,
                identity.DemandStart, fixture.RemoteClientsRejected,
                false, false, false, false);
        }
        catch (ReaderRepairRequiredException error)
        {
            return Boundary("repair-required", error.Reason);
        }
        catch (ReaderServiceAccessDeniedException)
        {
            return Boundary("access-denied", "service-dacl");
        }
        catch (ReaderServiceUnavailableException)
        {
            return Boundary("not-installed", "service-missing");
        }
    }

    public static string Serialize(ReaderLifecycleCliReport report) => JsonSerializer.Serialize(report);

    private static ReaderLifecycleCliReport Boundary(string status, string reason) => new(
        status, reason, true,
        false, false, false, false, false, false, false, false,
        false, false, false, false);

    private static void RequireStandardClient()
    {
        using var identity = WindowsIdentity.GetCurrent();
        if (new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))
        {
            throw new UnauthorizedAccessException("reader-client-must-be-standard");
        }
    }
}
