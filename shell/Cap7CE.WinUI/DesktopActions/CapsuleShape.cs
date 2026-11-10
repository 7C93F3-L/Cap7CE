namespace Cap7CE.WinUI.DesktopActions;
// Physical-pixel capsule geometry shared by drawing and native corner hit testing.
internal static class CapsuleShape
{
    public const double InsetPixels=.5;
    public static double RadiusPixels(int width,int height)=>Math.Max(0,(Math.Min(width,height)-2*InsetPixels)/2);
    public static double SignedDistance(int width,int height,double x,double y)
    {
        if(width<=1||height<=1)return double.NegativeInfinity;
        var radius=RadiusPixels(width,height);
        var cx=Math.Clamp(x,InsetPixels+radius,width-InsetPixels-radius);
        var cy=Math.Clamp(y,InsetPixels+radius,height-InsetPixels-radius);
        return radius-Math.Sqrt((x-cx)*(x-cx)+(y-cy)*(y-cy));
    }
    public static bool Contains(int width,int height,double x,double y)=>SignedDistance(width,height,x,y)>=0;
}
