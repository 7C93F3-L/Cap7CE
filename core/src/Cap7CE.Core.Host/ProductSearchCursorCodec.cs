using System.Security.Cryptography;
using System.Text.Json;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host;

public sealed class ProductSearchCursorCodec
{
    private readonly byte[] key = RandomNumberGenerator.GetBytes(32);
    private readonly TimeProvider timeProvider;

    public ProductSearchCursorCodec(TimeProvider? timeProvider = null) =>
        this.timeProvider = timeProvider ?? TimeProvider.System;

    public string Create(ProductSearchCursorToken token)
    {
        var expiring = token with
        {
            ExpiresAtUnixMilliseconds = timeProvider.GetUtcNow().AddMinutes(5).ToUnixTimeMilliseconds()
        };
        var payload = JsonSerializer.SerializeToUtf8Bytes(expiring, CoreProtocolJson.Options);
        var signature = HMACSHA256.HashData(key, payload);
        return Base64Url(payload) + "." + Base64Url(signature);
    }

    public ProductSearchCursorToken Read(string value, long revision)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 65_536) throw Invalid();
        var parts = value.Split('.');
        if (parts.Length != 2) throw Invalid();
        try
        {
            var payload = Decode(parts[0]);
            var signature = Decode(parts[1]);
            if (!CryptographicOperations.FixedTimeEquals(signature, HMACSHA256.HashData(key, payload)))
            {
                throw Invalid();
            }
            var token = JsonSerializer.Deserialize<ProductSearchCursorToken>(payload, CoreProtocolJson.Options)
                ?? throw Invalid();
            if ((token.Continuation is not null && token.Continuation != "live")
                || (token.Continuation != "live" && token.CatalogRevision != revision)
                || token.ExpiresAtUnixMilliseconds <= timeProvider.GetUtcNow().ToUnixTimeMilliseconds()
                || token.PageSize is < 1 or > CoreProtocol.MaximumPageSize
                || token.VolumeIds.Count > CoreProtocol.MaximumVolumeIds
                || token.Query.Length > CoreProtocol.MaximumQueryLength
                || token.After is null || !CoreSearchSorts.IsSupported(token.Sort))
            {
                throw Invalid();
            }
            return token;
        }
        catch (Exception error) when (error is FormatException or JsonException)
        {
            throw Invalid();
        }
    }

    private static string Base64Url(byte[] value) =>
        Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Decode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded += new string('=', (4 - padded.Length % 4) % 4);
        return Convert.FromBase64String(padded);
    }

    private static CoreProtocolException Invalid() =>
        new(CoreErrorCodes.InvalidCursor, "Cursor is invalid or expired.");
}

public sealed record ProductSearchCursorToken(
    string Query,
    int PageSize,
    IReadOnlyList<string> VolumeIds,
    CoreSearchScopeRequest Scope,
    string? Extension,
    string EntryType,
    CatalogQueryCursorKey? After,
    long CatalogRevision,
    long ExpiresAtUnixMilliseconds = 0,
    string? TextTarget = null,
    CoreSearchFactFilter? Facts = null,
    CoreSearchFileConditions? FileConditions = null,
    string? Continuation = null, string Sort = CoreSearchSorts.NameAscending, bool ExcludeHidden = false);
