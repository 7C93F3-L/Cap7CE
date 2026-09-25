using System.Diagnostics;
using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text.Json;
using Cap7CE.Core.Host;

namespace Cap7CE.Core.Tests;

internal sealed class HostProcessFixture : IAsyncDisposable
{
    private readonly Process process;
    private readonly NamedPipeClientStream pipe;

    private HostProcessFixture(Process process, NamedPipeClientStream pipe, string encodedSecret)
    {
        this.process = process;
        this.pipe = pipe;
        EncodedSecret = encodedSecret;
        ProcessId = process.Id;
        Client = new ProtocolClient(pipe);
    }

    public string EncodedSecret { get; }

    public int ProcessId { get; }

    public ProtocolClient Client { get; }

    public static async Task<HostProcessFixture> StartAsync()
    {
        var pipeName = $"cap7ce-core-p11-{Guid.NewGuid():N}";
        var encodedSecret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var hostAssembly = typeof(CoreHostScaffold).Assembly.Location;
        var startInfo = new ProcessStartInfo
        {
            FileName = "dotnet",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        startInfo.ArgumentList.Add(hostAssembly);
        startInfo.ArgumentList.Add("--synthetic-server");
        startInfo.ArgumentList.Add("--pipe-name");
        startInfo.ArgumentList.Add(pipeName);
        startInfo.Environment["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1";
        startInfo.Environment["DOTNET_NOLOGO"] = "1";

        var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("Could not start the synthetic Core host.");
        try
        {
            await process.StandardInput.WriteLineAsync(encodedSecret);
            await process.StandardInput.FlushAsync();
            process.StandardInput.Close();

            var readyLine = await process.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10));
            if (readyLine is null)
            {
                throw new InvalidOperationException("Synthetic Core host ended before becoming ready.");
            }
            using var ready = JsonDocument.Parse(readyLine);
            TestAssert.Equal("ready", ready.RootElement.GetProperty("status").GetString(), "host readiness");
            TestAssert.True(ready.RootElement.GetProperty("syntheticFixture").GetBoolean(), "host fixture mode");
            TestAssert.Equal(process.Id, ready.RootElement.GetProperty("processId").GetInt32(), "host process identity");

            var pipe = new NamedPipeClientStream(
                ".",
                pipeName,
                PipeDirection.InOut,
                PipeOptions.Asynchronous);
            await pipe.ConnectAsync(5_000);
            return new HostProcessFixture(process, pipe, encodedSecret);
        }
        catch
        {
            if (!process.HasExited) process.Kill(true);
            process.Dispose();
            throw;
        }
    }

    public async ValueTask DisposeAsync()
    {
        await pipe.DisposeAsync();
        if (!process.HasExited)
        {
            try
            {
                await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));
            }
            catch (TimeoutException)
            {
                process.Kill(true);
                await process.WaitForExitAsync();
            }
        }
        process.Dispose();
    }
}
