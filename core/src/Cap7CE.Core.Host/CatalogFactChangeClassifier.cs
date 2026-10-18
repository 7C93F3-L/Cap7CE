namespace Cap7CE.Core.Host;

public static class CatalogFactChangeClassifier
{
    // Windows SDK winioctl.h USN_REASON_*: data/named data, create/delete,
    // EA/security, compression/encryption/reparse, stream/transacted changes.
    // Rename preserves content facts only when its format extension is unchanged.
    public static bool Invalidates(uint reason) => Cap7CE.Core.Catalog.FileFacts.FileFactChangeReasons.Invalidates(reason);
    public static bool MayChangeFormat(uint reason) => Cap7CE.Core.Catalog.FileFacts.FileFactChangeReasons.MayChangeFormat(reason);
}
