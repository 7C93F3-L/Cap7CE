using System.Threading.Channels;
using Cap7CE.Core.Host;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Tests;

internal sealed class WaitingCatalogReader(SyntheticCatalogReader source) : ICatalogReaderSessionFactory
{
    public bool Supported { get; set; } = true;
    public int Connects { get; private set; }
    public int Disposals { get; private set; }
    public int Active { get; private set; }
    public int MaximumActive { get; private set; }
    public int Inspections { get; private set; }
    public List<string> PageOrder { get; } = [];
    public Channel<bool> Pulses { get; } = Channel.CreateUnbounded<bool>();
    public Channel<int> Waits { get; } = Channel.CreateUnbounded<int>();
    public async Task<ICatalogReaderSession> ConnectAsync(CancellationToken token)
    {
        var inner = await source.ConnectAsync(token);
        Connects++; Active++; MaximumActive = Math.Max(MaximumActive, Active);
        return new Session(this, inner);
    }
    private sealed class Session(WaitingCatalogReader owner, ICatalogReaderSession inner) : ICatalogReaderSession
    {
        private int waits;
        public bool SupportsJournalChangeWait => owner.Supported;
        public Task<IReadOnlyList<CatalogReaderVolume>> ListVolumesAsync(CancellationToken token) => inner.ListVolumesAsync(token);
        public Task<CatalogReaderInspection> InspectAsync(CatalogReaderVolume volume, CancellationToken token) {
            owner.Inspections++; return inner.InspectAsync(volume, token);
        }
        public Task<CatalogReaderSnapshot> OpenSnapshotAsync(CatalogReaderVolume volume, CancellationToken token) => inner.OpenSnapshotAsync(volume, token);
        public Task<CatalogReaderSnapshotPage> ReadSnapshotPageAsync(ReaderOpaqueId id, ulong cursor, uint limit, CancellationToken token) => inner.ReadSnapshotPageAsync(id, cursor, limit, token);
        public Task CloseSnapshotAsync(ReaderOpaqueId id, CancellationToken token) => inner.CloseSnapshotAsync(id, token);
        public Task<CatalogReaderJournalPage> ReadJournalPageAsync(CatalogReaderVolume volume, ulong journal, long cursor, uint limit, CancellationToken token) {
            owner.PageOrder.Add(volume.DisplayName); return inner.ReadJournalPageAsync(volume, journal, cursor, Math.Min(limit, 2), token);
        }
        public async Task<ReaderJournalWaitResponse> WaitForChangesAsync(IReadOnlyList<ReaderJournalWaitCursor> cursors, uint waitMilliseconds, CancellationToken token)
        {
            if (!owner.Supported) throw new NotSupportedException();
            owner.Waits.Writer.TryWrite(++waits);
            if (await owner.Pulses.Reader.ReadAsync(token)) return new([], true);
            var volumes = await inner.ListVolumesAsync(token); var changed = new List<ReaderOpaqueId>();
            foreach (var cursor in cursors) {
                var volume = volumes.Single(item => item.ReaderId == cursor.VolumeId);
                var state = await inner.InspectAsync(volume, token);
                if (cursor.JournalId != state.JournalId || cursor.StartingUsn != state.NextUsn || cursor.StartingUsn < state.LowestValidUsn)
                    changed.Add(cursor.VolumeId);
            }
            return new(changed, false);
        }
        public async ValueTask DisposeAsync() {
            await inner.DisposeAsync(); owner.Disposals++; owner.Active--;
        }
    }
}

internal sealed class CatalogMonitorTime : TimeProvider
{
    private long ticks;
    public override long TimestampFrequency => TimeSpan.TicksPerSecond;
    public override long GetTimestamp() => Interlocked.Read(ref ticks);
    public void Advance(TimeSpan duration) => Interlocked.Add(ref ticks, duration.Ticks);
}
