using System.Text.Json;
using Cap7CE.Core.FileOperations;

namespace Cap7CE.Core.FileOperations.Host;

internal static class ItemRenameRequest
{
    public static void Dispatch(JsonElement root,Utf8JsonWriter writer)
    {
        if(!nuint.TryParse(root.GetProperty("owner").GetString(),out var owner))throw new InvalidDataException();
        var paths=root.GetProperty("paths").EnumerateArray().Select(item=>item.GetString()!).ToArray();
        ItemRenameResult result;
        try{result=WindowsItemRename.Execute(paths,root.GetProperty("name").GetString()!,owner);}
        catch(ArgumentException error){writer.WriteString("errorCode",error.Message.StartsWith("folder-rename-",StringComparison.Ordinal)?"invalid-name":"invalid-selection");return;}
        writer.WriteBoolean("success",result.Success);writer.WriteBoolean("cancelled",result.Cancelled);
        writer.WriteNumber("failed",result.Failed);writer.WriteNumber("error",result.Error);
        writer.WriteStartArray("changes");
        foreach(var item in result.Changes){writer.WriteStartObject();writer.WriteString("source",item.Source);writer.WriteString("path",item.Path);writer.WriteEndObject();}
        writer.WriteEndArray();
    }
}
