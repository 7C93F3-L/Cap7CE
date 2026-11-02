using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Cap7CE.Core.Catalog.Queries;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactDiscoveryCursor(string VolumeId, string FileReference, string SpecificationHash);
public sealed record FileFactDiscoveryPage(IReadOnlyList<FileFactJob> Jobs, FileFactDiscoveryCursor? Next);

// Bounded, live keyset discovery from Catalog; neither enumerates directories nor opens source files.
// Changes before a cursor are picked up by a subsequent sweep or the synchronization consumer.
public sealed class FileFactDiscovery(string databasePath)
{
    private readonly FileFactDatabase facts = new(databasePath);

    public Task<FileFactDiscoveryPage> ReadPageAsync(FileFactQueuePolicy policy, FileFactKind kind,
        int extractorVersion, IReadOnlyList<string> extensions, FileFactDiscoveryCursor? after = null,
        int pageSize = 128, CancellationToken token = default)
        => ReadAsync(policy, kind, extractorVersion, extensions, null, after, pageSize, token);

    public Task<FileFactDiscoveryPage> ReadChangedPageAsync(FileFactQueuePolicy policy, FileFactKind kind,
        int extractorVersion, IReadOnlyList<string> extensions, FileFactCatalogChange change,
        FileFactDiscoveryCursor? after = null, int pageSize = 128, CancellationToken token = default)
    {
        ArgumentNullException.ThrowIfNull(change); FileFactDatabase.ValidateIdentity(change.Identity);
        if (change.Sequence < 1) throw new ArgumentException("Invalid change sequence.");
        return ReadAsync(policy, kind, extractorVersion, extensions, change, after, pageSize, token);
    }

