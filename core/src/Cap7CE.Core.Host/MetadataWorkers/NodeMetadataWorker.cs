using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Protocol;
using System.Buffers.Binary;
using System.Diagnostics;
using System.Text.Json;

namespace Cap7CE.Core.Host.MetadataWorkers;

public sealed class NodeMetadataWorker(NodeMetadataResources resources) : IFileFactContentReader
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private Process? child;
    private MetadataWorkerJob? job;
    private Task? stderr;
    private long sequence;
    private bool closed;
    public async Task<FileFactExtractionResult> ReadAsync(FileFactExtractionTicket ticket, CancellationToken token)
    {
        if (!await gate.WaitAsync(0, token)) throw new FileFactWorkerException("metadata-worker-busy");
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(14));
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, deadline.Token);
        try {
            if (closed) throw new FileFactWorkerException("metadata-worker-closed");
            token.ThrowIfCancellationRequested();
            if (child is null) {
                try { await StartAsync(linked.Token); }
                catch (Exception error) when (error is IOException or InvalidOperationException or System.ComponentModel.Win32Exception) {
                    await StopAsync(); throw new FileFactWorkerException("metadata-worker-process-failed");
                }
            }
            var id = checked(++sequence);
            string[] kinds = ["image-dimensions", "video", "audio", "font", "model", "document", "three-d", "text-data", "archive"];
            await SendAsync(new { type = "extract", id, task = new { kind = kinds[(int)ticket.Lease.Job.Kind], filePath = ticket.FullPath } }, linked.Token);
            var header = new byte[4];
            await child!.StandardOutput.BaseStream.ReadExactlyAsync(header, linked.Token);
            var size = BinaryPrimitives.ReadInt32LittleEndian(header);
            if (size is < 1 or > 256 * 1024) throw new JsonException();
            var bytes = new byte[size];
            await child.StandardOutput.BaseStream.ReadExactlyAsync(bytes, linked.Token);
            using var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 32 });
            NodeMetadataJson.Validate(document.RootElement);
            var response = document.RootElement.Deserialize<NodeMetadataResponse>(CoreProtocolJson.Options) ?? throw new JsonException();
            var result = response.ReadResult(id, ticket.Lease.Job.Kind);
            if (response.ResidentBytes > 256 * 1024 * 1024) await StopAsync();
            return result;
        }
        catch (OperationCanceledException) {
            await StopAsync();
            token.ThrowIfCancellationRequested();
            throw new FileFactWorkerException("metadata-worker-timeout");
        }
        catch (JsonException) { await StopAsync(); throw new FileFactWorkerException("metadata-worker-invalid-response"); }
        catch (Exception error) when (error is IOException or InvalidOperationException or System.ComponentModel.Win32Exception) {
            await StopAsync(); throw new FileFactWorkerException("metadata-worker-exited");
        }
        finally { gate.Release(); }
    }
    public async Task ReleaseAsync() { await gate.WaitAsync(); try { await StopAsync(); } finally { gate.Release(); } }
    public async ValueTask DisposeAsync() { closed = true; await ReleaseAsync(); }
    private async Task StartAsync(CancellationToken token)
    {
        await resources.VerifyAsync(token);
        var start = new ProcessStartInfo(resources.Executable) { UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, WorkingDirectory = resources.Root };
        start.ArgumentList.Add("--max-old-space-size=256"); start.ArgumentList.Add(resources.Worker); start.ArgumentList.Add("--stdio");
        foreach (var key in start.Environment.Keys.Where(key => new[] { "NODE_OPTIONS", "NODE_PATH", "ELECTRON_RUN_AS_NODE" }.Contains(key, StringComparer.OrdinalIgnoreCase)).ToArray())
            start.Environment.Remove(key);
        start.Environment["CAP7CE_VIDEO_FRAME_HELPER"] = resources.VideoHelper;
        child = new Process { StartInfo = start };
        if (!child.Start()) throw new InvalidOperationException();
        job = new MetadataWorkerJob(child);
        stderr = DrainAsync(child.StandardError.BaseStream);
    }
    private async Task SendAsync(object request, CancellationToken token)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(request, CoreProtocolJson.Options);
        if (bytes.Length > 256 * 1024) throw new JsonException();
        var header = new byte[4]; BinaryPrimitives.WriteInt32LittleEndian(header, bytes.Length);
        await child!.StandardInput.BaseStream.WriteAsync(header, token);
        await child.StandardInput.BaseStream.WriteAsync(bytes, token);
        await child.StandardInput.BaseStream.FlushAsync(token);
    }
    private async Task StopAsync()
    {
        if (child is null) return;
        var owned = child; child = null;
        try {
            if (!owned.HasExited) {
                var bytes = "{\"type\":\"stop\"}"u8.ToArray();
                var frame = new byte[bytes.Length + 4]; BinaryPrimitives.WriteInt32LittleEndian(frame, bytes.Length); bytes.CopyTo(frame, 4);
                using var grace = new CancellationTokenSource(500);
                try { await owned.StandardInput.BaseStream.WriteAsync(frame, grace.Token); await owned.StandardInput.BaseStream.FlushAsync(grace.Token);
                    await owned.WaitForExitAsync(grace.Token); } catch (Exception error) when (error is IOException or OperationCanceledException or InvalidOperationException) { }
            }
        } catch (Exception error) when (error is InvalidOperationException or System.ComponentModel.Win32Exception) { }
        finally {
            job?.Dispose(); job = null;
            try { if (!owned.HasExited) { owned.Kill(entireProcessTree: true); await owned.WaitForExitAsync(); } }
            catch (Exception error) when (error is InvalidOperationException or System.ComponentModel.Win32Exception) { }
            if (stderr is not null) await stderr;
            stderr = null; owned.Dispose();
        }
    }
    private static async Task DrainAsync(Stream stream)
    {
        var buffer = new byte[4096];
        try { while (await stream.ReadAsync(buffer) != 0) { } } catch (IOException) { }
    }
}
