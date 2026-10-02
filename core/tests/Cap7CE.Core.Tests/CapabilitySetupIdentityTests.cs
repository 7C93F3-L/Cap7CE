using System.Diagnostics;
using System.Reflection;
using System.Security.Principal;
using Cap7CE.Core.Setup;

namespace Cap7CE.Core.Tests;

internal static class CapabilitySetupIdentityTests
{
    public static async Task RunAsync()
    {
        var pipeName = CapabilitySetupActivationPipe.CreateName();
        await using var server = CapabilitySetupActivationPipe.CreateServer(pipeName);
        using var client = StartClient(pipeName, Environment.ProcessId);
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(10));
        var authenticated = await CapabilitySetupActivationProtocol.ReceiveAsync(server)
            .AsTask().WaitAsync(TimeSpan.FromSeconds(10));
        await CapabilitySetupActivationProtocol.RespondAsync(
            server,
            new("passed", "identity-test", CapabilitySetupTransactionStatus.Succeeded,
                null, true, false));
        await client.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10));

        TestAssert.Equal(0, client.ExitCode, "setup activation identity client exit code");
        TestAssert.Equal(1, authenticated.Request.SchemaVersion, "setup activation schema version");
        TestAssert.Equal(CapabilitySetupAction.Enable, authenticated.Request.Action,
            "setup activation action comes from the pipe request");
        TestAssert.Equal(CapabilityCatalogDisposition.Preserve, authenticated.Request.CatalogDisposition,
            "setup activation catalog choice comes from the pipe request");
        TestAssert.Equal("E", authenticated.Request.VolumeLetters.Single(),
            "setup activation volume allowlist comes from the pipe request");
        using var currentIdentity = WindowsIdentity.GetCurrent();
        TestAssert.Equal(currentIdentity.User?.Value, authenticated.Requester.UserSid,
            "setup requester SID comes from the pipe client token");
        TestAssert.True(Path.IsPathFullyQualified(authenticated.Requester.LocalApplicationData),
            "setup requester LocalAppData comes from the pipe client token");
        TestAssert.Equal(client.Id, checked((int)authenticated.Requester.ProcessId),
            "setup requester PID comes from the pipe handle");

        var policy = CapabilitySetupWindowsPolicy.Create(authenticated.Requester);
        TestAssert.Equal(CapabilitySetupWindowsPolicy.DevelopmentServiceName,
            policy.ReaderService.ServiceName, "setup development service name is fixed");
        TestAssert.True(policy.Layout.CoreProgramDirectory.EndsWith(
            @"\Cap7CE\Core\v1", StringComparison.OrdinalIgnoreCase),
            "setup Core Program Files layout is fixed");
        TestAssert.True(policy.Layout.ReaderProgramDirectory.EndsWith(
            @"\Cap7CE\NtfsReader\v1", StringComparison.OrdinalIgnoreCase),
            "setup Reader Program Files layout is fixed");
        TestAssert.True(policy.Layout.ReaderDataDirectory.EndsWith(
            @"\Cap7CE\NtfsReader\v1", StringComparison.OrdinalIgnoreCase),
            "setup Reader ProgramData layout is fixed");
        TestAssert.Equal(authenticated.Requester.UserSid, policy.RequesterSid,
            "setup policy requester SID stays token-derived");
        TestAssert.True(policy.Layout.CatalogDirectory.StartsWith(
            authenticated.Requester.LocalApplicationData, StringComparison.OrdinalIgnoreCase),
            "setup Catalog layout stays inside token-derived LocalAppData");
        TestAssert.True(policy.ReaderService.ServiceDacl.Contains("0x00000015", StringComparison.Ordinal),
            "setup service grants requester only query-status-config-start");

        TestAssert.True(CapabilitySetupCoordinatorCli.TryParseRequest(
            ["--activation-coordinator", "--action", "remove", "--catalog", "preserve"],
            out var coordinatorAction,
            out var coordinatorCatalog,
            out var coordinatorVolumes),
            "setup coordinator accepts only the fixed action and catalog request");
        TestAssert.Equal(CapabilitySetupAction.Remove, coordinatorAction,
            "setup coordinator action remains closed");
        TestAssert.Equal(CapabilityCatalogDisposition.Preserve, coordinatorCatalog,
            "setup coordinator catalog choice remains closed");
        TestAssert.Equal(0, coordinatorVolumes.Count,
            "setup removal has no volume allowlist");
        TestAssert.True(CapabilitySetupCoordinatorCli.TryParseRequest(
            ["--activation-coordinator", "--action", "enable", "--catalog", "preserve",
                "--volumes", "E"],
            out var volumeAction,
            out var volumeCatalog,
            out var volumeLetters),
            "setup coordinator accepts a bounded uppercase volume allowlist");
        TestAssert.Equal(CapabilitySetupAction.Enable, volumeAction,
            "setup volume activation action remains closed");
        TestAssert.Equal(CapabilityCatalogDisposition.Preserve, volumeCatalog,
            "setup volume activation preserves the catalog");
        TestAssert.Equal("E", volumeLetters.Single(),
            "setup volume activation keeps the selected drive letter");
        TestAssert.True(!CapabilitySetupCoordinatorCli.TryParseRequest(
            ["--activation-coordinator", "--action", "remove", "--catalog", "preserve",
                "--path", @"C:\Other"],
            out _, out _, out _),
            "setup coordinator rejects free paths");
        TestAssert.True(!CapabilitySetupCoordinatorCli.TryParseRequest(
            ["--activation-coordinator", "--action", "unknown", "--catalog", "preserve"],
            out _, out _, out _),
            "setup coordinator rejects unknown actions");
        foreach (var rejected in new[]
        {
            new[] { "--activation-coordinator", "--action", "remove", "--catalog", "preserve", "--volumes", "E" },
            new[] { "--activation-coordinator", "--action", "enable", "--catalog", "preserve", "--volumes", "e" },
            new[] { "--activation-coordinator", "--action", "enable", "--catalog", "preserve", "--volumes", "E,E" },
            new[] { "--activation-coordinator", "--action", "enable", "--catalog", "preserve", "--volumes", @"E:\" }
        })
        {
            TestAssert.True(!CapabilitySetupCoordinatorCli.TryParseRequest(
                rejected, out _, out _, out _),
                "setup coordinator rejects unsafe or invalid volume allowlists");
        }
    }

    public static async Task<int> RunClientAsync(string pipeName, uint expectedServerProcessId)
    {
        await using var client = CapabilitySetupActivationPipe.CreateClient(pipeName);
        await client.ConnectAsync(5_000);
        var response = await CapabilitySetupActivationProtocol.SendAsync(
            client,
            expectedServerProcessId,
            new(1, CapabilitySetupAction.Enable, CapabilityCatalogDisposition.Preserve, ["E"]));
        return response.Status == "passed" && response.Reason == "identity-test" ? 0 : 3;
    }

    private static Process StartClient(string pipeName, int expectedServerProcessId)
    {
        var executable = Environment.ProcessPath
            ?? throw new InvalidOperationException("test executable path unavailable");
        var startInfo = new ProcessStartInfo
        {
            FileName = executable,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        if (Path.GetFileNameWithoutExtension(executable).Equals("dotnet", StringComparison.OrdinalIgnoreCase))
        {
            startInfo.ArgumentList.Add(Assembly.GetExecutingAssembly().Location);
        }
        startInfo.ArgumentList.Add("--setup-identity-client");
        startInfo.ArgumentList.Add(pipeName);
        startInfo.ArgumentList.Add(expectedServerProcessId.ToString(System.Globalization.CultureInfo.InvariantCulture));
        return Process.Start(startInfo) ?? throw new InvalidOperationException("setup identity client did not start");
    }
}
