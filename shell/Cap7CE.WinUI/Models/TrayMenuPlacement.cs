namespace Cap7CE.WinUI.Models;
internal static class TrayMenuPlacement
{
    public static (int X,int Y) Clamp(int x,int y,int left,int top,int width,int height)
        =>(Math.Clamp(x,left,left+Math.Max(0,width-2)),Math.Clamp(y,top,top+Math.Max(0,height-2)));
}
