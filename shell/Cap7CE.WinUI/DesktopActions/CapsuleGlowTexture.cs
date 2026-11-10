using System.Buffers.Binary;
using System.IO.Compression;
namespace Cap7CE.WinUI.DesktopActions;
// Pure, bounded RGBA rendering. Signed distance gives a continuous inner glow and smooth endcaps.
internal static class CapsuleGlowTexture
{
    public static byte[] Pixels(int width,int height,uint first,uint second,bool selected)
    {
        if(width<2||height<2||width>1024||height>1024)throw new ArgumentOutOfRangeException(nameof(width));
        var pixels=new byte[checked(width*height*4)];var radius=Math.Min(width,height)/2d;
        var vertical=height>width;var sigma=Math.Min(width,height)*(selected?.24:.17);
        var tint=selected?.97:.78;var strength=selected?1:.84;
        for(var y=0;y<height;y++)for(var x=0;x<width;x++){
            var dx=x+.5-Math.Clamp(x+.5,radius,width-radius);var dy=y+.5-Math.Clamp(y+.5,radius,height-radius);
            var distance=radius-Math.Sqrt(dx*dx+dy*dy);var coverage=Math.Clamp(distance+.5,0,1);
            var alpha=coverage*strength*Math.Exp(-Math.Pow(Math.Max(0,distance)/sigma,2));
            var mix=vertical?y/(height-1d):x/(width-1d);var offset=(y*width+x)*4;
            for(var c=0;c<3;c++){
                var shift=16-c*8;var a=(first>>shift)&255;var b=(second>>shift)&255;
                var color=a+((double)b-a)*mix;pixels[offset+c]=(byte)Math.Round(color+(255-color)*tint);
            }
            pixels[offset+3]=(byte)Math.Round(255*alpha);
        }
        return pixels;
    }
    public static byte[] Png(int width,int height,uint first,uint second,bool selected)
    {
        var pixels=Pixels(width,height,first,second,selected);
        using var file=new MemoryStream();file.Write(new byte[]{137,80,78,71,13,10,26,10});
        var header=new byte[13];BinaryPrimitives.WriteInt32BigEndian(header,width);BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(4),height);header[8]=8;header[9]=6;
        Chunk(file,"IHDR",header);
        using var compressed=new MemoryStream();
        using(var zip=new ZLibStream(compressed,CompressionLevel.Fastest,true))for(var row=0;row<height;row++){
            zip.WriteByte(0);zip.Write(pixels,row*width*4,width*4);
        }
        Chunk(file,"IDAT",compressed.ToArray());Chunk(file,"IEND",[]);return file.ToArray();
    }
    private static void Chunk(Stream stream,string kind,byte[] data)
    {
        var type=System.Text.Encoding.ASCII.GetBytes(kind);Span<byte> value=stackalloc byte[4];
        BinaryPrimitives.WriteInt32BigEndian(value,data.Length);stream.Write(value);stream.Write(type);stream.Write(data);
        var crc=0xffffffffu;foreach(var b in type)crc=Step(crc,b);foreach(var b in data)crc=Step(crc,b);
        BinaryPrimitives.WriteUInt32BigEndian(value,~crc);stream.Write(value);
    }
    private static uint Step(uint crc,byte value){crc^=value;for(var bit=0;bit<8;bit++)crc=(crc>>1)^((crc&1)!=0?0xedb88320u:0);return crc;}
}
