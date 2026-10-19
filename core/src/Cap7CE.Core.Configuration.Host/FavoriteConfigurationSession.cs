using System.Buffers.Binary;
using System.Text.Json;
using Cap7CE.Core.Configuration;

namespace Cap7CE.Core.Configuration.Host;

// One bounded request over private inherited streams. No listener, service or ambient polling.
public static class FavoriteConfigurationSession
{
    public static async Task RunAsync(FavoriteDirectoryRegistry registry, Stream input, Stream output, CancellationToken token)
    {
        var header = new byte[4]; await input.ReadExactlyAsync(header, token);
        var length = BinaryPrimitives.ReadInt32LittleEndian(header);
        if (length is < 2 or > FavoriteDirectoryRules.MaximumBytes) throw new InvalidDataException();
        var bytes = new byte[length]; await input.ReadExactlyAsync(bytes, token);
        using var reply = new MemoryStream();
        using (var writer = new Utf8JsonWriter(reply, new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }))
        {
            writer.WriteStartObject();
            try
            {
                using var document = JsonDocument.Parse(bytes); var root = document.RootElement;
                if (root.GetProperty("version").GetInt32() != 1) throw new FavoriteConfigurationException("favorite-directory-invalid-request");
                string? Read(string key) => root.TryGetProperty(key, out var value) ? value.GetString() : null;
                var items = await registry.ExecuteAsync(Read("operation")!, Read("id"), Read("path"), Read("name"), Read("direction"), Read("oldPath"), Read("newPath"), token);
                writer.WriteBoolean("ok", true); writer.WritePropertyName("directories"); FavoriteDirectoryJson.WriteItems(writer, items);
            }
            catch (Exception error) when (error is not (OutOfMemoryException or OperationCanceledException))
            {
                writer.WriteBoolean("ok", false); writer.WriteString("error", error is FavoriteConfigurationException known ? known.Code
                    : error is IOException or UnauthorizedAccessException ? "favorite-directories-storage-failed" : "favorite-directories-invalid-state");
            }
            writer.WriteEndObject();
        }
        if (reply.Length > FavoriteDirectoryRules.MaximumBytes + 128) throw new InvalidDataException();
        BinaryPrimitives.WriteInt32LittleEndian(header, checked((int)reply.Length));
        await output.WriteAsync(header, token); await output.WriteAsync(reply.ToArray(), token); await output.FlushAsync(token);
    }
}
