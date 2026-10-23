using System.Buffers.Binary;
using Cap7CE.WinUI.Services;

internal static class AnimationSourceChecks
{
    public static async Task RunAsync()
    {
        var root=Path.Combine(Path.GetTempPath(),"cap7ce-animation-"+Guid.NewGuid());Directory.CreateDirectory(root);
        void Require(bool value) {if(!value)throw new Exception("Animation source detection failed");}
        async Task<AnimationSource?> Load(string name,byte[] bytes) {
            var path=Path.Combine(root,name);await File.WriteAllBytesAsync(path,bytes);
            return await AnimationSource.TryLoadAsync(path,CancellationToken.None);
        }
        try {
            var gif=new byte[32];"GIF89a"u8.CopyTo(gif);gif[6]=24;gif[8]=16;
            var source=await Load("sample.GIF",gif);Require(source is {Width:24,Height:16,MimeType:"image/gif"}&&source.Bytes.SequenceEqual(gif));
            var webp=new byte[32];"RIFF"u8.CopyTo(webp);"WEBPVP8X"u8.CopyTo(webp.AsSpan(8));webp[20]=2;webp[24]=23;webp[27]=15;
            source=await Load("sample.webp",webp);Require(source is {Width:24,Height:16,MimeType:"image/webp"});
            webp[20]=0;Require(await Load("static.webp",webp) is null);
            var png=new byte[65];new byte[]{137,80,78,71,13,10,26,10}.CopyTo(png,0);
            BinaryPrimitives.WriteUInt32BigEndian(png.AsSpan(8),13);"IHDR"u8.CopyTo(png.AsSpan(12));
            BinaryPrimitives.WriteUInt32BigEndian(png.AsSpan(16),24);BinaryPrimitives.WriteUInt32BigEndian(png.AsSpan(20),16);
            BinaryPrimitives.WriteUInt32BigEndian(png.AsSpan(33),8);"acTL"u8.CopyTo(png.AsSpan(37));BinaryPrimitives.WriteUInt32BigEndian(png.AsSpan(41),2);
            Require(await Load("animated.png",png) is {Width:24,Height:16});Require(await Load("animated.apng",png) is not null);
            BinaryPrimitives.WriteUInt32BigEndian(png.AsSpan(41),1);Require(await Load("static.png",png) is null);
            BinaryPrimitives.WriteUInt32BigEndian(png.AsSpan(33),uint.MaxValue);Require(await Load("truncated.png",png) is null);
            Require(await Load("false-positive.gif",new byte[32]) is null);
            gif[6]=gif[7]=gif[8]=gif[9]=255;
            try {await Load("oversized.gif",gif);throw new Exception("Pixel budget was not enforced");}catch(IOException){}
            var path=Path.Combine(root,"cancel.gif");await File.WriteAllBytesAsync(path,new byte[32]);
            try {await AnimationSource.TryLoadAsync(path,new CancellationToken(true));throw new Exception("Cancellation ignored");}catch(OperationCanceledException){}
            Console.WriteLine("Animation source checks passed (GIF, WebP, PNG/APNG, static, malformed, limits, cancellation).");
        } finally {Directory.Delete(root,true);}
    }
}
