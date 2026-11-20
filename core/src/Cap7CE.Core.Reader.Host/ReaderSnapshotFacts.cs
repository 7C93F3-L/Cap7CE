using System.Runtime.ExceptionServices;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Reader.Host;

// Completes one bounded page before its owner updates the single-threaded cache.
internal static class ReaderSnapshotFacts
{
    public static ReaderBasicFacts?[] Read(IReadOnlyList<ReaderMftRecord> records,
        Func<ulong, bool, ReaderBasicFacts?> readFacts, CancellationToken token)
    {
        if (records.Count > ReaderProtocol.MaximumRecordsPerPage)
            throw new ArgumentOutOfRangeException(nameof(records));
        token.ThrowIfCancellationRequested();
        var facts = new ReaderBasicFacts?[records.Count];
        try
        {
            Parallel.For(0, records.Count, new ParallelOptions
            {
                MaxDegreeOfParallelism = 2,
                CancellationToken = token
            }, index => facts[index] = readFacts(records[index].FileReference, records[index].IsDirectory));
        }
        catch (AggregateException error)
        {
            // Parallel.For has joined all workers. Preserve the caller's failure
            // classification, particularly the service's fatal-memory boundary.
            var failures = error.Flatten().InnerExceptions;
            ExceptionDispatchInfo.Throw(failures.FirstOrDefault(failure => failure is OutOfMemoryException) ?? failures[0]);
        }
        return facts;
    }
}
