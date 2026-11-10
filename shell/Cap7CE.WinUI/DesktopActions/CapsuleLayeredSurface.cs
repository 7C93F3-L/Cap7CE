using System.Runtime.InteropServices;
namespace Cap7CE.WinUI.DesktopActions;
// Owns the temporary GDI objects used to upload one native alpha-composited surface.
internal static class CapsuleLayeredSurface
{
    public static void Upload(nint window,int x,int y,int width,int height,byte[] pixels)
    {
        if(pixels.Length!=checked(width*height*4))throw new ArgumentException("Invalid shadow surface.");
        var screen=GetDC(0);if(screen==0)throw new System.ComponentModel.Win32Exception();
        nint dc=0,bitmap=0,previous=0;
        try{
            dc=CreateCompatibleDC(screen);if(dc==0)throw new System.ComponentModel.Win32Exception();
            var info=new BitmapInfo{Width=width,Height=-height};bitmap=CreateDIBSection(screen,ref info,0,out var bits,0,0);
            if(bitmap==0)throw new System.ComponentModel.Win32Exception();
            previous=SelectObject(dc,bitmap);if(previous==0||previous==-1)throw new System.ComponentModel.Win32Exception();
            Marshal.Copy(pixels,0,bits,pixels.Length);var destination=new Point{X=x,Y=y};var source=new Point();var size=new Size{Width=width,Height=height};var blend=new Blend();
            if(!UpdateLayeredWindow(window,screen,ref destination,ref size,dc,ref source,0,ref blend,2))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }finally{
            if(previous!=0&&previous!=-1&&dc!=0)SelectObject(dc,previous);
            if(bitmap!=0)DeleteObject(bitmap);if(dc!=0)DeleteDC(dc);ReleaseDC(0,screen);
        }
    }
    [StructLayout(LayoutKind.Sequential)] private struct Point {public int X,Y;}
    [StructLayout(LayoutKind.Sequential)] private struct Size {public int Width,Height;}
    [StructLayout(LayoutKind.Sequential)] private struct Blend {public byte Operation,Flags,Alpha,Format;public Blend(){Operation=Flags=0;Alpha=255;Format=1;}}
    [StructLayout(LayoutKind.Sequential)] private struct BitmapInfo
    {
        public uint Size;public int Width,Height;public ushort Planes,Bits;public uint Compression,ImageSize;public int XResolution,YResolution;public uint Colors,Important;
        public BitmapInfo(){this=default;Size=40;Planes=1;Bits=32;}
    }
    [DllImport("user32.dll")] private static extern nint GetDC(nint handle);
    [DllImport("user32.dll")] private static extern int ReleaseDC(nint handle,nint dc);
    [DllImport("gdi32.dll")] private static extern nint CreateCompatibleDC(nint dc);
    [DllImport("gdi32.dll")] private static extern bool DeleteDC(nint dc);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(nint item);
    [DllImport("gdi32.dll")] private static extern nint SelectObject(nint dc,nint item);
    [DllImport("gdi32.dll")] private static extern nint CreateDIBSection(nint dc,ref BitmapInfo info,uint usage,out nint bits,nint section,uint offset);
    [DllImport("user32.dll",SetLastError=true)] private static extern bool UpdateLayeredWindow(nint window,nint screen,ref Point destination,ref Size size,nint source,ref Point origin,uint key,ref Blend blend,uint flags);
}
