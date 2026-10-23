using System.Buffers.Binary;
using System.Text.Json;
using Cap7CE.WinUI.Models;

internal static class FontPreviewChecks
{
    public static void Run()
    {
        void Require(bool value,string message){if(!value)throw new Exception(message);}
        void W16(byte[] data,int offset,int value)=>BinaryPrimitives.WriteUInt16BigEndian(data.AsSpan(offset),(ushort)value);
        void W32(byte[] data,int offset,uint value)=>BinaryPrimitives.WriteUInt32BigEndian(data.AsSpan(offset),value);
        byte[] Font(byte[] sub,int encoding=1) {
            var font=new byte[40+sub.Length];W16(font,4,1);"cmap"u8.CopyTo(font.AsSpan(12));W32(font,20,28);W32(font,24,(uint)(12+sub.Length));
            W16(font,30,1);W16(font,32,3);W16(font,34,encoding);W32(font,36,12);sub.CopyTo(font,40);return font;
        }
        var letters=FontPreviewDocument.ChineseSample.Distinct().Order().ToArray();
        var sub12=new byte[16+letters.Length*12];W16(sub12,0,12);W32(sub12,4,(uint)sub12.Length);W32(sub12,12,(uint)letters.Length);
        for(var i=0;i<letters.Length;i++){var offset=16+i*12;W32(sub12,offset,letters[i]);W32(sub12,offset+4,letters[i]);W32(sub12,offset+8,(uint)i+1);}
        var font12=Font(sub12,10);Require(FontCharacterCoverage.Supports(font12,FontPreviewDocument.ChineseSample),"Format12 covers full requested sentence");
        Require(!FontCharacterCoverage.Supports(font12,"汉"),"Absent Chinese glyph");
        W32(sub12,24,0);Require(!FontCharacterCoverage.Supports(Font(sub12,10),FontPreviewDocument.ChineseSample),"Glyph zero must hide sentence");
        var count=letters.Length+1;var sub4=new byte[16+count*8];W16(sub4,0,4);W16(sub4,2,sub4.Length);W16(sub4,6,count*2);
        for(var i=0;i<count;i++) {
            var code=i<letters.Length?letters[i]:65535;
            W16(sub4,14+i*2,code);W16(sub4,16+count*2+i*2,code);W16(sub4,16+count*4+i*2,(1-code)&65535);
        }
        Require(FontCharacterCoverage.Supports(Font(sub4),FontPreviewDocument.ChineseSample),"Format4 Unicode BMP coverage");
        Require(!FontCharacterCoverage.Supports(Font(sub4,0),FontPreviewDocument.ChineseSample),"Symbol cmap must not claim Unicode coverage");
        Require(!FontCharacterCoverage.Supports(font12.AsSpan(0,43),FontPreviewDocument.ChineseSample),"Truncated font");
        using var metadata=JsonDocument.Parse("{\"familyName\":\"A <font>\",\"styleName\":\"Regular\",\"weight\":400}");
        var html=FontPreviewDocument.Render(metadata.RootElement,font12,true);
        Require(html.Contains(FontPreviewDocument.ChineseSample)&&html.Contains("abcdefghijklmnopqrstuvwxyz")&&html.Contains("ABCDEFGHIJKLMNOPQRSTUVWXYZ")&&html.Contains("0123456789"),"Specimen contents");
        Require(html.Contains("A &lt;font&gt;")&&html.Contains("background:transparent"),"Name escaping and transparent page");
        Require(html.Contains("body{background:transparent"),"Font specimen body cannot paint an opaque panel");
        html=FontPreviewDocument.Render(metadata.RootElement,new byte[12],false);
        Require(!html.Contains(FontPreviewDocument.ChineseSample),"No missing-glyph sentence or warning");
        Console.WriteLine("Font specimen checks passed (Unicode cmap4/cmap12, missing/zero glyphs, malformed fonts, specimen HTML).");
    }
}
