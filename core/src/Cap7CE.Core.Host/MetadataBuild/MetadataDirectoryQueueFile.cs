using System.Text.Json;

namespace Cap7CE.Core.Host.MetadataBuild;

public sealed class MetadataDirectoryQueueFile
{
    private readonly MetadataStateFile file;
    public MetadataDirectoryQueueFile(string directory) : this(new MetadataStateFile(Path.Combine(directory, "metadata-directory-build.json"))) { }
    internal MetadataDirectoryQueueFile(MetadataStateFile file) => this.file = file;
    public async Task<JsonElement?> LoadAsync(CancellationToken token = default)
    {
        try
        {
            var bytes = await file.ReadAsync(token); if (bytes is null) return null;
            using var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 128 });
            if (!MetadataBuildStateSchema.DirectoryQueue(document.RootElement)) throw new JsonException("metadata-directory-invalid-state");
            return document.RootElement.Clone();
        }
        catch (Exception error) when (error is JsonException or MetadataStateIOException) { throw new MetadataDirectoryStateException("read", error); }
    }
    public async Task SaveAsync(JsonElement value, CancellationToken token = default)
    {
        var snapshot = value.Clone();
        if (!MetadataBuildStateSchema.DirectoryQueue(snapshot)) throw new MetadataDirectoryStateException("validate", new InvalidDataException("metadata-directory-invalid-state"));
        try { await file.WriteAsync(MetadataBuildStateSchema.Encode(snapshot), token); }
        catch (MetadataStateIOException error) { throw new MetadataDirectoryStateException(error.Details.Operation, error); }
    }
}
