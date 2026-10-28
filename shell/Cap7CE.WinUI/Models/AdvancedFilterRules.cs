using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Cap7CE.Core.Protocol;

namespace Cap7CE.WinUI.Models;
internal sealed record AdvancedFilterOption(string Id,string Label,JsonElement Facts);
internal sealed record AdvancedFilterGroup(string Id,string Title,string Kind,string[] Allowed,string[] Any,string[] Fields,string Mode,string Range,long Maximum,long Minimum,AdvancedFilterOption[] Options);

// Only generated, bounded Protocol leaf fields are mutable; kind/version remain with the session.
internal static class AdvancedFilterRules
{
    private static readonly JsonSerializerOptions json=new(JsonSerializerDefaults.Web){DefaultIgnoreCondition=JsonIgnoreCondition.WhenWritingNull};
    public static IReadOnlyList<AdvancedFilterGroup> Groups {get;}=Load();
    private static AdvancedFilterGroup[] Load()
    {
        var groups=JsonSerializer.Deserialize<AdvancedFilterGroup[]>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets/filter-advanced-options.json")),json)!;
        foreach(var group in groups) {
            if(group.Fields.Length is <1 or >2 || group.Options.Length is <1 or >12 || group.Mode is not ("single" or "union" or "flags")
                || group.Fields.Any(field=>field.Split('.') is not ["document" or "threeD" or "font" or "model" or "textData" or "archive",_]))
                throw new InvalidDataException("invalid-native-filter-data");
        }
        return groups;
    }
    private static JsonObject Node(CoreSearchFactFilter facts)=>JsonSerializer.SerializeToNode(facts,json)!.AsObject();
    private static JsonNode? Get(JsonNode? node,string path) {foreach(var key in path.Split('.'))node=(node as JsonObject)?[key];return node;}
    private static void Set(JsonObject node,string path,JsonNode? value)
    {
        var keys=path.Split('.');if(node[keys[0]] is not JsonObject)node[keys[0]]=new JsonObject();node[keys[0]]![keys[1]]=value?.DeepClone();
    }
    private static JsonObject Source(AdvancedFilterOption option)=>JsonNode.Parse(option.Facts.GetRawText())!.AsObject();
    public static bool Available(AdvancedFilterGroup group,BrowseFilter filter)
    {
        var extensions=FilterPresets.QueryExtensions(filter);
        return extensions.Length>0&&extensions.All(group.Allowed.Contains)&&(group.Any.Length==0||extensions.Any(group.Any.Contains));
    }
    private static bool SameTextKind(JsonObject node,AdvancedFilterGroup group)
    {if(group.Kind!="text-data")return true;var expected=Get(Source(group.Options[0]),"textData.factKind");return expected is null||JsonNode.DeepEquals(expected,Get(node,"textData.factKind"));}
    public static bool Has(CoreSearchFactFilter facts,AdvancedFilterGroup group)
    {if(group.Kind!=facts.Kind)return false;var node=Node(facts);return SameTextKind(node,group)&&group.Fields.Any(path=>Get(node,path) is {} value&&value is not JsonArray {Count:0});}
    public static bool Selected(CoreSearchFactFilter facts,AdvancedFilterGroup group,AdvancedFilterOption option)
    {
        if(facts.Kind!=group.Kind)return false;
        var current=Node(facts);var source=Source(option);if(!SameTextKind(current,group))return false;
        if(group.Mode=="union") {
            var values=Get(current,group.Fields[0]) as JsonArray;var expected=Get(source,group.Fields[0])!.AsArray();
            return values is not null&&expected.All(wanted=>values.Any(value=>JsonNode.DeepEquals(value,wanted)));
        }
        return group.Fields.Where(path=>group.Mode!="flags"||Get(source,path) is not null).All(path=>JsonNode.DeepEquals(Get(current,path),Get(source,path)));
    }
    public static CoreSearchFactFilter? Toggle(CoreSearchFactFilter facts,AdvancedFilterGroup group,AdvancedFilterOption option)
    {
        var current=Node(facts);var source=Source(option);var selected=Selected(facts,group,option);
        if(group.Mode=="union") {
            var values=(Get(current,group.Fields[0])?.DeepClone() as JsonArray)??new JsonArray();
            foreach(var expected in Get(source,group.Fields[0])!.AsArray()) {
                for(var i=values.Count-1;i>=0;i--)if(JsonNode.DeepEquals(values[i],expected))values.RemoveAt(i);
                if(!selected)values.Add(expected?.DeepClone());
            }
            Set(current,group.Fields[0],values.Count>0?values:null);
        }
        else foreach(var field in group.Fields.Where(path=>group.Mode!="flags"||Get(source,path) is not null))Set(current,field,selected?null:Get(source,field));
        ApplyTextKind(current,source);return Read(current);
    }
    public static CoreSearchFactFilter? Clear(CoreSearchFactFilter facts,AdvancedFilterGroup group)
    {var node=Node(facts);foreach(var field in group.Fields)Set(node,field,null);return Read(node);}
    public static (long? Min,long? Max,int Count) Bounds(CoreSearchFactFilter facts,AdvancedFilterGroup group)
    {
        var node=Node(facts);
        if(group.Range=="array") {
            var array=Get(node,group.Fields[0]) as JsonArray;
            return ((long?)array?.FirstOrDefault()?["minimum"],(long?)array?.FirstOrDefault()?["maximum"],array?.Count??0);
        }
        return ((long?)Get(node,group.Fields[0]),(long?)Get(node,group.Fields[1]),0);
    }
    public static CoreSearchFactFilter? ApplyRange(CoreSearchFactFilter facts,AdvancedFilterGroup group,long? min,long? max)
    {
        if(group.Range is not ("array" or "scalar") || min<group.Minimum || max<group.Minimum || min>group.Maximum || max>group.Maximum || min>max)throw new ArgumentOutOfRangeException(nameof(min));
        var node=Node(facts);
        if(group.Range=="array")Set(node,group.Fields[0],min is null&&max is null?null:new JsonArray(new JsonObject{["minimum"]=min,["maximum"]=max}));
        else {Set(node,group.Fields[0],JsonSerializer.SerializeToNode(min));Set(node,group.Fields[1],JsonSerializer.SerializeToNode(max));}
        ApplyTextKind(node,Source(group.Options[0]));return Read(node);
    }
    private static void ApplyTextKind(JsonObject node,JsonObject source)
    {if(Get(source,"textData.factKind") is {} kind)Set(node,"textData.factKind",kind);}
    private static CoreSearchFactFilter? Read(JsonObject node)
    {
        foreach(var key in new[]{"document","threeD","font","model","textData","archive"})
            if(node[key] is JsonObject payload&&payload.Where(pair=>pair.Key!="factKind").All(pair=>pair.Value is null||pair.Value is JsonArray {Count:0}))node[key]=null;
        return AspectFilterRules.Normalize(node.Deserialize<CoreSearchFactFilter>(json)!);
    }
}
