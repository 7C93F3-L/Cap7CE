using Cap7CE.Core.Protocol;

namespace Cap7CE.WinUI.Models;
internal static class FilterFactRules
{
    private static readonly string[] groups=["dimensions","aspect","duration","animation","colors","channels","font","document","three-d","model","text-data","archive"];
    public static int Count(CoreSearchFactFilter? facts)=>groups.Count(group=>Has(facts,group));
    public static bool Has(CoreSearchFactFilter? f,string group)
    {
        if(f is null)return false;
        return group switch {
            "dimensions"=>f.MinimumWidth is not null || f.MaximumWidth is not null || f.MinimumHeight is not null || f.MaximumHeight is not null || f.ShortEdgeRanges is {Count:>0},
            "aspect"=>f.MinimumAspectRatio is not null || f.MaximumAspectRatio is not null || f.AspectRanges is {Count:>0},
            "duration"=>f.MinimumDurationMilliseconds is not null || f.MaximumDurationMilliseconds is not null,
            "animation"=>f.IsAnimated is not null,"colors"=>f.VisualGroups is {Count:>0},"channels"=>f.ChannelRanges is {Count:>0},
            "font"=>f.Font is not null,"document"=>f.Document is not null,"three-d"=>f.ThreeD is not null,
            "model"=>f.Model is not null,"text-data"=>f.TextData is not null,"archive"=>f.Archive is not null,_=>false
        };
    }
}
