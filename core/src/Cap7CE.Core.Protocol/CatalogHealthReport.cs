namespace Cap7CE.Core.Protocol;

public sealed record CatalogHealthReport(string Status, DateTimeOffset CompletedAt,
    double ElapsedMs, string[] Problems, bool Truncated = false);
