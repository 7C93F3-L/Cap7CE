using Cap7CE.WinUI.Localization;
using System.Buffers.Binary;
using System.Diagnostics;
using System.Text.Json;

namespace Cap7CE.WinUI.Services;
internal static class NativeCoreRequest
{
    public static async Task<JsonElement> SendAsync(string executable, string[] arguments, object request)
    {
        var info = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var arg in arguments) info.ArgumentList.Add(arg);
        using var child = Process.Start(info) ?? throw new UiFailure("ui.error.nativeUnavailable");
        child.ErrorDataReceived += (_, _) => { }; child.BeginErrorReadLine();
        var input = child.StandardInput.BaseStream; var output = child.StandardOutput.BaseStream;
        var bytes = JsonSerializer.SerializeToUtf8Bytes(request, FramedRpc.Json);
        if (bytes.Length > 1024 * 1024) throw new UiFailure("ui.error.nativeLimit");
        var header = new byte[4]; BinaryPrimitives.WriteInt32LittleEndian(header, bytes.Length);
        await input.WriteAsync(header); await input.WriteAsync(bytes); await input.FlushAsync();
        // Native dialogs retain ownership until the user operation finishes.
        await output.ReadExactlyAsync(header); var size = BinaryPrimitives.ReadInt32LittleEndian(header);
        if (size is < 2 or > 24 * 1024 * 1024) throw new UiFailure("ui.error.nativeResponse");
        bytes = new byte[size]; await output.ReadExactlyAsync(bytes);
        child.StandardInput.Close(); await child.WaitForExitAsync();
        if (child.ExitCode != 0) throw new UiFailure("ui.error.nativeOperation");
        using var json = JsonDocument.Parse(bytes); return json.RootElement.Clone();
    }
}
