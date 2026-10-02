namespace Cap7CE.Core.Setup;

public static class CapabilitySetupVolumeSelection
{
    private const int MaximumVolumeLetters = 26;

    public static bool TryParseArgument(
        string source,
        out IReadOnlyList<string> volumeLetters)
    {
        volumeLetters = Array.Empty<string>();
        if (string.IsNullOrEmpty(source)) return false;

        var values = source.Split(',', StringSplitOptions.None);
        if (!TryValidate(values, out var validated)) return false;
        volumeLetters = validated;
        return true;
    }

    public static IReadOnlyList<string> RequireValid(IReadOnlyList<string>? volumeLetters)
    {
        if (!TryValidate(volumeLetters, out var validated))
        {
            throw new InvalidDataException("invalid-volume-selection");
        }
        return validated;
    }

    private static bool TryValidate(
        IReadOnlyList<string>? source,
        out IReadOnlyList<string> volumeLetters)
    {
        volumeLetters = Array.Empty<string>();
        if (source is null || source.Count > MaximumVolumeLetters) return false;

        var seen = new HashSet<string>(StringComparer.Ordinal);
        var values = new string[source.Count];
        for (var index = 0; index < source.Count; index++)
        {
            var value = source[index];
            if (value is not { Length: 1 }
                || value[0] is < 'A' or > 'Z'
                || !seen.Add(value))
            {
                return false;
            }
            values[index] = value;
        }

        volumeLetters = values;
        return true;
    }
}
