using System.Buffers.Binary;
using System.IO.Compression;
using Cap7CE.WinUI.DesktopActions;
internal static class CapsuleGlowChecks
{
    public static void Run()
    {
        void Check(bool value,string message){if(!value)throw new Exception(message);}
        var hover=CapsuleGlowTexture.Pixels(89,29,0x0088ff,0xee00cc,false);var active=CapsuleGlowTexture.Pixels(89,29,0x0088ff,0xee00cc,true);
        int Alpha(byte[] pixels,int x,int y)=>pixels[(y*89+x)*4+3];
        Check(Alpha(active,0,0)==0,"Rounded corners must remain transparent");
        Check(Alpha(active,44,1)>Alpha(hover,44,1)&&Alpha(active,44,5)>Alpha(hover,44,5),"Expanded glow must be brighter and extend further inwards");
        Check(Alpha(active,44,1)>Alpha(active,44,5)&&Alpha(active,44,5)>Alpha(active,44,9),"Glow must fade continuously toward the center");
        Check(Alpha(active,44,14)<8,"The center must retain its theme color without a white veil");
        var transposed=CapsuleGlowTexture.Pixels(29,89,0x0088ff,0xee00cc,true);
        for(var y=0;y<29;y++)for(var x=0;x<89;x++)for(var c=0;c<4;c++)Check(active[(y*89+x)*4+c]==transposed[(x*29+y)*4+c],"Glow and color must transpose exactly when docked vertically");
        var png=CapsuleGlowTexture.Png(89,29,0x0088ff,0xee00cc,true);Check(png.AsSpan(0,8).SequenceEqual(new byte[]{137,80,78,71,13,10,26,10}),"PNG signature");
        var offset=8;var chunks=new List<string>();using var compressed=new MemoryStream();
        while(offset<png.Length){var length=BinaryPrimitives.ReadInt32BigEndian(png.AsSpan(offset));var kind=System.Text.Encoding.ASCII.GetString(png,offset+4,4);chunks.Add(kind);
            uint crc=0xffffffff;foreach(var b in png.AsSpan(offset+4,length+4)){crc^=b;for(var bit=0;bit<8;bit++)crc=(crc>>1)^((crc&1)!=0?0xedb88320u:0);}
            Check(~crc==BinaryPrimitives.ReadUInt32BigEndian(png.AsSpan(offset+8+length)),"Every PNG chunk must have a valid CRC");
            if(kind=="IDAT")compressed.Write(png,offset+8,length);offset+=length+12;}
        Check(chunks.SequenceEqual(new[]{"IHDR","IDAT","IEND"}),"PNG chunk structure");compressed.Position=0;
        using var zip=new ZLibStream(compressed,CompressionMode.Decompress);using var decoded=new MemoryStream();zip.CopyTo(decoded);var bytes=decoded.ToArray();
        Check(bytes.Length==29*(89*4+1),"Decoded PNG scanline length");
        for(var row=0;row<29;row++)Check(bytes[row*(89*4+1)]==0&&bytes.AsSpan(row*(89*4+1)+1,89*4).SequenceEqual(active.AsSpan(row*89*4,89*4)),"PNG must preserve the exact RGBA field");
        try{CapsuleGlowTexture.Pixels(0,29,0,0,false);throw new Exception("Expected bounds rejection");}catch(ArgumentOutOfRangeException){}
        Console.WriteLine("Continuous capsule glow: smooth inward falloff, bright expanded state, colored center, transparent corners, rotation and PNG decode/CRC passed.");
    }
}
