namespace Cap7CE.WinUI.Models;

internal static class ResultGridGeometry
{
    public static double CompactCell(double availableHeight, double preferredTileSize) =>
        Math.Max(1, Math.Min(138 * preferredTileSize / 160, availableHeight));
}
