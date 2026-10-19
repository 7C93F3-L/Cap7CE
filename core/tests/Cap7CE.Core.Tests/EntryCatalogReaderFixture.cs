using Cap7CE.Core.Host;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Tests;

internal sealed class EntryCatalogReaderFixture : ICatalogReaderSessionFactory
{
    public SyntheticCatalogReader Base { get; } = new();
    public Dictionary<ulong, ReaderFileEntrySet> Overrides { get; } = [];
    public bool FailEntryRead { get; set; }
    public int EntryReads { get; private set; }
    public CancellationTokenSource? CancelEntryRead { get; set; }
    public Func<CatalogReaderVolume, Task>? AfterJournalRead { get; set; }
    public async Task<ICatalogReaderSession> ConnectAsync(CancellationToken token) => new Session(this, await Base.ConnectAsync(token));
    public static ReaderFileEntrySet Names(params ReaderFileName[] names) => new(11, ReaderFileEntryState.Complete,
        (uint)names.Length, 1024, 132_000_000_000_000_011, 133_000_000_000_000_011, names);

    private sealed class Session(EntryCatalogReaderFixture owner, ICatalogReaderSession inner) : ICatalogReaderSession
    {
        private readonly Dictionary<ulong, ReaderMftRecordV2> observed = [];
        public bool SupportsFileEntryNames => true;
        public ValueTask DisposeAsync() => inner.DisposeAsync();
        public Task<IReadOnlyList<CatalogReaderVolume>> ListVolumesAsync(CancellationToken token) => inner.ListVolumesAsync(token);
        public Task<CatalogReaderInspection> InspectAsync(CatalogReaderVolume volume, CancellationToken token) => inner.InspectAsync(volume, token);
        public Task<CatalogReaderSnapshot> OpenSnapshotAsync(CatalogReaderVolume volume, CancellationToken token) => inner.OpenSnapshotAsync(volume, token);
        public Task CloseSnapshotAsync(ReaderOpaqueId id, CancellationToken token) => inner.CloseSnapshotAsync(id, token);
        public async Task<CatalogReaderSnapshotPage> ReadSnapshotPageAsync(ReaderOpaqueId id, ulong cursor, uint limit, CancellationToken token)
        {
            var page = await inner.ReadSnapshotPageAsync(id, cursor, limit, token);
            foreach (var node in page.Records) observed[node.FileReference] = node;
            return page;
        }
        public async Task<CatalogReaderJournalPage> ReadJournalPageAsync(CatalogReaderVolume volume, ulong journal, long usn, uint limit, CancellationToken token)
        {
            var page = await inner.ReadJournalPageAsync(volume, journal, usn, limit, token);
            foreach (var node in page.Response.Records.Where(node => node.Exists)) observed[node.FileReference] = new(node.FileReference,
                node.ParentFileReference, node.SizeBytes, node.CreationFileTimeUtc, node.LastWriteFileTimeUtc, node.Attributes, node.IsDirectory, node.Name, node.Extension);
            if (owner.AfterJournalRead is { } afterRead) await afterRead(volume);
            return page;
        }
        public Task<IReadOnlyList<ReaderFileEntrySet>> ReadFileEntriesAsync(CatalogReaderVolume volume, IReadOnlyList<ulong> references, CancellationToken token)
        {
            token.ThrowIfCancellationRequested(); owner.EntryReads++;
            if (owner.FailEntryRead) throw new IOException("synthetic-entry-disconnect");
            owner.CancelEntryRead?.Cancel();
            return Task.FromResult<IReadOnlyList<ReaderFileEntrySet>>(references.Select(reference => {
                if (owner.Overrides.TryGetValue(reference, out var value)) return value;
                var node = observed[reference];
                return new ReaderFileEntrySet(reference, ReaderFileEntryState.Complete, 1, node.SizeBytes,
                    node.CreationFileTimeUtc, node.LastWriteFileTimeUtc, [new(node.ParentFileReference, node.Name)]);
            }).ToArray());
        }
    }
}
