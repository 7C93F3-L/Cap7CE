using System.Buffers.Binary;
using System.Text.Json;
using Cap7CE.Core.FileOperations;

if (args is ["--describe"]) { Console.WriteLine("{\"protocol\":\"file-operations/1\",\"runtimeRequired\":false}"); return 0; }
if (args.Length != 0) return 2;
try
{
    using var input = Console.OpenStandardInput(); using var output = Console.OpenStandardOutput();
    var header = new byte[4]; input.ReadExactly(header); var length = BinaryPrimitives.ReadInt32LittleEndian(header);
    if (length is < 2 or > 1024 * 1024) return 2;
    var bytes = new byte[length]; input.ReadExactly(bytes); using var document = JsonDocument.Parse(bytes); var root = document.RootElement;
    if (root.GetProperty("version").GetInt32() != 1) return 2;
    var source = root.GetProperty("path").GetString();
    if (source is null || source.Length > 32767 || source.IndexOf('\0') >= 0 || !Path.IsPathFullyQualified(source)
        || Path.GetPathRoot(source)?.TrimEnd('\\', '/') == source.TrimEnd('\\', '/')) return 2;
    var operation = root.GetProperty("operation").GetString();
    var result = operation == "trash" ? WindowsFileOperation.RecycleItem(source)
        : operation == "rename" && root.GetProperty("name").GetString() is { } name && ValidName(name)
            && nuint.TryParse(root.GetProperty("owner").GetString(), out var owner)
        ? WindowsFileOperation.RenameDirectory(source, name, owner) : throw new InvalidDataException();
    using var response = new MemoryStream();
    using (var writer = new Utf8JsonWriter(response)) {
        writer.WriteStartObject(); writer.WriteString("status", result.Status); writer.WriteNumber("error", result.Error);
        if (result.Path is not null) writer.WriteString("path", result.Path); writer.WriteEndObject();
    }
    BinaryPrimitives.WriteInt32LittleEndian(header, checked((int)response.Length)); output.Write(header); output.Write(response.ToArray()); output.Flush(); return 0;
}
catch { return 3; }

static bool ValidName(string name) => name.Length is > 0 and <= 255 && name is not ("." or "..")
    && !name.Any(c => c < 32 || "<>:\"/\\|?*".Contains(c)) && !name.EndsWith(' ') && !name.EndsWith('.');
