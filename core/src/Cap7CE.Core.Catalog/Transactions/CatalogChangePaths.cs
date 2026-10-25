using Microsoft.Data.Sqlite;
using Cap7CE.Core.Catalog.DirectoryEntries;

namespace Cap7CE.Core.Catalog;

public sealed record CatalogDirectoryImpact(long Revision,string VolumeId,IReadOnlyList<string>? RelativePaths);

// Bounded primary-key lookups in the publication transaction, before and after changes.
// Null means the caller must invalidate the whole volume; never infer completeness.
internal static class CatalogChangePaths
{
    public static async Task<HashSet<string>?> ReadAsync(SqliteConnection connection,SqliteTransaction transaction,
        CatalogV2WriteBatch batch,CancellationToken token)
    {
        var nodes=batch.Nodes.Where(n=>!n.SuppressFileFactChangeHint).ToArray();
        if(nodes.Length is 0 or >512||batch.DeferredEntries is {Count:>0})return null;
        var entries=await CatalogFileEntrySchema.ExistsAsync(connection,token,transaction);
        if(!entries&&nodes.Any(n=>!n.IsDirectory))return null;
        using var command=connection.CreateCommand();command.Transaction=transaction;
        var names=nodes.Select((n,i)=>{var key="$r"+i;command.Parameters.AddWithValue(key,n.Identity.FileReference);return key;}).ToArray();
        command.Parameters.AddWithValue("$volume",batch.VolumeId);
        var fileJoin=entries?"LEFT JOIN catalog_file_entries e ON e.volume_id=n.volume_id AND e.file_reference=n.file_reference":"";
        var parent=entries?"CASE WHEN n.is_directory=1 THEN n.file_reference ELSE e.parent_file_reference END":"n.file_reference";
        var path=entries?"CASE WHEN n.is_directory=1 THEN p.relative_path WHEN e.entry_key IS NULL OR p.relative_path IS NULL THEN NULL WHEN p.relative_path='' THEN e.name ELSE p.relative_path||'\\'||e.name END":"p.relative_path";
        command.CommandText=$"SELECT {path} FROM catalog_nodes_v2 n {fileJoin} LEFT JOIN catalog_directory_paths_v2 p ON p.volume_id=n.volume_id AND p.file_reference={parent} WHERE n.volume_id=$volume AND n.file_reference IN ({string.Join(',',names)}) AND n.exists_flag=1;";
        using var reader=await command.ExecuteReaderAsync(token);var paths=new HashSet<string>(StringComparer.OrdinalIgnoreCase);var length=0;
        while(await reader.ReadAsync(token)) {
            if(reader.IsDBNull(0))return null;
            var value=reader.GetString(0);if(paths.Add(value))length+=value.Length;
            if(paths.Count>256||length>32768)return null;
        }
        return paths;
    }
    public static string[]? Merge(HashSet<string>? before,HashSet<string>? after)
    {
        if(before is null||after is null)return null;
        before.UnionWith(after);
        return before.Count is >0 and <=256&&before.Sum(p=>p.Length)<=32768?before.ToArray():null;
    }
}
