namespace Cap7CE.Core.Protocol;

public sealed record CoreSearchRatio(int Numerator, int Denominator);
public sealed record CoreSearchAspectRange(CoreSearchRatio? Minimum = null, CoreSearchRatio? Maximum = null,
    bool MinimumInclusive = true, bool MaximumInclusive = true);
public sealed record CoreSearchIntegerRange(int? Minimum = null, int? Maximum = null);
public sealed record CoreSearchVisualConstraint(string Metric, string Operator, int Value);
public sealed record CoreSearchVisualGroup(IReadOnlyList<IReadOnlyList<CoreSearchVisualConstraint>> Alternatives);
public sealed record CoreSearchFontFilter(IReadOnlyList<CoreSearchIntegerRange>? WeightRanges = null,
    bool? Italic = null, bool? SupportsLatin = null, bool? SupportsChinese = null, bool? Variable = null);

public sealed record CoreSearchLongRange(long? Minimum = null, long? Maximum = null);
public sealed record CoreSearchModelFilter(IReadOnlyList<CoreSearchLongRange>? ParameterRanges = null,
    IReadOnlyList<string>? Precisions = null);

public sealed record CoreSearchDocumentFilter(int? MinimumContentCount = null, int? MaximumContentCount = null,
    bool? HasEmbeddedImages = null, int? MinimumArtboardCount = null, int? MaximumArtboardCount = null);

public sealed record CoreSearchThreeDFilter(long? MinimumTriangleCount = null, long? MaximumTriangleCount = null,
    IReadOnlyList<string>? Structures = null);

public sealed record CoreSearchTextDataFilter(string FactKind, long? MinimumCharacterCount = null, long? MaximumCharacterCount = null,
    long? MinimumLineCount = null, long? MaximumLineCount = null, long? MinimumRecordCount = null, long? MaximumRecordCount = null,
    long? MinimumColumnCount = null, long? MaximumColumnCount = null, string? JsonRootKind = null);

public sealed record CoreSearchArchiveFilter(long? MinimumFileCount = null, long? MaximumFileCount = null,
    IReadOnlyList<string>? ContentTypes = null, IReadOnlyList<string>? Structures = null);

// Typed property filters. Extractor versions are supplied by the client, never user settings.
public sealed record CoreSearchFactFilter(
    string Kind,
    int ExtractorVersion,
    int? MinimumWidth = null,
    int? MaximumWidth = null,
    int? MinimumHeight = null,
    int? MaximumHeight = null,
    long? MinimumDurationMilliseconds = null,
    long? MaximumDurationMilliseconds = null,
    CoreSearchRatio? MinimumAspectRatio = null,
    CoreSearchRatio? MaximumAspectRatio = null,
    IReadOnlyList<CoreSearchAspectRange>? AspectRanges = null,
    IReadOnlyList<CoreSearchIntegerRange>? ShortEdgeRanges = null,
    bool? IsAnimated = null,
    IReadOnlyList<CoreSearchVisualGroup>? VisualGroups = null,
    IReadOnlyList<CoreSearchIntegerRange>? ChannelRanges = null,
    CoreSearchFontFilter? Font = null,
    CoreSearchModelFilter? Model = null,
    CoreSearchDocumentFilter? Document = null,
    CoreSearchThreeDFilter? ThreeD = null,
    CoreSearchTextDataFilter? TextData = null,
    CoreSearchArchiveFilter? Archive = null);
