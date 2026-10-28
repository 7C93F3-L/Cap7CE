using System.Globalization;
using System.Text.Json;
using Cap7CE.Core.Protocol;

namespace Cap7CE.WinUI.Models;
internal sealed record MediaFilterOption(string Id,string Label,CoreSearchFactFilter Facts);
internal sealed record MediaFilterGroup(string Id,MediaFilterOption[] Options);
internal static class MediaFilterRules
{
    private static readonly MediaFilterGroup[] groups=JsonSerializer.Deserialize<MediaFilterGroup[]>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets/filter-media-options.json")),new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    public static IReadOnlyList<MediaFilterOption> Options(string group)=>groups.Single(g=>g.Id==group).Options;
    public static bool Selected(CoreSearchFactFilter f,MediaFilterOption choice,string scope)=>scope switch {
        "aspect"=>choice.Facts.AspectRanges!.All(r=>f.AspectRanges?.Contains(r)==true),
        "resolution"=>choice.Facts.ShortEdgeRanges!.All(r=>f.ShortEdgeRanges?.Contains(r)==true),
        "channels"=>choice.Facts.ChannelRanges!.All(r=>f.ChannelRanges?.Contains(r)==true),
        _=>f.MinimumDurationMilliseconds==choice.Facts.MinimumDurationMilliseconds&&f.MaximumDurationMilliseconds==choice.Facts.MaximumDurationMilliseconds
    };
    private static IReadOnlyList<T>? Union<T>(IReadOnlyList<T>? existing,IReadOnlyList<T> chosen)
    {
        var values=(existing??[]).ToList();var remove=chosen.All(values.Contains);
        foreach(var value in chosen){values.Remove(value);if(!remove)values.Add(value);}return values.Count>0?values:null;
    }
    public static CoreSearchFactFilter Toggle(CoreSearchFactFilter f,MediaFilterOption choice,string scope)=>scope switch {
        "aspect"=>f with {AspectRanges=Union(f.AspectRanges,choice.Facts.AspectRanges!),MinimumAspectRatio=null,MaximumAspectRatio=null},
        "resolution"=>AspectFilterRules.ClearDimensions(f) with {ShortEdgeRanges=Union(f.ShortEdgeRanges,choice.Facts.ShortEdgeRanges!)},
        "channels"=>f with {ChannelRanges=Union(f.ChannelRanges,choice.Facts.ChannelRanges!)},
        _=>f with {MinimumDurationMilliseconds=Selected(f,choice,scope)?null:choice.Facts.MinimumDurationMilliseconds,MaximumDurationMilliseconds=Selected(f,choice,scope)?null:choice.Facts.MaximumDurationMilliseconds}
    };
    public static long Milliseconds(double seconds,bool up)
    {
        if(!double.IsFinite(seconds)||seconds<0||seconds>604800)throw new ArgumentOutOfRangeException(nameof(seconds));
        var value=decimal.Parse(seconds.ToString("R",CultureInfo.InvariantCulture),NumberStyles.Float,CultureInfo.InvariantCulture)*1000;
        return (long)(up?decimal.Ceiling(value):decimal.Floor(value));
    }
    public static string DimensionLabel(CoreSearchFactFilter f)
    {
        if(!FilterFactRules.Has(f,"dimensions"))return "";
        if(f.MinimumWidth is {} w&&f.MinimumHeight is {} h&&f.MaximumWidth==w&&f.MaximumHeight==h)return $"{w} × {h}";
        if(f.MinimumWidth is {} minW&&f.MinimumHeight is {} minH&&f.MaximumWidth is null&&f.MaximumHeight is null)return $"≥ {minW} × {minH}";
        return "";
    }
}
