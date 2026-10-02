using System.Security.AccessControl;

namespace Cap7CE.Core.Setup;

internal static class CapabilitySetupServiceDacl
{
    private const uint GenericAll = 0x10000000;
    private const uint ServiceAllAccess = 0x000F01FF;

    public static bool Matches(byte[] actual, string expectedSddl)
    {
        var actualDescriptor = new RawSecurityDescriptor(actual, 0);
        var expectedDescriptor = new RawSecurityDescriptor(expectedSddl);
        return IsProtected(actualDescriptor) == IsProtected(expectedDescriptor)
            && Normalize(actualDescriptor).SequenceEqual(Normalize(expectedDescriptor));
    }

    private static bool IsProtected(RawSecurityDescriptor descriptor) =>
        descriptor.ControlFlags.HasFlag(ControlFlags.DiscretionaryAclProtected);

    private static IEnumerable<string> Normalize(RawSecurityDescriptor descriptor) =>
        (descriptor.DiscretionaryAcl ?? throw new InvalidDataException("service-dacl-missing"))
        .Cast<GenericAce>()
        .Select(ace => ace switch
        {
            CommonAce common => $"{common.SecurityIdentifier.Value}:{NormalizeMask(common.AccessMask)}:{common.AceQualifier}",
            _ => "unsupported-ace"
        })
        .Order(StringComparer.Ordinal);

    private static uint NormalizeMask(int mask) =>
        unchecked((uint)mask) == GenericAll ? ServiceAllAccess : unchecked((uint)mask);
}
