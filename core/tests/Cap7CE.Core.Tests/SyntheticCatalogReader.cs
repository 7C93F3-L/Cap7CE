using System.Collections.Concurrent;
using Cap7CE.Core.Host;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Tests;

internal sealed class SyntheticCatalogReader : ICatalogReaderSessionFactory
{
    private readonly Dictionary<string, VolumeState> volumes;

    public SyntheticCatalogReader()
    {
        volumes = new(StringComparer.Ordinal)
        {
            ["A:"] = new VolumeState(new ReaderOpaqueId(0xA, 0x5), "A:",
            [
                Node(5, 5, ".", true),
                Node(10, 5, "assets", true),
                Node(11, 10, "alpha.png", false, 1_024, ".png"),
                Node(12, 5, "shared.txt", false, 120, ".txt")
            ]),
            ["B:"] = new VolumeState(new ReaderOpaqueId(0xB, 0x5), "B:",
            [
                Node(5, 5, ".", true),
                Node(20, 5, "beta.jpg", false, 2_048, ".jpg"),
                Node(21, 5, "library", true),
                Node(22, 21, "shared.txt", false, 240, ".txt")
            ])
        };
    }

    public bool SlowReads { get; set; }

    public Task<ICatalogReaderSession> ConnectAsync(CancellationToken token) =>
        Task.FromResult<ICatalogReaderSession>(new Session(this));

    public void SetOnline(string displayName, bool online) => volumes[displayName].Online = online;

    public void RenameAndMove(string displayName, ulong reference, ulong parent, string name)
    {
        var volume = volumes[displayName];
        var old = volume.Nodes[reference];
        var updated = old with
        {
            ParentFileReference = parent,
            Name = name,
            Extension = old.IsDirectory ? string.Empty : Path.GetExtension(name),
            LastWriteFileTimeUtc = old.LastWriteFileTimeUtc + 10
        };
        volume.Nodes[reference] = updated;
        volume.AppendJournal(updated, 0x00002000, exists: true);
    }

    public void Add(string displayName, ReaderMftRecordV2 record)
    {
        var volume = volumes[displayName];
        volume.Nodes.Add(record.FileReference, record);
        volume.AppendJournal(record, 0x00000100, exists: true);
    }

    public void Delete(string displayName, ulong reference)
    {
        var volume = volumes[displayName];
        var record = volume.Nodes[reference];
        volume.Nodes.Remove(reference);
        volume.AppendJournal(record, 0x00000200, exists: false);
    }

    public void BreakJournal(string displayName)
    {
        var volume = volumes[displayName];
        volume.JournalId++;
        volume.FirstUsn = volume.NextUsn;
        volume.LowestValidUsn = volume.NextUsn;
        volume.Journal.Clear();
    }

    private static ReaderMftRecordV2 Node(
        ulong reference,
        ulong parent,
        string name,
        bool directory,
        ulong? size = null,
        string extension = "") => new(
            reference,
            parent,
            directory ? null : size,
            132_000_000_000_000_000 + checked((long)reference),
            133_000_000_000_000_000 + checked((long)reference),
            directory ? 0x10u : 0x20u,
            directory,
            name,
            extension);

    private sealed class Session(SyntheticCatalogReader owner) : ICatalogReaderSession
    {
        private readonly ConcurrentDictionary<ReaderOpaqueId, ReaderMftRecordV2[]> snapshots = new();

        public Task<IReadOnlyList<CatalogReaderVolume>> ListVolumesAsync(CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            return Task.FromResult<IReadOnlyList<CatalogReaderVolume>>(owner.volumes.Values
                .Where(volume => volume.Online)
                .Select(volume => volume.Descriptor)
                .ToArray());
        }

        public Task<CatalogReaderInspection> InspectAsync(CatalogReaderVolume volume, CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            var state = Find(volume);
            return Task.FromResult(new CatalogReaderInspection(
                checked((ulong)state.Nodes.Count), state.JournalId,
                state.FirstUsn, state.LowestValidUsn, state.NextUsn));
        }

