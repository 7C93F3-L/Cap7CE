namespace Cap7CE.WinUI.Models;

internal static class FilterPresets
{
    public static readonly (string Id,string Label)[] Times=[("week","本周"),("month","本月"),("year","今年"),("last-year","去年"),("older","更早"),("all","不限")];
    private const long MB=1024*1024,GB=1024*MB;
    // Core's maximum file size is inclusive; subtract one for mainline preset upper bounds.
    public static readonly (string Label,long? Min,long? Max)[] Sizes=[("＜1 MB",null,MB-1),("1–10 MB",MB,10*MB-1),("10–100 MB",10*MB,100*MB-1),("100 MB–1 GB",100*MB,GB-1),("≥1 GB",GB,null)];
    public static BrowseFilter Time(BrowseFilter value,string preset,DateTime now)
    {
        var year=new DateTime(now.Year,1,1);var month=new DateTime(now.Year,now.Month,1);
        var monday=now.Date.AddDays(-(((int)now.DayOfWeek+6)%7));
        (DateTimeOffset? after,DateTimeOffset? before)=preset switch {
            "week"=>(new DateTimeOffset(monday),new DateTimeOffset(monday.AddDays(7))),
            "month"=>(new DateTimeOffset(month),new DateTimeOffset(month.AddMonths(1))),
            "year"=>(new DateTimeOffset(year),new DateTimeOffset(year.AddYears(1))),
            "last-year"=>(new DateTimeOffset(year.AddYears(-1)),new DateTimeOffset(year)),
            "older"=>(DateTimeOffset.UnixEpoch,new DateTimeOffset(year.AddYears(-1))),_=>((DateTimeOffset?)null,(DateTimeOffset?)null)
        };
        return value with {TimePreset=preset,After=after,Before=before};
    }
    public static string[] Extensions(BrowseFilter value) => value.Extensions.Length>0?value.Extensions:FormatRegistry.Extensions(value.Category);
    public static string[] QueryExtensions(BrowseFilter value)
    {var selected=Extensions(value);return value.ThreeDTypes.Length==0?selected:selected.Intersect(ThreeDFilterRules.Extensions(value.ThreeDTypes),StringComparer.OrdinalIgnoreCase).ToArray();}
    public static bool Selected(BrowseFilter value,string id)
    {
        if(id=="other")return value.Category==id;
        var group=FormatRegistry.Extensions(id);var selected=Extensions(value);
        return group.Length>0 && group.All(selected.Contains);
    }
    public static BrowseFilter ToggleType(BrowseFilter value,string id)
    {
        if(id=="other")return value with {Category=value.Category==id?"":"other",Extensions=[],ThreeDTypes=[],Facts=null};
        var selected=Extensions(value).ToHashSet(StringComparer.OrdinalIgnoreCase);var group=FormatRegistry.Extensions(id);
        if(group.All(selected.Contains))selected.ExceptWith(group);else selected.UnionWith(group);
        var next=value with {Category="",Extensions=selected.Order().ToArray(),ThreeDTypes=[]};
        return next with {Facts=RetainFacts(next,value.Facts)};
    }
    public static Cap7CE.Core.Protocol.CoreSearchFactFilter? RetainFacts(BrowseFilter next,Cap7CE.Core.Protocol.CoreSearchFactFilter? facts)
    {
        if(facts is null)return null;
        if(facts.Kind is "image-dimensions" or "video" or "audio")return Domain(next)==facts.Kind?facts:null;
        return AdvancedFilterRules.Groups.Any(group=>group.Kind==facts.Kind&&AdvancedFilterRules.Available(group,next)&&AdvancedFilterRules.Has(facts,group))?facts:null;
    }
    public static string Domain(BrowseFilter value)
    {
        var selected=Extensions(value);if(selected.Length==0)return "";
        var categories=selected.Select(ext=>ext==".pdf"?"document":FormatRegistry.Find(ext)?.Category??"").Distinct().ToArray();
        if(categories.Length!=1)return "";
        return categories[0] switch {"visual"=>"image-dimensions","threeD"=>"three-d","text" or "data"=>"text-data","video" or "audio" or "document" or "font" or "model" or "archive"=>categories[0],_=>""};
    }
}
