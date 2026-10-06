using System.Text.Json.Serialization;

namespace Cap7CE.Core.Catalog.FileFacts;

public enum FileFactKind { ImageDimensions, Video, Audio, Font, Model, Document, ThreeD, TextData, Archive }
public enum FileFactState { Indexed, Unknown, Unsupported, Failed }

// ModifiedFileTime is the exact Windows FILETIME integer, not DateTime ticks.
// Cross-process representations must preserve all 64 bits (decimal strings).
[JsonConverter(typeof(FileFactSourceVersionJsonConverter))]
public sealed record FileFactSourceVersion(
    long SizeBytes, long ModifiedFileTime, long VolumeEpoch, long ContentRevision);

public sealed record FileFactObservation(
    CatalogEntryIdentity Identity,
    FileFactSourceVersion Source,
    FileFactKind Kind,
    int ExtractorVersion,
    FileFactState State,
    int? Width = null,
    int? Height = null,
    long? DurationMilliseconds = null,
    string? ErrorCode = null,
    bool? IsAnimated = null,
    IReadOnlyDictionary<string, int>? VisualProperties = null,
    int? ChannelCount = null,
    FileFactFontProperties? FontProperties = null,
    FileFactModelProperties? ModelProperties = null,
    FileFactDocumentProperties? DocumentProperties = null,
    FileFactThreeDProperties? ThreeDProperties = null,
    FileFactTextDataProperties? TextDataProperties = null,
    FileFactArchiveProperties? ArchiveProperties = null);

public enum FileFactPublishResult { Published, SourceChanged, ExtractorSuperseded }
