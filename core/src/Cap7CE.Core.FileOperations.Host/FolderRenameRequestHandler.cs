using System.Text.Json;
using Cap7CE.Core.Configuration;
using Cap7CE.Core.FileOperations;

namespace Cap7CE.Core.FileOperations.Host;

public static class FolderRenameRequestHandler
{
    public static void Dispatch(JsonElement root, Utf8JsonWriter writer)
    {
        var path = root.GetProperty("configurationPath").GetString()!;
        if (!Path.IsPathFullyQualified(path) || !path.EndsWith(".json", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException();
        using var lease = FavoriteConfigurationLease.Acquire(path);
        var workflow = new FolderRenameWorkflow(path);
        string Read(string key) => root.GetProperty(key).GetString()!;
        WindowsFileOperationResult? outcome = root.TryGetProperty("outcome", out var value) && value.ValueKind != JsonValueKind.Null
            ? new(value.GetProperty("status").GetString()!, value.TryGetProperty("path", out var target) ? target.GetString() : null,
                value.TryGetProperty("error", out var resultError) ? resultError.GetInt32() : 0) : null;
        try {
            var state = (root.GetProperty("operation").GetString() switch {
                "folder-rename-prepare" => workflow.PrepareAsync(Read("id"), Read("name")),
                "folder-rename-observe" => workflow.ObserveAsync(outcome),
                "folder-rename-recover" => workflow.RecoverAsync(),
                "folder-rename-complete" => workflow.CompleteAsync(Read("ticket")),
                _ => throw new ArgumentException()
            }).GetAwaiter().GetResult();
            writer.WriteBoolean("ok", true); writer.WriteString("kind", state.Kind); writer.WriteString("ticket", state.Ticket);
            writer.WritePropertyName("change");
            if (state.Record is { } record) {
                writer.WriteStartObject(); writer.WriteString("oldPath", record.OldPath); writer.WriteString("newPath", record.NewPath); writer.WriteEndObject();
            } else writer.WriteNullValue();
            writer.WritePropertyName("directories"); FavoriteDirectoryJson.WriteItems(writer, state.Directories);
        }
        catch (FavoriteConfigurationException error) { writer.WriteBoolean("ok", false); writer.WriteString("error", error.Code); }
    }
}
