using System.Text.Json;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

// One request to the existing native Core host; never renames through UI filesystem APIs.
internal static class ItemRenameService
{
    public static async Task<JsonElement> ExecuteAsync(ShellServices services,IReadOnlyList<AssetItem> items,string name,nint owner)
    {
        var result=await NativeCoreRequest.SendAsync(Path.Combine(services.Root,"core/artifacts/file-operations-host/Cap7CE.Core.FileOperations.Host.exe"),[],
            new{version=1,operation="rename-items",paths=items.Select(item=>item.FullPath).ToArray(),name,owner=owner.ToString()});
        if(result.TryGetProperty("errorCode",out var error))throw new UiFailure(error.GetString()=="invalid-name"?"ui.rename.invalidName":"ui.rename.invalidSelection");
        foreach(var change in result.GetProperty("changes").EnumerateArray())
            if(!items.Any(item=>string.Equals(item.FullPath,change.GetProperty("source").GetString(),StringComparison.OrdinalIgnoreCase))
                ||change.GetProperty("path").GetString() is not {} path||!Path.IsPathFullyQualified(path)||path.Contains('\0'))throw new UiFailure("ui.rename.invalidResult");
        return result;
    }
}
