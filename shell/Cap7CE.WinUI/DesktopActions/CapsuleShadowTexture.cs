namespace Cap7CE.WinUI.DesktopActions;
// Pure, bounded premultiplied BGRA shadow pixels. No theme or application state.
internal static class CapsuleShadowTexture
{
    public static int Padding(double scale)=>(int)Math.Ceiling(7*scale);
    public static byte[] Pixels(int bodyWidth,int bodyHeight,double scale)
    {
        if(bodyWidth<2||bodyHeight<2||bodyWidth>1024||bodyHeight>1024||!double.IsFinite(scale)||scale<.5||scale>8)throw new ArgumentOutOfRangeException(nameof(bodyWidth));
        var pad=Padding(scale);var width=bodyWidth+2*pad;var height=bodyHeight+2*pad;
        var result=new byte[checked(width*height*4)];var ambient=2.1*scale;var contact=.85*scale;
        for(var y=0;y<height;y++)for(var x=0;x<width;x++){
            var distance=Math.Max(0,-CapsuleShape.SignedDistance(bodyWidth,bodyHeight,x-pad+.5,y-pad+.5-1.1*scale));
            var alpha=.14*Math.Exp(-distance*distance/(2*ambient*ambient))+.09*Math.Exp(-distance*distance/(2*contact*contact));
            result[(y*width+x)*4+3]=(byte)Math.Round(alpha*255);
        }
        return result;
    }
}