        public Task<CatalogReaderSnapshot> OpenSnapshotAsync(CatalogReaderVolume volume, CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            var state = Find(volume);
            var id = new ReaderOpaqueId(state.ReaderId.First, checked((ulong)state.SnapshotSequence++));
            var records = state.Nodes.Values.OrderBy(record => record.FileReference).ToArray();
            snapshots[id] = records;
            return Task.FromResult(new CatalogReaderSnapshot(
                id, checked((ulong)records.Length), state.JournalId, state.NextUsn));
        }

        public async Task<CatalogReaderSnapshotPage> ReadSnapshotPageAsync(
            ReaderOpaqueId snapshotId,
            ulong cursor,
            uint limit,
            CancellationToken token)
        {
            if (owner.SlowReads) await Task.Delay(100, token);
            token.ThrowIfCancellationRequested();
            if (!snapshots.TryGetValue(snapshotId, out var records)) throw new InvalidDataException("snapshot-missing");
            var start = checked((int)cursor);
            var count = Math.Min(checked((int)limit), records.Length - start);
            var next = start + count;
            return new CatalogReaderSnapshotPage(
                checked((ulong)next), next == records.Length, records.Skip(start).Take(count).ToArray());
        }

        public Task CloseSnapshotAsync(ReaderOpaqueId snapshotId, CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            snapshots.TryRemove(snapshotId, out _);
            return Task.CompletedTask;
        }

        public Task<CatalogReaderJournalPage> ReadJournalPageAsync(
            CatalogReaderVolume volume,
            ulong journalId,
            long startingUsn,
            uint limit,
            CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            var state = Find(volume);
            if (journalId != state.JournalId
                || startingUsn < state.FirstUsn
                || startingUsn < state.LowestValidUsn
                || startingUsn > state.NextUsn)
            {
                throw new CatalogReaderDiscontinuityException();
            }
            var records = state.Journal
                .Where(record => record.Usn >= startingUsn)
                .OrderBy(record => record.Usn)
                .Take(checked((int)limit))
                .ToArray();
            var next = records.Length == 0 ? state.NextUsn : records[^1].Usn + 1;
            var end = next >= state.NextUsn;
            return Task.FromResult(new CatalogReaderJournalPage(
                end,
                new ReaderJournalReadBatchResponseV2(
                    state.JournalId,
                    state.FirstUsn,
                    state.LowestValidUsn,
                    next,
                    true,
                    records)));
        }

        public ValueTask DisposeAsync()
        {
            snapshots.Clear();
            return ValueTask.CompletedTask;
        }

        private VolumeState Find(CatalogReaderVolume volume) => owner.volumes.Values.Single(candidate =>
            candidate.Online && candidate.ReaderId == volume.ReaderId);
    }

    private sealed class VolumeState
    {
        public VolumeState(ReaderOpaqueId readerId, string displayName, IReadOnlyList<ReaderMftRecordV2> nodes)
        {
            ReaderId = readerId;
            DisplayName = displayName;
            Nodes = nodes.ToDictionary(node => node.FileReference);
            Descriptor = new CatalogReaderVolume(
                readerId,
                $"{readerId.First:X16}{readerId.Second:X16}",
                displayName,
                true);
        }

        public ReaderOpaqueId ReaderId { get; }
        public string DisplayName { get; }
        public CatalogReaderVolume Descriptor { get; }
        public Dictionary<ulong, ReaderMftRecordV2> Nodes { get; }
        public List<ReaderJournalRecordV2> Journal { get; } = [];
        public bool Online { get; set; } = true;
        public ulong JournalId { get; set; } = 77;
        public long FirstUsn { get; set; } = 1;
        public long LowestValidUsn { get; set; } = 1;
        public long NextUsn { get; set; } = 100;
        public int SnapshotSequence { get; set; } = 1;

        public void AppendJournal(ReaderMftRecordV2 record, uint reason, bool exists)
        {
            Journal.Add(new ReaderJournalRecordV2(
                record.FileReference,
                record.ParentFileReference,
                reason,
                NextUsn,
                record.Attributes,
                record.IsDirectory,
                exists,
                record.Name,
                record.Extension,
                exists ? record.SizeBytes : null,
                exists ? record.CreationFileTimeUtc : null,
                exists ? record.LastWriteFileTimeUtc : null));
            NextUsn++;
        }
    }
}
