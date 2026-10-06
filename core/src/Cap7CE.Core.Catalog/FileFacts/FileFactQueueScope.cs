using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

internal static class FileFactQueueScope
{
    public static string Serialize(FileFactQueuePolicy policy)
    {
        ArgumentNullException.ThrowIfNull(policy);
        if (policy.VolumeOrder is null || policy.Includes is null || policy.Excludes is null
            || policy.VolumeOrder.Count > 64 || policy.Includes.Count > 128 || policy.Excludes.Count > 128
            || policy.VolumeOrder.Distinct(StringComparer.Ordinal).Count() != policy.VolumeOrder.Count)
            throw new ArgumentException("Invalid extraction policy.");
        foreach (var volume in policy.VolumeOrder)
            FileFactDatabase.ValidateIdentity(new(volume, "0000000000000000"));
        foreach (var scope in policy.Includes.Concat(policy.Excludes))
        {
            if (scope is null) throw new ArgumentException("Invalid extraction scope.");
            FileFactDatabase.ValidateIdentity(new(scope.VolumeId, scope.RootFileReference ?? "0000000000000000"));
            if (!policy.VolumeOrder.Contains(scope.VolumeId, StringComparer.Ordinal))
                throw new ArgumentException("Every scope volume must have an explicit priority.");
        }
        return JsonSerializer.Serialize(policy);
    }

    // n is a Catalog node alias. Parent traversal uses identities, never path prefixes.
    // UNION removes cycles in a malformed parent graph.
    public static string Bind(SqliteCommand command, FileFactQueuePolicy policy)
    {
        var index = 0;
        string Match(IReadOnlyList<FileFactScope> scopes)
        {
            var conditions = new List<string>();
            foreach (var scope in scopes)
            {
                var parameter = "$scope" + index++;
                command.Parameters.AddWithValue(parameter, scope.VolumeId);
                if (scope.RootFileReference is null) conditions.Add($"n.volume_id = {parameter}");
                else
                {
                    var root = "$scope" + index++;
                    command.Parameters.AddWithValue(root, scope.RootFileReference.ToUpperInvariant());
                    conditions.Add($"""
                        (n.volume_id = {parameter} AND EXISTS(
                            WITH RECURSIVE parents(reference, parent) AS (
                                SELECT n.file_reference, n.parent_file_reference
                                UNION
                                SELECT p.file_reference, p.parent_file_reference FROM catalog_nodes_v2 p
                                JOIN parents a ON p.file_reference = a.parent AND p.volume_id = n.volume_id
                            ) SELECT 1 FROM parents WHERE reference = {root}))
                        """);
                }
            }
            return conditions.Count == 0 ? "0" : "(" + string.Join(" OR ", conditions) + ")";
        }
        return $"({Match(policy.Includes)} AND NOT {Match(policy.Excludes)})";
    }

    public static string BindOrder(SqliteCommand command, FileFactQueuePolicy policy)
    {
        var cases = new List<string>();
        for (var index = 0; index < policy.VolumeOrder.Count; index++)
        {
            command.Parameters.AddWithValue("$order" + index, policy.VolumeOrder[index]);
            cases.Add($"WHEN $order{index} THEN {index}");
        }
        return cases.Count == 0 ? "(0 + 0)" : "CASE n.volume_id " + string.Join(" ", cases) + " ELSE 64 END";
    }
}
