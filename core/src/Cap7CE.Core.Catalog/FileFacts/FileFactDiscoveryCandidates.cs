using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

// Narrow discovery before evaluating the existing physical-identity authorization.
// Names are candidates only: excluded aliases and stale entry sets still fail the final policy.
internal static class FileFactDiscoveryCandidates
{
    public static async Task<(string Prefix,string Source)> BindAsync(SqliteCommand command,FileFactQueuePolicy policy,string volume,bool entries,CancellationToken token)
    {
        var includes=policy.Includes.Where(scope=>scope.VolumeId==volume).ToArray();
        if(includes.Any(scope=>scope.RootFileReference is null))return ("","catalog_nodes_v2 n");
        if(includes.Length==0)return ("","(SELECT * FROM catalog_nodes_v2 WHERE 0) n");
        var parameters=includes.Select((scope,index)=>{
            var parameter="$candidateRoot"+index;
            command.Parameters.AddWithValue(parameter,scope.RootFileReference!.ToUpperInvariant());
            return parameter;
        }).ToArray();
        using(var root=command.Connection!.CreateCommand()) {
            root.Transaction=command.Transaction;
            root.CommandText=$"SELECT EXISTS(SELECT 1 FROM catalog_nodes_v2 WHERE volume_id=$volume AND file_reference IN ({string.Join(',',parameters)}) AND parent_file_reference IS NULL AND is_directory=1 AND exists_flag=1);";
            root.Parameters.AddWithValue("$volume",volume);
            foreach(var parameter in parameters)root.Parameters.AddWithValue(parameter,command.Parameters[parameter].Value);
            if(Convert.ToInt32(await root.ExecuteScalarAsync(token))!=0)return ("","catalog_nodes_v2 n");
        }
        var aliases=entries?"""
            UNION SELECT e.file_reference FROM discovery_dirs d
            CROSS JOIN catalog_file_entries e INDEXED BY catalog_file_entries_parent
                ON e.volume_id=$volume AND e.parent_file_reference=d.reference
            WHERE e.file_reference>$after
            """:"";
        var prefix=$"""
            WITH RECURSIVE discovery_roots(reference) AS ({string.Join(" UNION ",parameters.Select(parameter=>"SELECT "+parameter))}),
            discovery_dirs(reference) AS (
                SELECT reference FROM discovery_roots
                UNION SELECT child.file_reference FROM discovery_dirs d
                CROSS JOIN catalog_nodes_v2 child INDEXED BY catalog_nodes_v2_parent
                    ON child.volume_id=$volume AND child.parent_file_reference=d.reference
                WHERE child.exists_flag=1 AND child.is_directory=1
            ), discovery_candidates(reference) AS MATERIALIZED (
                SELECT reference FROM discovery_roots
                UNION SELECT child.file_reference FROM discovery_dirs d
                CROSS JOIN catalog_nodes_v2 child INDEXED BY catalog_nodes_v2_parent
                    ON child.volume_id=$volume AND child.parent_file_reference=d.reference
                WHERE child.exists_flag=1 AND child.file_reference>$after
                {aliases}
            )
            """;
        return (prefix,"discovery_candidates candidate CROSS JOIN catalog_nodes_v2 n ON n.volume_id=$volume AND n.file_reference=candidate.reference");
    }
}
