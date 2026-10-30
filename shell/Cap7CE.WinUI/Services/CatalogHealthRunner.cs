using System.Diagnostics;
using System.Text.Json;
using Cap7CE.Core.Protocol;

namespace Cap7CE.WinUI.Services;

internal sealed class CatalogHealthRunner(string root, string reportPath)
{
    public DateTimeOffset? LastCheck()
    {
        try { return JsonSerializer.Deserialize<CatalogHealthReport>(File.ReadAllText(reportPath))?.CompletedAt; }
        catch { return null; }
    }
    public async Task RunAsync(CancellationToken token)
    {
        using var trace = SessionDiagnostics.Begin("catalog.health");
        CatalogHealthReport report;
        try {
            var info = new ProcessStartInfo(Path.Combine(root, "core/artifacts/development-product-host/Cap7CE.Core.Host.exe")) {
                UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            info.ArgumentList.Add("--catalog-health-check");
            using var process = Process.Start(info) ?? throw new IOException("health-process-start-failed");
            using var stop = token.Register(() => { try { if (!process.HasExited) process.Kill(true); } catch { } });
            var output = process.StandardOutput.ReadToEndAsync(token);
            var errors = process.StandardError.ReadToEndAsync(token);
            await process.WaitForExitAsync(token);
            var text = await output;
            await errors;
            if (process.ExitCode != 0) throw new IOException("health-process-failed");
            report = JsonSerializer.Deserialize<CatalogHealthReport>(text) ?? throw new IOException("health-response-empty");
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception error) {
            trace.Fail(error);
            report = new("error", DateTimeOffset.UtcNow, 0, [error.Message]);
        }
        trace.Mark("result", new { report.Status, report.ElapsedMs, problems = report.Problems.Length });
        token.ThrowIfCancellationRequested();
        Directory.CreateDirectory(Path.GetDirectoryName(reportPath)!);
        var temporary = reportPath + ".tmp";
        try {
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(report), token);
            File.Move(temporary, reportPath, true);
        } finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
