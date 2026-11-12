using System.Runtime.InteropServices;
namespace Cap7CE.WinUI.DesktopActions;
internal sealed record DesktopIconPixels(int Width,int Height,byte[] Pixels);
// Owns Shell image COM objects, HBITMAP and temporary GDI DC on a short-lived STA.
internal static class DesktopShellImage
{
    public static Task<DesktopIconPixels> ReadAsync(string path,CancellationToken token)=>DesktopShellApartment.RunAsync(()=>{
        var iid=typeof(IImageFactory).GUID;Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(path,0,ref iid,out var factory));
        nint bitmap=0,dc=0;
        try {
            factory.GetImage(new(32,32),4,out bitmap);
            if(GetObject(bitmap,Marshal.SizeOf<Bitmap>(),out var image)==0||image.Width is <=0 or >256||image.Height is <=0 or >256)throw new IOException("Invalid Shell icon size.");
            var info=new BitmapInfo{Size=40,Width=image.Width,Height=-image.Height,Planes=1,BitCount=32};
            var pixels=new byte[checked(image.Width*image.Height*4)];dc=CreateCompatibleDC(0);
            if(dc==0||GetDIBits(dc,bitmap,0,(uint)image.Height,pixels,ref info,0)!=(uint)image.Height)throw new IOException("Unable to read Shell icon.");
            return new DesktopIconPixels(image.Width,image.Height,pixels);
        }finally{if(dc!=0)DeleteDC(dc);if(bitmap!=0)DeleteObject(bitmap);DesktopShellApartment.Release(factory);}
    },token);
    [StructLayout(LayoutKind.Sequential)] private readonly struct Size(int width,int height){public readonly int Width=width,Height=height;}
    [StructLayout(LayoutKind.Sequential)] private struct Bitmap{public int Type,Width,Height,WidthBytes;public ushort Planes,BitsPixel;public nint Bits;}
    [StructLayout(LayoutKind.Sequential)] private struct BitmapInfo{public uint Size;public int Width,Height;public ushort Planes,BitCount;public uint Compression,ImageSize;public int XPels,YPels;public uint Used,Important;}
    [ComImport,Guid("BCC18B79-BA16-442F-80C4-8A59C30C463B"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IImageFactory{void GetImage(Size size,uint flags,out nint bitmap);}
    [DllImport("shell32.dll",CharSet=CharSet.Unicode,PreserveSig=true)] private static extern int SHCreateItemFromParsingName(string name,nint context,ref Guid iid,out IImageFactory image);
    [DllImport("gdi32.dll")] private static extern int GetObject(nint bitmap,int size,out Bitmap value);
    [DllImport("gdi32.dll")] private static extern nint CreateCompatibleDC(nint dc);
    [DllImport("gdi32.dll")] private static extern uint GetDIBits(nint dc,nint bitmap,uint start,uint lines,byte[] pixels,ref BitmapInfo info,uint usage);
    [DllImport("gdi32.dll")] private static extern bool DeleteDC(nint dc);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(nint value);
}
