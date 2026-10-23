using System.Buffers.Binary;

namespace Cap7CE.WinUI.Services;

// Only preview requests read animation bytes. No cache publication or source writes.
internal sealed record AnimationSource(byte[] Bytes,string MimeType,int Width,int Height)
{
    public static async Task<AnimationSource?> TryLoadAsync(string path,CancellationToken token)
    {
        var extension=Path.GetExtension(path).ToLowerInvariant();
        if(extension is not (".gif" or ".webp" or ".png" or ".apng"))return null;
        await using var file=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete,4096,true);
        var header=new byte[30];
        if(file.Length<header.Length)return null;
        await file.ReadExactlyAsync(header,token);
        var info=InspectHeader(header);
        if(info is null&&header.AsSpan(0,8).SequenceEqual(new byte[]{137,80,78,71,13,10,26,10})) {
            file.Position=8;
            for(var i=0;i<512&&file.Position+12<=file.Length;i++) {
                var chunk=new byte[8];await file.ReadExactlyAsync(chunk,token);
                var length=BinaryPrimitives.ReadUInt32BigEndian(chunk);
                if(length>file.Length-file.Position-4)break;
                if(chunk.AsSpan(4,4).SequenceEqual("acTL"u8)&&length==8) {
                    var control=new byte[8];await file.ReadExactlyAsync(control,token);
                    if(BinaryPrimitives.ReadUInt32BigEndian(control)>1)
                        info=("image/png",checked((int)BinaryPrimitives.ReadUInt32BigEndian(header.AsSpan(16))),checked((int)BinaryPrimitives.ReadUInt32BigEndian(header.AsSpan(20))));
                    break;
                }
                if(chunk.AsSpan(4,4).SequenceEqual("IDAT"u8)||chunk.AsSpan(4,4).SequenceEqual("IEND"u8))break;
                file.Position+=length+4;
            }
        }
        if(info is not {} value)return null;
        if(file.Length>64*1024*1024||value.Width<=0||value.Height<=0||(long)value.Width*value.Height>40_000_000)
            throw new IOException("动图超过预览上限（64 MiB / 4000万像素），请使用默认程序打开。");
        var bytes=new byte[checked((int)file.Length)];file.Position=0;
        await file.ReadExactlyAsync(bytes,token);token.ThrowIfCancellationRequested();
        return new(bytes,value.MimeType,value.Width,value.Height);
    }
    internal static (string MimeType,int Width,int Height)? InspectHeader(ReadOnlySpan<byte> header)
    {
        if(header.Length<30)return null;
        if(header[..6].SequenceEqual("GIF89a"u8)||header[..6].SequenceEqual("GIF87a"u8))
            return ("image/gif",BinaryPrimitives.ReadUInt16LittleEndian(header[6..]),BinaryPrimitives.ReadUInt16LittleEndian(header[8..]));
        if(header[..4].SequenceEqual("RIFF"u8)&&header.Slice(8,4).SequenceEqual("WEBP"u8)
            &&header.Slice(12,4).SequenceEqual("VP8X"u8)&&(header[20]&2)!=0) {
            static int UInt24(ReadOnlySpan<byte> bytes)=>1+bytes[0]+(bytes[1]<<8)+(bytes[2]<<16);
            return ("image/webp",UInt24(header[24..]),UInt24(header[27..]));
        }
        return null;
    }
}
