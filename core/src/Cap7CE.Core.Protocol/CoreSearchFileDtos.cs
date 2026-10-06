namespace Cap7CE.Core.Protocol;

// FILETIME stays a decimal string across JavaScript. These filters need no content extraction.
public sealed record CoreSearchFileConditions(
    IReadOnlyList<string>? Extensions = null,
    long? MinimumSizeBytes = null,
    long? MaximumSizeBytes = null,
    string? MinimumModifiedFileTime = null,
    string? MaximumModifiedFileTime = null);
