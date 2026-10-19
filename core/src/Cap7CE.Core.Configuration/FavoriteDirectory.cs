namespace Cap7CE.Core.Configuration;

public sealed record FavoriteDirectory(string Id, string Path, string Name);

public sealed class FavoriteConfigurationException(string code) : Exception(code)
{
    public string Code { get; } = code;
}
