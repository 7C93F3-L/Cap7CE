using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Cap7CE.Core.Configuration;

namespace Cap7CE.Core.FileOperations;

public sealed record FolderRenameRecord(string OldPath, string NewPath, string Dev, string Ino);
public sealed record FolderRenameCheckpoint(FolderRenameRecord Record, string Ticket);

public sealed class FolderRenameJournal(string configurationPath)
{
    public string PathValue { get; } = configurationPath + ".rename-pending";
    public async Task<FolderRenameCheckpoint?> ReadAsync()
    {
        FileStream file;
        try { file = new(PathValue, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.Asynchronous); }
        catch (FileNotFoundException) { return null; }
        catch (DirectoryNotFoundException) { return null; }
        await using (file)
        {
            var bytes = new byte[256 * 1024 + 1]; var length = 0;
            while (length < bytes.Length) { var read = await file.ReadAsync(bytes.AsMemory(length)); if (read == 0) break; length += read; }
            if (length > 256 * 1024) throw new FavoriteConfigurationException("folder-rename-invalid-recovery");
            using var document = JsonDocument.Parse(new UTF8Encoding(false, true).GetString(bytes, 0, length)); var root = document.RootElement;
            var record = new FolderRenameRecord(root.GetProperty("oldPath").GetString()!, root.GetProperty("newPath").GetString()!, root.GetProperty("dev").GetString()!, root.GetProperty("ino").GetString()!);
            Validate(record); return new(record, Convert.ToHexString(SHA256.HashData(bytes.AsSpan(0, length))));
        }
    }
    public async Task WriteAsync(FolderRenameRecord record)
    {
        Validate(record); using var data = new MemoryStream();
        using (var writer = new Utf8JsonWriter(data, new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping })) {
            writer.WriteStartObject(); writer.WriteString("oldPath", record.OldPath); writer.WriteString("newPath", record.NewPath);
            writer.WriteString("dev", record.Dev); writer.WriteString("ino", record.Ino); writer.WriteEndObject();
        }
        if (data.Length > 256 * 1024) throw new FavoriteConfigurationException("folder-rename-invalid-recovery");
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(PathValue))!);
        var stage = PathValue + "." + Guid.NewGuid().ToString("N") + ".preparing"; var created = false;
        try {
            await using (var output = new FileStream(stage, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.Asynchronous)) {
                created = true; await output.WriteAsync(data.ToArray()); await output.FlushAsync(); output.Flush(true);
            }
            File.Move(stage, PathValue, true);
        }
        finally { if (created && File.Exists(stage)) File.Delete(stage); }
    }
    public void Remove() => File.Delete(PathValue);
    private static void Validate(FolderRenameRecord record)
    {
        var expected = FavoriteDirectoryRules.PathValue(Path.Combine(Path.GetDirectoryName(record.OldPath)!, WindowsFileOperationRules.Name(Path.GetFileName(record.NewPath))));
        if (FavoriteDirectoryRules.PathValue(record.OldPath) != record.OldPath || expected != record.NewPath
            || string.IsNullOrEmpty(record.Dev) || string.IsNullOrEmpty(record.Ino) || !record.Dev.All(char.IsAsciiDigit) || !record.Ino.All(char.IsAsciiDigit))
            throw new FavoriteConfigurationException("folder-rename-invalid-recovery");
    }
}
