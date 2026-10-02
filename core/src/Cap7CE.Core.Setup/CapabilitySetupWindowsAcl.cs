using System.Security.AccessControl;
using System.Security.Principal;

namespace Cap7CE.Core.Setup;

internal static class CapabilitySetupWindowsAcl
{
    private static readonly SecurityIdentifier LocalSystem = new(WellKnownSidType.LocalSystemSid, null);
    private static readonly SecurityIdentifier Administrators = new(WellKnownSidType.BuiltinAdministratorsSid, null);
    private static readonly SecurityIdentifier Users = new(WellKnownSidType.BuiltinUsersSid, null);

    public static void ApplyStateDirectory(string path) =>
        Apply(path,
        [
            Rule(LocalSystem, FileSystemRights.FullControl),
            Rule(Administrators, FileSystemRights.FullControl),
            Rule(TrustedInstaller(), FileSystemRights.FullControl)
        ]);

    public static void ApplyProgramDirectory(string path, SecurityIdentifier serviceSid) =>
        Apply(path,
        [
            Rule(LocalSystem, FileSystemRights.FullControl),
            Rule(Administrators, FileSystemRights.FullControl),
            Rule(TrustedInstaller(), FileSystemRights.FullControl),
            Rule(Users, FileSystemRights.ReadAndExecute),
            Rule(serviceSid, FileSystemRights.ReadAndExecute)
        ]);

    public static void ApplyDataDirectory(string path, SecurityIdentifier serviceSid) =>
        Apply(path,
        [
            Rule(LocalSystem, FileSystemRights.FullControl),
            Rule(Administrators, FileSystemRights.FullControl),
            Rule(TrustedInstaller(), FileSystemRights.FullControl),
            Rule(serviceSid, FileSystemRights.Modify)
        ]);

    public static void RequireProtected(string path)
    {
        var security = new DirectoryInfo(path).GetAccessControl(AccessControlSections.Access);
        if (!security.AreAccessRulesProtected)
        {
            throw new InvalidDataException("directory-acl-not-protected");
        }
    }

    private static void Apply(string path, IReadOnlyList<FileSystemAccessRule> rules)
    {
        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        foreach (var rule in rules) security.AddAccessRule(rule);
        new DirectoryInfo(path).SetAccessControl(security);
    }

    private static FileSystemAccessRule Rule(SecurityIdentifier sid, FileSystemRights rights) =>
        new(
            sid,
            rights,
            InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
            PropagationFlags.None,
            AccessControlType.Allow);

    private static SecurityIdentifier TrustedInstaller() =>
        (SecurityIdentifier)new NTAccount("NT SERVICE", "TrustedInstaller")
            .Translate(typeof(SecurityIdentifier));
}
