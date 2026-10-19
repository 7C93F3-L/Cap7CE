using System.Text.Json;
using System.Text.Json.Nodes;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.MetadataBuild;

// Own the original JSON tree so an intent edit cannot erase unknown legacy members.
internal sealed class MetadataDirectoryQueueState
{
    private readonly JsonObject value;
    internal MetadataDirectoryQueueState(JsonElement? saved = null)
    {
        if (saved is not null && !MetadataBuildStateSchema.DirectoryQueue(saved.Value)) throw new MetadataDirectoryStateException("read", new InvalidDataException("metadata-directory-invalid-state"));
        value = saved is null ? new JsonObject { ["version"] = 1, ["intent"] = "active", ["jobs"] = new JsonArray() }
            : JsonNode.Parse(saved.Value.GetRawText(), documentOptions: new JsonDocumentOptions { MaxDepth = 128 })!.AsObject();
    }
    private JsonArray Items => value["jobs"]!.AsArray();
    internal string Intent { get => value["intent"]!.GetValue<string>(); set => this.value["intent"] = value; }
    internal int Count => Items.Count;
    internal MetadataDirectoryJob First => new(Items[0]!.AsObject());
    internal bool Contains(string path) => Items.Any(item => string.Equals(item!["path"]!.GetValue<string>(), path, StringComparison.OrdinalIgnoreCase));
    internal void Add(MetadataDirectoryJob job) => Items.Add(job.Value);
    internal void RemoveFirst() => Items.RemoveAt(0);
    internal void Clear() => Items.Clear();
    internal JsonElement Snapshot() => MetadataBuildStateSchema.Element(value.DeepClone().AsObject());
}

internal sealed class MetadataDirectoryJob
{
    internal JsonObject Value { get; }
    internal MetadataDirectoryJob(JsonObject value) => Value = value;
    internal MetadataDirectoryJob(string path, FileFactScope? scope = null)
    {
        Value = new JsonObject { ["path"] = path }; if (scope is not null) Scope = scope;
    }
    internal string Path => Value["path"]!.GetValue<string>();
    internal FileFactScope? Scope
    {
        get => Value["scope"] is JsonObject scope ? new(scope["volumeId"]!.GetValue<string>(), scope["rootFileReference"]?.GetValue<string>()) : null;
        set => Value["scope"] = value is null ? null : JsonSerializer.SerializeToNode(value, CoreProtocolJson.Options);
    }
}
