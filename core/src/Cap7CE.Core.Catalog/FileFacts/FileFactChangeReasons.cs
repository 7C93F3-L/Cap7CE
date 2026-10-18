namespace Cap7CE.Core.Catalog.FileFacts;

public static class FileFactChangeReasons
{
    private const uint FactRelevantReasons = 0x00000077 | 0x00000F00 | 0x00760000;
    public static bool Invalidates(uint reason) => (reason & FactRelevantReasons) != 0;
    public static bool MayChangeFormat(uint reason) => (reason & 0x00003000) != 0;
}
