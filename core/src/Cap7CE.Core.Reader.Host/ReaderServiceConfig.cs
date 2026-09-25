using System.Text.Json;
using System.Text.Json.Serialization;
using System.Security.Principal;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Reader.Host;

internal sealed record ReaderServiceConfig(
    string AllowedSid,
    string ResultName,
    int WaitSeconds,
    string Phase,
    string? VolumeLetter,
    IReadOnlyList<string>? VolumeLetters)
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = false,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
    };

    public static async Task<ReaderServiceConfig> LoadAsync(CancellationToken cancellationToken)
    {
        var directory = new DirectoryInfo(ReaderHostConstants.DataDirectory);
        if (!directory.Exists || directory.Attributes.HasFlag(FileAttributes.ReparsePoint))
        {
            throw new InvalidOperationException("reader-data-directory-invalid");
        }
        var configInfo = new FileInfo(ReaderHostConstants.ConfigPath);
        if (!configInfo.Exists || configInfo.Attributes.HasFlag(FileAttributes.ReparsePoint))
        {
            throw new InvalidOperationException("reader-config-invalid");
        }
        var bytes = await File.ReadAllBytesAsync(configInfo.FullName, cancellationToken);
        if (bytes.Length is 0 or > 4_096) throw new InvalidDataException("reader-config-size");
        var value = JsonSerializer.Deserialize<ReaderServiceConfig>(bytes, Options)
            ?? throw new InvalidDataException("reader-config-empty");
        value.Validate();
        return value;
    }

    public string ResultPath => Path.Combine(ReaderHostConstants.DataDirectory, ResultName);

    public IReadOnlyList<char> AuthorizedVolumeLetters => VolumeLetters is { Count: > 0 }
        ? VolumeLetters.Select(value => value[0]).ToArray()
        : VolumeLetter is { Length: 1 } ? [VolumeLetter[0]] : [];

    private void Validate()
    {
        _ = new SecurityIdentifier(AllowedSid);
        if (Phase is not ("fixture" or "disconnect" or "stop" or "volume"))
        {
            throw new InvalidDataException("reader-phase");
        }
        var maximumWaitSeconds = Phase == "volume" ? 1_800 : 60;
        if (WaitSeconds < 2 || WaitSeconds > maximumWaitSeconds)
        {
            throw new InvalidDataException("reader-wait-seconds");
        }
        if (Phase == "volume")
        {
            if (VolumeLetter is not null && VolumeLetters is not null)
            {
                throw new InvalidDataException("reader-volume-selection-conflict");
            }
            var letters = AuthorizedVolumeLetters;
            if (letters.Count is < 1 or > ReaderProtocol.MaximumVolumes
                || letters.Any(letter => letter is < 'A' or > 'Z')
                || letters.Distinct().Count() != letters.Count)
            {
                throw new InvalidDataException("reader-volume-letter");
            }
        }
        else if (VolumeLetter is not null || VolumeLetters is not null)
        {
            throw new InvalidDataException("reader-unexpected-volume");
        }
        if (ResultName.Length is < 13 or > 64
            || !ResultName.StartsWith("result-", StringComparison.Ordinal)
            || !ResultName.EndsWith(".json", StringComparison.Ordinal)
            || !ResultName.All(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '.'))
        {
            throw new InvalidDataException("reader-result-name");
        }
    }
}
