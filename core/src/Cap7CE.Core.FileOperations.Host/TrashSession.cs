using Cap7CE.Core.FileOperations;
using System.Buffers.Binary;
using System.Diagnostics;
using System.Text.Json;

namespace Cap7CE.Core.FileOperations.Host;

internal static class TrashSession
{
    public const int MaximumBytes = 24 * 1024 * 1024;
    public static async Task<int> RunAsync(int parentPid)
    {
        try {
            using var parent = Process.GetProcessById(parentPid);
            if (parentPid == Environment.ProcessId) return 2;
            parent.Exited += (_, _) => Environment.Exit(0); parent.EnableRaisingEvents = true;
            if (parent.HasExited) return 2;
            using var input = Console.OpenStandardInput(); using var output = Console.OpenStandardOutput();
            var executor = new TrashBatchExecutor(); var header = new byte[4]; long sequence = 0;
            while (true) {
                var read = await input.ReadAsync(header);
                if (read == 0) return 0;
                await input.ReadExactlyAsync(header.AsMemory(read));
                var length = BinaryPrimitives.ReadInt32LittleEndian(header);
                if (length is < 2 or > MaximumBytes) return 2;
                var bytes = new byte[length]; await input.ReadExactlyAsync(bytes);
                using var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 8 });
                var request = TrashSessionRequest.Read(document.RootElement);
                if (request.RequestId <= sequence) return 2;
                sequence = request.RequestId;
                var result = await executor.RunAsync(request.Targets, request.CacheRoots, request.Catalog);
                using var response = new MemoryStream();
                using (var writer = new Utf8JsonWriter(response, new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping })) {
                    writer.WriteStartObject(); writer.WriteNumber("requestId", sequence); writer.WriteBoolean("success", result.Success);
                    writer.WriteNumber("totalCount", result.TotalCount); writer.WriteStartArray("deletedPaths");
                    foreach (var path in result.DeletedPaths) writer.WriteStringValue(path);
                    writer.WriteEndArray(); writer.WriteStartArray("failedItems");
                    foreach (var failure in result.FailedItems) {
                        writer.WriteStartObject(); writer.WriteString("path", failure.Path); writer.WriteString("code", failure.Code);
                        writer.WriteNumber("error", failure.Error); writer.WriteEndObject();
                    }
                    writer.WriteEndArray(); writer.WriteEndObject();
                }
                if (response.Length > MaximumBytes) return 3;
                BinaryPrimitives.WriteInt32LittleEndian(header, checked((int)response.Length));
                await output.WriteAsync(header); response.Position = 0; await response.CopyToAsync(output); await output.FlushAsync();
            }
        } catch { return 3; }
    }
}
