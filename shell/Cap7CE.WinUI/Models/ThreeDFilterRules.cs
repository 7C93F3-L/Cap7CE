using System.Text.Json;

namespace Cap7CE.WinUI.Models;
internal sealed record ThreeDFilterType(string Id,string Label,string[] Extensions);
internal static class ThreeDFilterRules
{
    public static IReadOnlyList<ThreeDFilterType> Types {get;}=JsonSerializer.Deserialize<ThreeDFilterType[]>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets/filter-three-d-types.json")),new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    public static string[] Extensions(IReadOnlyList<string> ids)=>Types.Where(type=>ids.Contains(type.Id)).SelectMany(type=>type.Extensions).Distinct().ToArray();
    public static BrowseFilter Toggle(BrowseFilter value,string id)
    {
        var ids=value.ThreeDTypes.ToHashSet();if(!ids.Add(id))ids.Remove(id);
        var next=value with {ThreeDTypes=ids.Order().ToArray()};return next with {Facts=FilterPresets.RetainFacts(next,value.Facts)};
    }
}
