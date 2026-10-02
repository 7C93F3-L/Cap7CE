using System.Text.Json;
using Cap7CE.Core.Setup;

namespace Cap7CE.Core.Tests;

internal static class CapabilitySetupContractTests
{
    public static async Task RunAsync()
    {
        var manifest = CapabilitySetupManifest.LoadEmbedded();
        TestAssert.Equal("Microsoft.NETCore.App", manifest.Runtime.FrameworkName, "setup runtime framework");
        TestAssert.Equal("10.0.12", manifest.Runtime.MinimumVersion, "setup minimum runtime");
        TestAssert.Equal("foreground", manifest.Runtime.Presentation, "setup runtime presentation");
        TestAssert.True(manifest.Runtime.InstallArguments.SequenceEqual(["/install", "/norestart"]),
            "runtime install must remain foreground and suppress automatic restart");
        TestAssert.False(manifest.Runtime.InstallArguments.Contains("/quiet", StringComparer.OrdinalIgnoreCase),
            "runtime installer must not be silent");
        TestAssert.Equal("shared-external-never-remove", manifest.Ownership.Runtime,
            "shared Microsoft runtime ownership");
        TestAssert.True(manifest.SystemMutationImplemented,
            "P3.3b2 fixed development transaction entry is implemented");

        var missingRuntime = CapabilitySetupPlanner.Plan(new(
            CapabilitySetupAction.Enable,
            CapabilityRuntimeState.Missing,
            CapabilityInstallationState.NotInstalled,
            CapabilityOwnershipState.Unowned,
            CapabilityCatalogDisposition.Preserve), manifest);
        TestAssert.Equal(CapabilitySetupNextStep.LaunchRuntimeInstallerForeground, missingRuntime.NextStep,
            "missing runtime next step");
        TestAssert.False(missingRuntime.RequiresCap7CEElevation,
            "runtime prerequisite must not masquerade as Cap7CE elevation");
        TestAssert.True(missingRuntime.RequiresUserContinuation,
            "runtime prerequisite must stop for user-controlled continuation");
        TestAssert.False(missingRuntime.SystemChangesPerformed, "planner must be dry-run only");

        var restartRequired = CapabilitySetupPlanner.Plan(new(
            CapabilitySetupAction.Enable,
            CapabilityRuntimeState.RestartRequired,
            CapabilityInstallationState.NotInstalled,
            CapabilityOwnershipState.Unowned,
            CapabilityCatalogDisposition.Preserve), manifest);
        TestAssert.Equal(CapabilitySetupNextStep.AwaitRestart, restartRequired.NextStep,
            "runtime restart boundary");

        var install = CapabilitySetupPlanner.Plan(new(
            CapabilitySetupAction.Enable,
            CapabilityRuntimeState.Ready,
            CapabilityInstallationState.NotInstalled,
            CapabilityOwnershipState.Unowned,
            CapabilityCatalogDisposition.Preserve), manifest);
        TestAssert.Equal(CapabilitySetupNextStep.LaunchCapabilitySetupElevated, install.NextStep,
            "capability install next step");
        TestAssert.True(install.RequiresCap7CEElevation, "capability install elevation");

        var repair = CapabilitySetupPlanner.Plan(new(
            CapabilitySetupAction.Enable,
            CapabilityRuntimeState.Ready,
            CapabilityInstallationState.RepairNeeded,
            CapabilityOwnershipState.RequestingUser,
            CapabilityCatalogDisposition.Preserve), manifest);
        TestAssert.Equal("capability-repair-required", repair.Reason, "damaged capability repair plan");

        var ownerMissing = CapabilitySetupPlanner.Plan(new(
            CapabilitySetupAction.Remove,
            CapabilityRuntimeState.Ready,
            CapabilityInstallationState.Installed,
            CapabilityOwnershipState.Unowned,
            CapabilityCatalogDisposition.Preserve), manifest);
        TestAssert.Equal("installation-owner-missing", ownerMissing.Reason,
            "installed capability must have a recorded owner");

        var otherUser = CapabilitySetupPlanner.Plan(new(
            CapabilitySetupAction.Repair,
            CapabilityRuntimeState.Ready,
            CapabilityInstallationState.RepairNeeded,
            CapabilityOwnershipState.AnotherUser,
            CapabilityCatalogDisposition.Preserve), manifest);
        TestAssert.Equal("owned-by-another-user", otherUser.Reason, "second-account boundary");
        TestAssert.Equal(CapabilitySetupNextStep.Blocked, otherUser.NextStep, "second-account block");

        var remove = CapabilitySetupPlanner.Plan(new(
            CapabilitySetupAction.Remove,
            CapabilityRuntimeState.Ready,
            CapabilityInstallationState.Installed,
            CapabilityOwnershipState.RequestingUser,
            CapabilityCatalogDisposition.Remove), manifest);
        TestAssert.Equal(CapabilitySetupNextStep.LaunchCapabilitySetupElevated, remove.NextStep,
            "capability removal next step");
        TestAssert.True(remove.PreserveMicrosoftRuntime, "capability removal must preserve runtime");
        TestAssert.True(remove.RemoveCatalog, "explicit catalog removal choice");

        var missingRuntimeRemoval = CapabilitySetupPlanner.Plan(new(
            CapabilitySetupAction.Remove,
            CapabilityRuntimeState.Missing,
            CapabilityInstallationState.Installed,
            CapabilityOwnershipState.RequestingUser,
            CapabilityCatalogDisposition.Preserve), manifest);
        TestAssert.Equal("capability-remove-required-native", missingRuntimeRemoval.Reason,
            "NativeAOT setup must support removal without the shared runtime");
        TestAssert.True(missingRuntimeRemoval.RequiresCap7CEElevation,
            "runtime-independent removal remains an explicit capability elevation");

        var unavailableOutput = new StringWriter();
        var unavailableExitCode = await CapabilitySetupDryRunCli.RunAsync([], TextReader.Null, unavailableOutput);
        TestAssert.Equal(2, unavailableExitCode, "default setup exit code");
        TestAssert.True(unavailableOutput.ToString().Contains("setup-contract-only", StringComparison.Ordinal),
            "default setup must refuse mutation");

        var requestJson = JsonSerializer.Serialize(new
        {
            action = "enable",
            runtimeState = "missing",
            installationState = "notInstalled",
            ownershipState = "unowned",
            catalogDisposition = "preserve",
            supportedSystem = true
        });
        var dryRunOutput = new StringWriter();
        var dryRunExitCode = await CapabilitySetupDryRunCli.RunAsync(
            ["--dry-run-plan"], new StringReader(requestJson), dryRunOutput);
        TestAssert.Equal(0, dryRunExitCode, "setup dry-run exit code");
        TestAssert.True(dryRunOutput.ToString().Contains("launchRuntimeInstallerForeground", StringComparison.Ordinal),
            "setup dry-run foreground runtime plan");
        TestAssert.True(dryRunOutput.ToString().Contains("\"systemChangesPerformed\":false", StringComparison.Ordinal),
            "setup dry-run mutation report");

        var invalidOutput = new StringWriter();
        var invalidExitCode = await CapabilitySetupDryRunCli.RunAsync(
            ["--dry-run-plan"], new StringReader(requestJson[..^1] + ",\"path\":\"C:\\\\private\"}"), invalidOutput);
        TestAssert.Equal(2, invalidExitCode, "setup rejects unknown request fields");
        TestAssert.True(invalidOutput.ToString().Contains("invalid-dry-run-request", StringComparison.Ordinal),
            "setup invalid request reason");

        var payloadOutput = new StringWriter();
        var payloadExitCode = await CapabilitySetupPayloadCli.RunAsync(payloadOutput);
        TestAssert.Equal(2, payloadExitCode, "ordinary build has no embedded payload manifest");
        TestAssert.True(payloadOutput.ToString().Contains("payload-manifest-missing", StringComparison.Ordinal),
            "payload verification requires a build-time embedded manifest");
        TestAssert.True(payloadOutput.ToString().Contains("\"systemChangesPerformed\":false", StringComparison.Ordinal),
            "payload verification remains read-only");
    }
}
