using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;

namespace Cap7CE.Core.Setup;

public static class CapabilitySetupActivationPipe
{
    private const string Prefix = "cap7ce-setup-";

    public static string CreateName() => $"{Prefix}{Guid.NewGuid():N}";

    public static NamedPipeServerStream CreateServer(string pipeName)
    {
        ValidateName(pipeName);
        var security = new PipeSecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        AddRule(security, WellKnownSidType.LocalSystemSid, PipeAccessRights.FullControl);
        AddRule(security, WellKnownSidType.BuiltinAdministratorsSid, PipeAccessRights.FullControl);
        AddRule(security, WellKnownSidType.AuthenticatedUserSid, PipeAccessRights.ReadWrite);
        return NamedPipeServerStreamAcl.Create(
            pipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous | PipeOptions.WriteThrough,
            4096,
            4096,
            security);
    }

    public static NamedPipeClientStream CreateClient(string pipeName)
    {
        ValidateName(pipeName);
        return new NamedPipeClientStream(
            ".", pipeName, PipeDirection.InOut,
            PipeOptions.Asynchronous | PipeOptions.WriteThrough);
    }

    private static void ValidateName(string pipeName)
    {
        if (pipeName.Length != Prefix.Length + 32
            || !pipeName.StartsWith(Prefix, StringComparison.Ordinal)
            || !pipeName[Prefix.Length..].All(character => character is >= '0' and <= '9' or >= 'a' and <= 'f'))
        {
            throw new InvalidDataException("invalid-activation-pipe");
        }
    }

    private static void AddRule(
        PipeSecurity security,
        WellKnownSidType sidType,
        PipeAccessRights rights) =>
        security.AddAccessRule(new PipeAccessRule(
            new SecurityIdentifier(sidType, null), rights, AccessControlType.Allow));
}
