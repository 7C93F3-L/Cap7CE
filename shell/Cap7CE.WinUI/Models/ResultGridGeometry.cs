namespace Cap7CE.WinUI.Models;

internal static class ResultGridGeometry
{
    public const double Gap=5;
    public static (int Columns,double Cell) FillWidth(double availableWidth,double preferredTileSize)
    {
        var width=double.IsFinite(availableWidth)?Math.Max(1,availableWidth):1;
        var preferred=double.IsFinite(preferredTileSize)?Math.Max(1,preferredTileSize):160;
        // Mainline catalogGridLayout keeps at least two square columns.
        var columns=Math.Max(2,(int)Math.Floor(width/(preferred+Gap)));
        return (columns,Math.Max(1,width/columns-Gap));
    }
    public static double CompactCell(double availableHeight, double preferredTileSize) =>
        Math.Max(1, Math.Min(138 * preferredTileSize / 160, availableHeight));
}
