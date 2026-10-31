using System.Reflection;
using System.Text.Json;

namespace Cap7CE.WinUI.Services;

// The deployment manifest remains the single source of prerequisite policy.
internal sealed record CoreRuntimePolicy(string MinimumVersion,string InstallerUrl,string Sha512,string[] Arguments)
{
    public static CoreRuntimePolicy Load()
    {
        using var stream=typeof(CoreRuntimePolicy).Assembly.GetManifestResourceStream("Cap7CE.CoreRuntimePolicy.json")
            ??throw new InvalidDataException("runtime-policy-missing");
        using var json=JsonDocument.Parse(stream);var runtime=json.RootElement.GetProperty("runtime");
        return new(runtime.GetProperty("minimumVersion").GetString()!,runtime.GetProperty("installerUrl").GetString()!,
            runtime.GetProperty("installerSha512").GetString()!,runtime.GetProperty("installArguments").EnumerateArray().Select(v=>v.GetString()!).ToArray());
    }
    public bool Matches(IEnumerable<string> installed)
    {
        var minimum=Version.Parse(MinimumVersion);
        return installed.Any(value=>Version.TryParse(value,out var candidate)&&candidate.Major==minimum.Major
            &&candidate.Minor==minimum.Minor&&candidate>=minimum);
    }
    public bool IsInstalled()
    {
        var directory=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"dotnet","shared","Microsoft.NETCore.App");
        return Directory.Exists(directory)&&Matches(Directory.EnumerateDirectories(directory).Select(Path.GetFileName)!);
    }
}
