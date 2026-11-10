using Cap7CE.WinUI.DesktopActions;
internal static class CapsuleShadowChecks
{
    public static void Run()
    {
        void Check(bool value,string message){if(!value)throw new Exception(message);}
        foreach(var scale in new[]{1d,1.25,1.5,2,2.5}){
            var w=(int)Math.Round(90*scale);var h=(int)Math.Round(30*scale);var pad=CapsuleShadowTexture.Padding(scale);
            var pixels=CapsuleShadowTexture.Pixels(w,h,scale);var stride=w+2*pad;var rows=h+2*pad;
            int A(int x,int y)=>pixels[(y*stride+x)*4+3];
            Check(pixels.Length==stride*rows*4,"Shadow padding must contain the complete surface");
            Check(A(stride/2,rows-1)<=1&&A(stride/2,0)<=1&&A(0,rows/2)<=1&&A(stride-1,rows/2)<=1,"Shadow must fade before the native surface boundary");
            var near=pad+h+(int)Math.Round(scale);var far=pad+h+(int)Math.Round(4*scale);
            Check(A(stride/2,near)>A(stride/2,far)&&A(stride/2,far)>0,"Outside shadow must decay smoothly");
            Check(A(stride/2,pad+h+1)>A(stride/2,pad-2),"Shadow must be slightly offset downward");
            for(var i=0;i<pixels.Length;i+=4)Check(pixels[i]==0&&pixels[i+1]==0&&pixels[i+2]==0&&pixels[i+3]<=59,"Neutral shadow pixels must be bounded and premultiplied");
            Check(!CapsuleShape.Contains(w,h,-1,h/2d)&&!CapsuleShape.Contains(w,h,w/2d,h+1),"Visible shadow must not enlarge capsule input geometry");
        }
        Console.WriteLine("Capsule shadow: bounded alpha, smooth falloff, downward offset, transparent padding, DPI scaling and unchanged hit geometry passed.");
    }
}
