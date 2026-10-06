using System.Globalization;

namespace Cap7CE.Core.Host;

public enum CoreRequestIdentityResult { Accepted, Duplicate, InvalidSequence, CapacityExceeded }

// The session's single frame reader owns this tracker. Electron already sends
// shell-ordinal-nonce IDs in write order; retaining the high watermark suffices
// to reject all replays without storing millions of completed requests.
public sealed class CoreRequestIdentityTracker
{
    public const int MaximumOpaqueIdentities = 4096;
    private readonly HashSet<string> opaque = new(StringComparer.Ordinal);
    private bool? sequential;
    private ulong highest;
    public int RetainedIdentityCount => opaque.Count;

    public CoreRequestIdentityResult Register(string requestId)
    {
        var ordered = TryReadOrdinal(requestId, out var ordinal);
        sequential ??= ordered;
        if (sequential.Value) {
            if (!ordered) return CoreRequestIdentityResult.InvalidSequence;
            if (ordinal <= highest) return CoreRequestIdentityResult.Duplicate;
            highest = ordinal; return CoreRequestIdentityResult.Accepted;
        }
        if (opaque.Contains(requestId)) return CoreRequestIdentityResult.Duplicate;
        if (opaque.Count >= MaximumOpaqueIdentities) return CoreRequestIdentityResult.CapacityExceeded;
        opaque.Add(requestId); return CoreRequestIdentityResult.Accepted;
    }
    private static bool TryReadOrdinal(string value, out ulong ordinal)
    {
        ordinal = 0;
        if (!value.StartsWith("shell-", StringComparison.Ordinal)) return false;
        var tail = value.AsSpan(6); var separator = tail.IndexOf('-');
        if (separator is < 1 or > 16 || tail[0] == '0' || tail.Length != separator + 9) return false;
        foreach (var character in tail[(separator + 1)..]) if (!char.IsAsciiHexDigit(character)) return false;
        return ulong.TryParse(tail[..separator], NumberStyles.None, CultureInfo.InvariantCulture, out ordinal)
            && ordinal is > 0 and <= 9_007_199_254_740_991;
    }
}
