using System.Buffers.Binary;
using System.Text.Json;
using Cap7CE.Core.FileOperations.Host;

if (args is ["--describe"]) { Console.WriteLine("{\"protocol\":\"file-operations/1\",\"runtimeRequired\":false}"); return 0; }
if (args is ["--trash-session", "--parent-pid", var parent] && int.TryParse(parent, out var parentPid) && parentPid > 0)
    return await TrashSession.RunAsync(parentPid);
if (args.Length != 0) return 2;
try
{
    using var input = Console.OpenStandardInput(); using var output = Console.OpenStandardOutput();
    var header = new byte[4]; input.ReadExactly(header); var length = BinaryPrimitives.ReadInt32LittleEndian(header);
    if (length is < 2 or > 1024 * 1024) return 2;
    var bytes = new byte[length]; input.ReadExactly(bytes); using var document = JsonDocument.Parse(bytes); var root = document.RootElement;
    if (root.GetProperty("version").GetInt32() != 1) return 2;
    using var response = new MemoryStream();
    using (var writer = new Utf8JsonWriter(response, new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping })) {
        writer.WriteStartObject();
        if (root.GetProperty("operation").GetString()?.StartsWith("folder-rename-", StringComparison.Ordinal) == true)
            FolderRenameRequestHandler.Dispatch(root, writer);
        else WindowsOperationRequest.Dispatch(root, writer);
        writer.WriteEndObject();
    }
    if (response.Length > 2 * 1024 * 1024) return 3;
    BinaryPrimitives.WriteInt32LittleEndian(header, checked((int)response.Length)); output.Write(header); output.Write(response.ToArray()); output.Flush(); return 0;
}
catch { return 3; }
