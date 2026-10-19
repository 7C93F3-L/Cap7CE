using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Host.MetadataWorkers;
using System.Diagnostics;
using System.Reflection;
using System.Text.Json;

namespace Cap7CE.Core.Tests;

internal static class NodeMetadataWorkerTests
{
    private static FileFactExtractionTicket Ticket(string path, FileFactKind kind = FileFactKind.TextData) => new(
        new(new('a', 32), new(new(new('b', 32), new('c', 16)), kind, 1), new(1, 1, 1, 1), long.MaxValue), path);
    public static async Task<int> RunOwnerAsync(string runtime, string source)
    {
        await using var worker = new NodeMetadataWorker(new(runtime, Path.Combine(runtime, "unused.exe")));
        await worker.ReadAsync(Ticket(source), CancellationToken.None);
        return 0;
    }
    public static async Task RunAsync()
    {
        if (!OperatingSystem.IsWindows()) return;
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-node-owner-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try {
            await RealFormatsAsync(root);
            var runtime = Path.Combine(root, "runtime"); Directory.CreateDirectory(runtime);
            File.Copy(FileFactExecutionTests.Resources.Executable, Path.Combine(runtime, "node.exe"));
            await File.WriteAllTextAsync(Path.Combine(runtime, "worker.cjs"), """
                const fs=require('node:fs'),{spawn}=require('node:child_process');let buffer=Buffer.alloc(0);
                process.stdin.on('data',data=>{buffer=Buffer.concat([buffer,data]);while(buffer.length>=4){const n=buffer.readUInt32LE();if(buffer.length<n+4)return;
                  const r=JSON.parse(buffer.subarray(4,n+4));buffer=buffer.subarray(n+4);if(r.type==='stop')return process.exit(0);
                  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
                  fs.writeFileSync(r.task.filePath+'.pids',JSON.stringify([process.pid,child.pid]));
                  if(r.task.filePath.endsWith('bad')){const b=Buffer.alloc(4);b.writeUInt32LE(1024*1024);process.stdout.write(b);continue;}
                  if(r.task.filePath.endsWith('wrong')){const b=Buffer.from(JSON.stringify({id:r.id,residentBytes:1,result:{state:5}}));const h=Buffer.alloc(4);h.writeUInt32LE(b.length);process.stdout.write(Buffer.concat([h,b]));continue;}
                  if(r.task.filePath.endsWith('unsafe')||r.task.filePath.endsWith('duplicate')){const data=r.task.filePath.endsWith('unsafe')?JSON.stringify({id:r.id,residentBytes:1,result:{state:'indexed',textDataProperties:{factKind:'text',characterCount:9007199254740992,lineCount:1}}}):'{"id":'+r.id+',"id":'+r.id+',"residentBytes":1,"result":{"state":"failed","errorCode":"test"}}';const b=Buffer.from(data),h=Buffer.alloc(4);h.writeUInt32LE(b.length);process.stdout.write(Buffer.concat([h,b]));continue;}
                  if(r.task.filePath.endsWith('recycle')){const b=Buffer.from(JSON.stringify({id:r.id,residentBytes:300*1024*1024,result:{state:'indexed',textDataProperties:{factKind:'text',characterCount:1,lineCount:1}}}));const h=Buffer.alloc(4);h.writeUInt32LE(b.length);process.stdout.write(Buffer.concat([h,b]));}
                }});
                """);
            var resources = new NodeMetadataResources(runtime, Path.Combine(runtime, "unused.exe"));
            await using (var worker = new NodeMetadataWorker(resources)) {
                foreach (var name in new[] { "bad", "wrong", "unsafe", "duplicate" }) {
                    var invalidSource = Path.Combine(root, name);
                    await ExpectWorkerErrorAsync(() => worker.ReadAsync(Ticket(invalidSource), CancellationToken.None), "metadata-worker-invalid-response");
                    foreach (var pid in await PidsAsync(invalidSource)) await DeadAsync(pid);
                }
                var recycled = Path.Combine(root, "recycle");
                await worker.ReadAsync(Ticket(recycled), CancellationToken.None);
                foreach (var pid in await PidsAsync(recycled)) await DeadAsync(pid);
                var source = Path.Combine(root, "cancel"); using var cancel = new CancellationTokenSource();
                var pending = worker.ReadAsync(Ticket(source), cancel.Token);
                var pids = await PidsAsync(source); cancel.Cancel();
                await TestAssert.ThrowsAsync<OperationCanceledException>(() => pending, "request cancellation retires the decoder tree");
                foreach (var pid in pids) await DeadAsync(pid);
                var timeout = Path.Combine(root, "timeout");
                await ExpectWorkerErrorAsync(() => worker.ReadAsync(Ticket(timeout), CancellationToken.None), "metadata-worker-timeout");
                foreach (var pid in await PidsAsync(timeout)) await DeadAsync(pid);
            }
            var orphan = Path.Combine(root, "orphan");
            var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true };
            if (Path.GetFileNameWithoutExtension(Environment.ProcessPath!).Equals("dotnet", StringComparison.OrdinalIgnoreCase)) start.ArgumentList.Add(Assembly.GetExecutingAssembly().Location);
            foreach (var arg in new[] { "--metadata-job-owner", runtime, orphan }) start.ArgumentList.Add(arg);
            using (var owner = Process.Start(start)!) {
                try {
                    var pids = await PidsAsync(orphan);
                    owner.Kill(); await owner.WaitForExitAsync();
                    foreach (var pid in pids) await DeadAsync(pid);
                } finally { if (!owner.HasExited) { owner.Kill(entireProcessTree: true); await owner.WaitForExitAsync(); } }
            }
            await File.WriteAllBytesAsync(Path.Combine(runtime, "node.exe"), [1, 2, 3]);
            await using (var rejected = new NodeMetadataWorker(resources))
                await ExpectWorkerErrorAsync(() => rejected.ReadAsync(Ticket(Path.Combine(root, "blocked")), CancellationToken.None), "metadata-worker-process-failed");
            TestAssert.False(File.Exists(Path.Combine(root, "blocked.pids")), "digest mismatch is refused before process creation");
            Console.WriteLine("Core decoder lifetime: framed formats, malformed responses, RSS recycle, timeout/cancel, digest refusal and killed-owner descendant cleanup passed.");
        } finally { Directory.Delete(root, recursive: true); }
    }
    private static async Task RealFormatsAsync(string root)
    {
        await using var worker = new NodeMetadataWorker(FileFactExecutionTests.Resources);
        var png = Path.Combine(root, "pixel.png");
        var bytes = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1cAAAAASUVORK5CYII=");
        await File.WriteAllBytesAsync(png, bytes);
        TestAssert.Equal(1, (await worker.ReadAsync(Ticket(png, FileFactKind.ImageDimensions), CancellationToken.None)).Width!.Value,
            "framed Core transport preserves image decoding");
        TestAssert.True(bytes.SequenceEqual(await File.ReadAllBytesAsync(png)), "framed image decoder does not write source");
        var zip = Path.Combine(root, "empty.zip"); await File.WriteAllBytesAsync(zip, Convert.FromHexString("504B0506000000000000000000000000000000000000"));
        TestAssert.Equal(0L, (await worker.ReadAsync(Ticket(zip, FileFactKind.Archive), CancellationToken.None)).ArchiveProperties!.FileCount!.Value,
            "framed archive reply preserves known zero");
    }
    private static async Task ExpectWorkerErrorAsync(Func<Task<FileFactExtractionResult>> action, string code)
    {
        try { await action(); throw new InvalidOperationException("Expected decoder failure."); }
        catch (FileFactWorkerException error) { TestAssert.Equal(code, error.Message, "decoder failures retain their execution category"); }
    }
    private static async Task<int[]> PidsAsync(string source)
    {
        for (var attempt = 0; attempt < 300; attempt++) {
            try { return JsonSerializer.Deserialize<int[]>(await File.ReadAllTextAsync(source + ".pids"))!; }
            catch (Exception error) when (error is IOException or JsonException) { await Task.Delay(10); }
        }
        throw new InvalidOperationException("Owned decoder did not start.");
    }
    private static async Task DeadAsync(int pid)
    {
        for (var attempt = 0; attempt < 300; attempt++) {
            try { using var process = Process.GetProcessById(pid); if (process.HasExited) return; }
            catch (ArgumentException) { return; }
            await Task.Delay(10);
        }
        throw new InvalidOperationException("Owned decoder descendant survived its owner.");
    }
}
