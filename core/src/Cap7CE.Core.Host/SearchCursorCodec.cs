using System.Security.Cryptography;
using System.Text.Json;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host;

public sealed class SearchCursorCodec
{
    private readonly byte[] signingKey = RandomNumberGenerator.GetBytes(32);
    private readonly TimeProvider timeProvider;

    public SearchCursorCodec(TimeProvider? timeProvider = null)
    {
        this.timeProvider = timeProvider ?? TimeProvider.System;
    }

    public string Create(
        string query,
        long offset,
        int pageSize,
        string sort,
        IReadOnlyList<string> volumeIds,
        long catalogRevision)
    {
        var token = new SearchCursorToken(
            query,
            offset,
            pageSize,
            sort,
            volumeIds,
            catalogRevision,
            timeProvider.GetUtcNow().AddMinutes(5).ToUnixTimeMilliseconds());
        var payload = JsonSerializer.SerializeToUtf8Bytes(token, CoreProtocolJson.Options);
        var signature = HMACSHA256.HashData(signingKey, payload);
        return $"{Base64UrlEncode(payload)}.{Base64UrlEncode(signature)}";
    }

    public SearchCursorToken Read(string cursor, long currentCatalogRevision)
    {
        if (string.IsNullOrWhiteSpace(cursor) || cursor.Length > 4096) throw InvalidCursor();
        var parts = cursor.Split('.');
        if (parts.Length != 2) throw InvalidCursor();

        try
        {
            var payload = Base64UrlDecode(parts[0]);
            var signature = Base64UrlDecode(parts[1]);
            var expected = HMACSHA256.HashData(signingKey, payload);
            if (!CryptographicOperations.FixedTimeEquals(signature, expected)) throw InvalidCursor();
            var token = JsonSerializer.Deserialize<SearchCursorToken>(payload, CoreProtocolJson.Options)
                ?? throw InvalidCursor();
            if (token.Offset < 0
                || token.PageSize is < 1 or > CoreProtocol.MaximumPageSize
                || token.Query is null
                || token.Query.Length > CoreProtocol.MaximumQueryLength
                || token.Sort != CoreSearchSorts.NameAscending
                || token.VolumeIds is null
                || token.VolumeIds.Count is < 1 or > CoreProtocol.MaximumVolumeIds
                || token.CatalogRevision != currentCatalogRevision
                || token.ExpiresAtUnixMilliseconds <= timeProvider.GetUtcNow().ToUnixTimeMilliseconds())
            {
                throw InvalidCursor();
            }
            return token;
        }
        catch (Exception error) when (error is FormatException or JsonException)
        {
            throw InvalidCursor();
        }
    }

    private static string Base64UrlEncode(byte[] value) =>
        Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded += new string('=', (4 - padded.Length % 4) % 4);
        return Convert.FromBase64String(padded);
    }

    private static CoreProtocolException InvalidCursor() =>
        new(CoreErrorCodes.InvalidCursor, "Cursor is invalid or expired.");
}

public sealed record SearchCursorToken(
    string Query,
    long Offset,
    int PageSize,
    string Sort,
    IReadOnlyList<string> VolumeIds,
    long CatalogRevision,
    long ExpiresAtUnixMilliseconds);
