using System.Runtime.InteropServices;

namespace Cap7CE.Core.Setup;

internal static class CapabilitySetupServiceCommand
{
    public static string Quote(string value) => $"\"{value}\"";

    public static void RequireExecutable(string command, string expectedPath)
    {
        var failure = ValidateExecutable(command, expectedPath);
        if (failure is not null)
        {
            throw new CapabilitySetupTransactionFailure(failure, new InvalidDataException());
        }
    }

    private static string? ValidateExecutable(string command, string expectedPath)
    {
        try
        {
            var trimmed = command.Trim();
            var arguments = CommandLineToArgvW(trimmed, out var count);
            if (arguments == IntPtr.Zero) return "installed-service-path-parse-failed";
            try
            {
                if (count != 1)
                {
                    return "installed-service-path-shape-invalid";
                }
                var value = Marshal.PtrToStringUni(Marshal.ReadIntPtr(arguments));
                if (string.IsNullOrWhiteSpace(value)) return "installed-service-path-empty";
                return Path.GetFullPath(Environment.ExpandEnvironmentVariables(value)).Equals(
                    Path.GetFullPath(expectedPath), StringComparison.OrdinalIgnoreCase)
                    ? null
                    : "installed-service-path-mismatch";
            }
            finally { _ = LocalFree(arguments); }
        }
        catch (Exception error) when (error is ArgumentException or NotSupportedException or PathTooLongException)
        {
            return "installed-service-path-normalization-failed";
        }
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CommandLineToArgvW(string commandLine, out int argumentCount);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);
}
