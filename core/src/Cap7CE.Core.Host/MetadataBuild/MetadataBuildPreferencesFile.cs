using System.Text.Json;

namespace Cap7CE.Core.Host.MetadataBuild;

public sealed class MetadataBuildPreferencesFile
{
    private readonly MetadataStateFile file;
    public MetadataBuildPreferencesFile(string directory) : this(new MetadataStateFile(Path.Combine(directory, "metadata-build.json"))) { }
    internal MetadataBuildPreferencesFile(MetadataStateFile file) => this.file = file;
    public async Task<JsonElement?> LoadAsync(CancellationToken token = default)
    {
        try
        {
            var bytes = await file.ReadAsync(token); if (bytes is null) return null;
            using var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 128 });
            return MetadataBuildStateSchema.Preferences(document.RootElement) ? document.RootElement.Clone() : null;
        }
        catch (JsonException) { return null; }
        catch (MetadataStateIOException error) when (error.Details.Code == "INVALID_STATE") { return null; }
        catch (MetadataStateIOException error) { throw new IOException("metadata-build-preferences-unavailable", error); }
    }
    public Task SaveAsync(JsonElement value, CancellationToken token = default)
    {
        var snapshot = value.Clone();
        if (!MetadataBuildStateSchema.Preferences(snapshot)) throw new ArgumentException("metadata-build-invalid-preferences");
        return SaveBytesAsync(MetadataBuildStateSchema.Encode(snapshot), token);
    }
    private async Task SaveBytesAsync(byte[] bytes, CancellationToken token)
    {
        try { await file.WriteAsync(bytes, token); }
        catch (MetadataStateIOException error) { throw new IOException("metadata-build-preferences-unavailable", error); }
    }
}
