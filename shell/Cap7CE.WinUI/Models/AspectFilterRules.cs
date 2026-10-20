using Cap7CE.Core.Protocol;

namespace Cap7CE.WinUI.Models;
internal static class AspectFilterRules
{
    public static readonly (int Width,int Height)[] Common=[(1,1),(4,3),(3,4),(3,2),(2,3),(16,9),(9,16),(4,5),(5,4)];
    public static CoreSearchAspectRange Around(int width,int height)
    {
        if(width is <1 or >100000 || height is <1 or >100000)throw new ArgumentOutOfRangeException(nameof(width));
        static CoreSearchRatio Ratio(int n,int d) {
            var a=n;var b=d;while(b!=0)(a,b)=(b,a%b);return new(n/a,d/a);
        }
        return new(Ratio(width*98,height*100),Ratio(width*102,height*100));
    }
    public static CoreSearchFactFilter ClearDimensions(CoreSearchFactFilter value)=>value with {MinimumWidth=null,MaximumWidth=null,MinimumHeight=null,MaximumHeight=null,ShortEdgeRanges=null};
    public static string Label(CoreSearchAspectRange range)
    {
        if(range.Minimum is {} min && range.Maximum is {} max && Math.Abs(min.Numerator/(double)min.Denominator/.98-max.Numerator/(double)max.Denominator/1.02)<1e-8) {
            long n=(long)min.Numerator*100,d=(long)min.Denominator*98,a=n,b=d;while(b!=0)(a,b)=(b,a%b);return $"{n/a}:{d/a}";
        }
        var low=range.Minimum is {} lower?(lower.Numerator/(double)lower.Denominator).ToString("0.##"):"0";
        var high=range.Maximum is {} upper?(upper.Numerator/(double)upper.Denominator).ToString("0.##"):"∞";
        return low+"–"+high;
    }
    public static CoreSearchFactFilter ClearAspect(CoreSearchFactFilter value)=>value with {AspectRanges=null,MinimumAspectRatio=null,MaximumAspectRatio=null};
    public static CoreSearchFactFilter? Normalize(CoreSearchFactFilter value)=>value==new CoreSearchFactFilter(value.Kind,value.ExtractorVersion)?null:value;
}
