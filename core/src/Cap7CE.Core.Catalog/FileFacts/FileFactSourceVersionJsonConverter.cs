using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Cap7CE.Core.Catalog.FileFacts;

// Decimal strings keep FILETIME/source fences exact across JavaScript boundaries.
public sealed class FileFactSourceVersionJsonConverter : JsonConverter<FileFactSourceVersion>
{
    public override FileFactSourceVersion Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.StartObject) throw new JsonException("Invalid source version.");
        var values = new long[4]; var seen = 0;
        while (reader.Read())
        {
            if (reader.TokenType == JsonTokenType.EndObject)
            {
                if (seen != 15) throw new JsonException("Source version fields are missing.");
                return new(values[0], values[1], values[2], values[3]);
            }
            if (reader.TokenType != JsonTokenType.PropertyName) throw new JsonException("Invalid source version field.");
            var index = reader.GetString() switch
            {
                "sizeBytes" => 0, "modifiedFileTime" => 1, "volumeEpoch" => 2, "contentRevision" => 3,
                _ => throw new JsonException("Unknown source version field.")
            };
            if ((seen & (1 << index)) != 0 || !reader.Read() || reader.TokenType != JsonTokenType.String)
                throw new JsonException("Source version fields must be unique decimal strings.");
            var value = reader.GetString();
            if (value is null || value.Length is < 1 or > 19
                || !long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out values[index]) || values[index] < 0)
                throw new JsonException("Source version is outside integer limits.");
            seen |= 1 << index;
        }
        throw new JsonException("Incomplete source version.");
    }

    public override void Write(Utf8JsonWriter writer, FileFactSourceVersion value, JsonSerializerOptions options)
    {
        if (value.SizeBytes < 0 || value.ModifiedFileTime < 0 || value.VolumeEpoch < 0 || value.ContentRevision < 0)
            throw new JsonException("Source version is outside integer limits.");
        writer.WriteStartObject();
        writer.WriteString("sizeBytes", value.SizeBytes.ToString(CultureInfo.InvariantCulture));
        writer.WriteString("modifiedFileTime", value.ModifiedFileTime.ToString(CultureInfo.InvariantCulture));
        writer.WriteString("volumeEpoch", value.VolumeEpoch.ToString(CultureInfo.InvariantCulture));
        writer.WriteString("contentRevision", value.ContentRevision.ToString(CultureInfo.InvariantCulture));
        writer.WriteEndObject();
    }
}
