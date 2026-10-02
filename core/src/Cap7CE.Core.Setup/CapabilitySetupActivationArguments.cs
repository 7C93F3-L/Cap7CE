using System.Globalization;

namespace Cap7CE.Core.Setup;

internal sealed record CapabilitySetupActivationClientOptions(
    string PipeName,
    uint ServerProcessId,
    CapabilitySetupAction Action,
    CapabilityCatalogDisposition CatalogDisposition,
    IReadOnlyList<string> VolumeLetters);

internal static class CapabilitySetupActivationArguments
{
    public static bool IsClientRequest(string[] args) =>
        args is ["--activation-client", "--pipe-name", _, "--server-pid", _, "--action", _, "--catalog", _]
            or ["--activation-client", "--pipe-name", _, "--server-pid", _, "--action", _, "--catalog", _, "--volumes", _];

    public static bool TryParseClientRequest(
        string[] args,
        out CapabilitySetupActivationClientOptions options)
    {
        options = new(string.Empty, 0, default, default, Array.Empty<string>());
        if (!TryParseShape(args, out var pipeName, out var serverPidSource,
                out var actionSource, out var catalogSource, out var volumeLetters)
            || !uint.TryParse(serverPidSource, NumberStyles.None, CultureInfo.InvariantCulture, out var serverPid)
            || !CapabilitySetupArgumentValues.TryParseAction(actionSource, out var action)
            || !CapabilitySetupArgumentValues.TryParseCatalog(catalogSource, out var catalogDisposition)
            || (action == CapabilitySetupAction.Remove && volumeLetters.Count != 0))
        {
            return false;
        }

        options = new(pipeName, serverPid, action, catalogDisposition, volumeLetters);
        return true;
    }

    private static bool TryParseShape(
        string[] args,
        out string pipeName,
        out string serverPidSource,
        out string actionSource,
        out string catalogSource,
        out IReadOnlyList<string> volumeLetters)
    {
        pipeName = serverPidSource = actionSource = catalogSource = string.Empty;
        volumeLetters = Array.Empty<string>();
        switch (args)
        {
            case ["--activation-client", "--pipe-name", var pipeValue,
                    "--server-pid", var serverPidValue, "--action", var actionValue,
                    "--catalog", var catalogValue]:
                pipeName = pipeValue;
                serverPidSource = serverPidValue;
                actionSource = actionValue;
                catalogSource = catalogValue;
                return true;
            case ["--activation-client", "--pipe-name", var pipeValue,
                    "--server-pid", var serverPidValue, "--action", var actionValue,
                    "--catalog", var catalogValue, "--volumes", var volumesSource]
                when CapabilitySetupVolumeSelection.TryParseArgument(volumesSource, out volumeLetters):
                pipeName = pipeValue;
                serverPidSource = serverPidValue;
                actionSource = actionValue;
                catalogSource = catalogValue;
                return true;
            default:
                return false;
        }
    }
}
