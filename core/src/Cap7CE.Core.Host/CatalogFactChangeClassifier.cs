namespace Cap7CE.Core.Host;

public static class CatalogFactChangeClassifier
{
    // Windows SDK winioctl.h USN_REASON_*: data/named data, create/delete,
    // EA/security, compression/encryption/reparse, stream/transacted changes.
    // Rename preserves content facts only when its format extension is unchanged.
    private const uint FactRelevantReasons = 0x00000077 | 0x00000F00 | 0x00760000;
    public static bool Invalidates(uint reason) => (reason & FactRelevantReasons) != 0;
    public static bool MayChangeFormat(uint reason) => (reason & 0x00003000) != 0;
}
