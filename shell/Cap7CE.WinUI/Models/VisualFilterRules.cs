using System.Text.Json;
using Cap7CE.Core.Protocol;

namespace Cap7CE.WinUI.Models;

internal sealed record VisualFilterDefinition(string Id,bool Trait,bool Video,CoreSearchVisualConstraint[] Constraints);
internal static class VisualFilterRules
{
    public static IReadOnlyList<VisualFilterDefinition> Definitions {get;}=JsonSerializer.Deserialize<VisualFilterDefinition[]>(
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets/filter-visual-semantics.json")),new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    public static bool Selected(CoreSearchFactFilter? facts,string id)
    {
        var definition=Definitions.First(d=>d.Id==id);
        return facts?.VisualGroups?.Any(group=>group.Alternatives.Any(alternative=>alternative.SequenceEqual(definition.Constraints)))==true;
    }
    public static CoreSearchFactFilter Toggle(CoreSearchFactFilter facts,string id)
    {
        var selected=Definitions.Where(d=>Selected(facts,d.Id)).Select(d=>d.Id).ToHashSet();
        if(!selected.Add(id))selected.Remove(id);
        return Apply(facts,selected);
    }
    public static CoreSearchFactFilter Apply(CoreSearchFactFilter facts,IReadOnlySet<string> selected)
    {
        var groups=new List<CoreSearchVisualGroup>();
        foreach(var trait in new[]{false,true}) {
            var alternatives=Definitions.Where(d=>d.Trait==trait && selected.Contains(d.Id) && (facts.Kind!="video" || d.Video))
                .Select(d=>(IReadOnlyList<CoreSearchVisualConstraint>)d.Constraints).ToArray();
            if(alternatives.Length>0)groups.Add(new(alternatives));
        }
        return facts with {VisualGroups=groups.Count>0?groups:null};
    }
}
