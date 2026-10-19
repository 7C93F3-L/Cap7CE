using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
string Arg(string key) { var at = Array.IndexOf(args, key); return at >= 0 && at + 1 < args.Length ? args[at + 1] : ""; }
if (!int.TryParse(Arg("--port"), out var port) || port is < 1024 or > 65535 || Arg("--host") != "127.0.0.1") return 2;
var alias = Arg("--alias"); var mode = Environment.GetEnvironmentVariable("CAP7CE_FAKE_LLAMA_MODE") ?? "ok";
var marker = Environment.GetEnvironmentVariable("CAP7CE_FAKE_LLAMA_MARKER"); var attempt = 1;
if (!string.IsNullOrEmpty(marker)) { if (!Path.IsPathFullyQualified(marker)) return 2; if (File.Exists(marker)) attempt += File.ReadAllLines(marker).Length; File.AppendAllText(marker, JsonSerializer.Serialize(new { pid = Environment.ProcessId, port, alias }) + "\n"); }
if (mode == "bind-once" && attempt == 1) { Console.Error.WriteLine("address already in use"); return 3; }
var began = DateTime.UtcNow; using var stopping = new CancellationTokenSource(TimeSpan.FromSeconds(45));
var listener = new TcpListener(IPAddress.Loopback, port); listener.Start();
if (mode == "crash") _ = Task.Run(async () => { await Task.Delay(2000); Environment.Exit(13); });
async Task ServeAsync(TcpClient client) {
 using (client) { try {
  using var stream = client.GetStream(); using var reader = new StreamReader(stream, Encoding.ASCII, false, 1024, true);
  var first = await reader.ReadLineAsync(stopping.Token); if (first is null || first.Length > 4096) return;
  var total = first.Length; string? line; while ((line = await reader.ReadLineAsync(stopping.Token)) is { Length: > 0 }) { total += line.Length; if (total > 8192) return; }
  var target = first.Split(' ').ElementAtOrDefault(1); var status = 200;
  var body = target == "/health" ? JsonSerializer.Serialize(new { status = "ok" }) : target == "/v1/models" ? JsonSerializer.Serialize(new { data = new[] { new { id = mode == "wrong-model" ? "unexpected" : alias } } }) : "{}";
  if (target is not ("/health" or "/v1/models")) status = 404;
  if (target == "/health" && (mode == "unhealthy" || mode == "lose-health" && DateTime.UtcNow - began > TimeSpan.FromSeconds(2))) status = 503;
  var bytes = Encoding.UTF8.GetBytes(body); var header = Encoding.ASCII.GetBytes($"HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {bytes.Length}\r\nConnection: close\r\n\r\n");
  await stream.WriteAsync(header, stopping.Token); await stream.WriteAsync(bytes, stopping.Token);
 } catch (Exception error) when (error is IOException or OperationCanceledException) { } }
}
var clients = new List<Task>();
try { while (!stopping.IsCancellationRequested) { var client = await listener.AcceptTcpClientAsync(stopping.Token); clients.RemoveAll(task => task.IsCompleted); clients.Add(ServeAsync(client)); } }
catch (OperationCanceledException) { }
finally { listener.Stop(); await Task.WhenAll(clients); }
return 0;
