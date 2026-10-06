namespace Cap7CE.Core.Catalog.FileFacts;

// A null root means the whole volume. Empty Includes disables extraction.
public sealed record FileFactScope(string VolumeId, string? RootFileReference = null);
public sealed record FileFactQueuePolicy(
    IReadOnlyList<string> VolumeOrder, IReadOnlyList<FileFactScope> Includes, IReadOnlyList<FileFactScope> Excludes);
public sealed record FileFactJob(CatalogEntryIdentity Identity, FileFactKind Kind, int ExtractorVersion);
public sealed record FileFactLease(string LeaseId, FileFactJob Job, FileFactSourceVersion Source, long ExpiresUnixMilliseconds);
public enum FileFactCompletion { Published, LeaseLost, SourceChanged, ExtractorSuperseded }
