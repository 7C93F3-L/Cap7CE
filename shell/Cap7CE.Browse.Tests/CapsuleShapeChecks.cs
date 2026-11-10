using Cap7CE.WinUI.DesktopActions;
internal static class CapsuleShapeChecks
{
    public static void Run()
    {
        void Check(bool value,string message){if(!value)throw new Exception(message);}
        foreach(var dpi in new[]{96,120,144,192,240})foreach(var size in new[]{24,30,32,48}){
            var width=(int)Math.Round(size*dpi/96d);var height=width*3;var r=(width-1)/2d;
            Check(CapsuleShape.RadiusPixels(width,height)==r,"Endcaps must be semicircles at every supported size and DPI");
            Check(CapsuleShape.Contains(width,height,width/2d,.5)&&CapsuleShape.Contains(width,height,width/2d,height-.5),"Both semicircle tips belong to the same shape");
            Check(!CapsuleShape.Contains(width,height,0,0)&&!CapsuleShape.Contains(width,height,width-1,height-1),"Transparent corners must not be part of the capsule hit area");
            for(var y=0;y<height;y+=3)for(var x=0;x<width;x+=3)
                Check(CapsuleShape.Contains(width,height,x,y)==CapsuleShape.Contains(height,width,y,x),"Horizontal and vertical capsules must use identical geometry");
        }
        Check(!CapsuleShape.Contains(0,0,0,0),"Empty geometry cannot accept input");
        Console.WriteLine("Capsule semicircle geometry, transparent corners and horizontal/vertical DPI parity passed.");
    }
}
