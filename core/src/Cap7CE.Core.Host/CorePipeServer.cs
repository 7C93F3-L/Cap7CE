using System.IO.Pipes;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.Core.Host;

public sealed class CorePipeServer : IAsyncDisposable
{
    private readonly NamedPipeServerStream pipe;
    private readonly ProductCoreRuntime? runtime;
    private readonly IReadOnlySet<string>? allowedOperations;

    public CorePipeServer(string pipeName, ProductCoreRuntime? runtime = null, IReadOnlySet<string>? allowedOperations = null)
    {
        this.runtime = runtime;
        this.allowedOperations = allowedOperations;
        pipe = new NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous | PipeOptions.WriteThrough | PipeOptions.CurrentUserOnly);
    }

    public async Task RunAsync(byte[] sessionSecret, CancellationToken cancellationToken)
    {
        await pipe.WaitForConnectionAsync(cancellationToken);
        if (!GetNamedPipeClientProcessId(pipe.SafePipeHandle, out var clientProcessId))
        {
            throw new InvalidOperationException("Pipe client identity could not be verified.");
        }
        var session = runtime is null
            ? new CorePipeSession(sessionSecret, checked((int)clientProcessId))
            : new CorePipeSession(sessionSecret, checked((int)clientProcessId), runtime, allowedOperations);
        await session.RunAsync(pipe, cancellationToken);
    }

    public ValueTask DisposeAsync() => pipe.DisposeAsync();

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetNamedPipeClientProcessId(
        SafePipeHandle pipe,
        out uint clientProcessId);
}
