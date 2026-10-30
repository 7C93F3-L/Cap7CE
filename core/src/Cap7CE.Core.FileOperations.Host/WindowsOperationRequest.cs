using System.Text.Json;
using Cap7CE.Core.FileOperations;

namespace Cap7CE.Core.FileOperations.Host;

public static class WindowsOperationRequest
{
    public static void Dispatch(JsonElement root, Utf8JsonWriter writer)
    {
        if(root.GetProperty("operation").GetString()=="rename-items"){ItemRenameRequest.Dispatch(root,writer);return;}
        var source = root.GetProperty("path").GetString()!; var operation = root.GetProperty("operation").GetString();
        var result = operation == "trash" ? WindowsFileOperation.RecycleItem(source)
            : operation == "rename" && nuint.TryParse(root.GetProperty("owner").GetString(), out var owner)
            ? WindowsFileOperation.RenameDirectory(source, root.GetProperty("name").GetString()!, owner) : throw new InvalidDataException();
        writer.WriteString("status", result.Status); writer.WriteNumber("error", result.Error);
        if (result.Path is not null) writer.WriteString("path", result.Path);
    }
}
