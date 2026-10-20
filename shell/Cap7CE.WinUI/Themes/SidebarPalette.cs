using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace Cap7CE.WinUI.Themes;

internal static class SidebarPalette
{
    public static void Apply(Color first,Color second)
    {
        var midpoint=Color.FromArgb(255,(byte)((first.R+second.R)/2),(byte)((first.G+second.G)/2),(byte)((first.B+second.B)/2));
        var luminance=new[]{first,midpoint,second}.Select(Luminance).ToArray();
        var black=luminance.Min(value=>(value+.05)/.05);
        var white=luminance.Min(value=>1.05/(value+.05));
        ((SolidColorBrush)Application.Current.Resources["CapSidebarSelectedForegroundBrush"]).Color =
            black>=white?Color.FromArgb(255,31,31,31):Color.FromArgb(255,255,255,255);
    }
    private static double Luminance(Color color)
    {
        static double Linear(byte value) {var part=value/255d;return part<=.04045?part/12.92:Math.Pow((part+.055)/1.055,2.4);}
        return .2126*Linear(color.R)+.7152*Linear(color.G)+.0722*Linear(color.B);
    }
}
