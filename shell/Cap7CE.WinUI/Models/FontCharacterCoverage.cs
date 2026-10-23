using System.Buffers.Binary;

namespace Cap7CE.WinUI.Models;

// Read only Unicode cmap formats 4/12. Unknown or malformed maps never claim coverage.
internal static class FontCharacterCoverage
{
    private static int U16(ReadOnlySpan<byte> bytes,int offset)=>BinaryPrimitives.ReadUInt16BigEndian(bytes[offset..]);
    private static uint U32(ReadOnlySpan<byte> bytes,int offset)=>BinaryPrimitives.ReadUInt32BigEndian(bytes[offset..]);
    public static bool Supports(ReadOnlySpan<byte> font,string text)
    {
        if(font.Length<12)return false;
        var tables=U16(font,4);if(12L+tables*16L>font.Length)return false;
        for(var i=0;i<tables;i++) {
            var table=12+i*16;if(!font.Slice(table,4).SequenceEqual("cmap"u8))continue;
            var offset=U32(font,table+8);var length=U32(font,table+12);
            if(length<4||(ulong)offset+length>(ulong)font.Length)return false;
            var cmap=font.Slice((int)offset,(int)length);var count=U16(cmap,2);
            if(4L+count*8L>cmap.Length)return false;
            for(var j=0;j<count;j++) {
                var record=4+j*8;var platform=U16(cmap,record);var encoding=U16(cmap,record+2);
                if(platform!=0&&(platform!=3||encoding is not (1 or 10)))continue;
                var subOffset=U32(cmap,record+4);if((ulong)subOffset+4>(ulong)cmap.Length)continue;
                var sub=cmap[(int)subOffset..];var format=U16(sub,0);
                var size=format==4?(uint)U16(sub,2):format==12&&sub.Length>=16?U32(sub,4):0;
                if(size<4||size>sub.Length)continue;
                sub=sub[..(int)size];var covered=true;
                foreach(var rune in text.EnumerateRunes())if(!HasGlyph(sub,format,rune.Value)){covered=false;break;}
                if(covered)return true;
            }
        }
        return false;
    }
    private static bool HasGlyph(ReadOnlySpan<byte> sub,int format,int code)
    {
        if(format==12&&sub.Length>=16) {
            var count=U32(sub,12);if(16UL+count*12UL>(ulong)sub.Length)return false;
            var low=0;var high=(int)count-1;
            while(low<=high) {
                var mid=low+(high-low)/2;var offset=16+mid*12;var start=U32(sub,offset);var end=U32(sub,offset+4);
                if(code<start)high=mid-1;else if(code>end)low=mid+1;
                else {var glyph=(ulong)U32(sub,offset+8)+(uint)code-start;return glyph is >0 and <=65535;}
            }
        }
        if(format==4&&sub.Length>=16&&code<=65535) {
            var count=U16(sub,6)/2;if(count==0||16L+count*8L>sub.Length)return false;
            var starts=16+count*2;var deltas=starts+count*2;var ranges=deltas+count*2;
            for(var i=0;i<count;i++) {
                if(code>U16(sub,14+i*2))continue;
                if(code<U16(sub,starts+i*2))return false;
                var delta=U16(sub,deltas+i*2);var range=U16(sub,ranges+i*2);
                if(range==0)return ((code+delta)&65535)!=0;
                var address=(long)ranges+i*2+range+2L*(code-U16(sub,starts+i*2));
                if(address<0||address+2>sub.Length)return false;
                var glyph=U16(sub,(int)address);return glyph!=0&&((glyph+delta)&65535)!=0;
            }
        }
        return false;
    }
}