    private async Task<FileFactDiscoveryPage> ReadAsync(FileFactQueuePolicy policy, FileFactKind kind,
        int extractorVersion, IReadOnlyList<string> extensions, FileFactCatalogChange? change,
        FileFactDiscoveryCursor? after, int pageSize, CancellationToken token)
    {
        var policyJson = FileFactQueueScope.Serialize(policy);
        ArgumentNullException.ThrowIfNull(extensions);
        if (!Enum.IsDefined(kind) || extractorVersion <= 0 || pageSize is < 1 or > 512
            || extensions.Count is < 1 or > 64 || extensions.Any(extension => extension is null
                || extension.Length is < 2 or > 16 || extension[0] != '.'
                || extension[1..].Any(character => !char.IsAsciiLetterOrDigit(character))))
            throw new ArgumentException("Invalid discovery specification.");
        var normalized = extensions.Select(extension => extension.ToLowerInvariant()).Distinct().Order(StringComparer.Ordinal).ToArray();
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
            JsonSerializer.Serialize(new { policyJson, kind, extractorVersion, normalized, change }))));
        var start = 0;
        if (after is not null)
        {
            FileFactDatabase.ValidateIdentity(new(after.VolumeId, after.FileReference));
            start = policy.VolumeOrder.ToList().IndexOf(after.VolumeId);
            if (start < 0 || after.SpecificationHash != hash) throw new ArgumentException("Discovery cursor specification changed.");
        }
        await using var connection = await facts.OpenAsync(true, token);
        await FileFactSchema.ValidateAsync(connection, token);
        return await CatalogQueryExecution.RunAsync(connection, token, async () =>
        {
            using var transaction = connection.BeginTransaction(deferred: true);
            var entries = await FileFactEntryPolicy.IsActiveAsync(connection, transaction, token);
            var pending = await DirectoryEntries.CatalogFileEntryReadiness.PredicateAsync(connection, transaction, token);
            var jobs = new List<FileFactJob>();
            for (var index = start; index < policy.VolumeOrder.Count && jobs.Count <= pageSize; index++)
            {
                using var command = connection.CreateCommand();
                command.Transaction = transaction;
                var scope = entries ? FileFactEntryPolicy.Bind(command, policy, true) : FileFactQueueScope.Bind(command, policy);
                var changedScope = entries ? "1" : FileFactChangedScope.Bind(command, change);
                command.Parameters.AddWithValue("$volume", policy.VolumeOrder[index]);
                command.Parameters.AddWithValue("$after", index == start && after is not null ? after.FileReference.ToUpperInvariant() : "");
                command.Parameters.AddWithValue("$limit", pageSize + 1 - jobs.Count);
                command.Parameters.AddWithValue("$kind", (int)kind);
                command.Parameters.AddWithValue("$extractor", extractorVersion);
                var extensionParameters = normalized.Select((extension, extensionIndex) =>
                {
                    var parameter = "$extension" + extensionIndex;
                    command.Parameters.AddWithValue(parameter, extension);
                    return parameter;
                }).ToArray();
                var extensionList = string.Join(',', extensionParameters);
                // A broad format prefilter only; authorized aliases and exclusion checks below remain authoritative.
                var formatCandidate = $"(n.extension COLLATE NOCASE IN ({extensionList}) OR EXISTS(SELECT 1 FROM catalog_file_entries format_entry WHERE format_entry.volume_id=n.volume_id AND format_entry.file_reference=n.file_reference AND format_entry.extension COLLATE NOCASE IN ({extensionList})))";
                var preferred = entries ? $"CASE WHEN {formatCandidate} THEN {FileFactEntryDiscoverySql.Bind(command, policy, change, extensionList)} ELSE NULL END" : "NULL";
                var eligible = entries ? "source_extension IS NOT NULL" : $"n.extension COLLATE NOCASE IN ({extensionList})";
                var candidates = await FileFactDiscoveryCandidates.BindAsync(command, policy, policy.VolumeOrder[index], entries, token);
                command.CommandText = $"""
                    {candidates.Prefix}
                    SELECT n.file_reference,{preferred} AS source_extension FROM {candidates.Source}
                    JOIN catalog_volumes_v2 v ON v.volume_id = n.volume_id
                    LEFT JOIN file_fact_volumes fv ON fv.volume_id = n.volume_id
                    LEFT JOIN file_fact_sources fs ON fs.volume_id = n.volume_id AND fs.file_reference = n.file_reference
                    WHERE n.volume_id = $volume AND n.file_reference > $after
                        AND n.exists_flag = 1 AND n.is_directory = 0 AND (n.attributes & 0x00441400) = 0
                        AND n.size_bytes IS NOT NULL AND n.modified_utc_ticks IS NOT NULL
                        AND v.selected = 1 AND v.state = 'ready'
                        AND {pending}
                        AND CASE WHEN {eligible}
                            THEN ({scope} AND {changedScope}) ELSE 0 END
                        AND NOT EXISTS(SELECT 1 FROM file_facts ff
                            WHERE ff.volume_id = n.volume_id AND ff.file_reference = n.file_reference
                                AND ff.kind = $kind AND ff.extractor_version >= $extractor
                                AND ff.size_bytes = n.size_bytes AND ff.modified_file_time = n.modified_utc_ticks
                                AND ff.volume_epoch = COALESCE(fv.epoch, 0)
                                AND ff.content_revision = COALESCE(fs.content_revision, 0))
                    ORDER BY n.file_reference LIMIT $limit;
                    """;
                using var reader = await command.ExecuteReaderAsync(token);
                while (await reader.ReadAsync(token))
                    jobs.Add(new(new(policy.VolumeOrder[index], reader.GetString(0)), kind, extractorVersion, entries ? reader.GetString(1) : null));
            }
            FileFactDiscoveryCursor? next = null;
            if (jobs.Count > pageSize)
            {
                jobs.RemoveAt(jobs.Count - 1);
                var last = jobs[^1].Identity;
                next = new(last.VolumeId, last.FileReference, hash);
            }
            return new FileFactDiscoveryPage(jobs, next);
        });
    }
}
