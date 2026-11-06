using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactEvidence(string Kind,string Text);

// Optional sparse search projection. Source mutations invalidate it in the same Catalog transaction.
internal static class FileFactSearchEvidence
{
    private static readonly string[] kinds=["visual_content","embedded_title","embedded_subject","embedded_description","embedded_keywords","software_family","capture_device","media_title","media_artist","media_album","font_family","font_style"];
    public static async Task InitializeAsync(SqliteConnection connection,CancellationToken token)
    {
        using var command=connection.CreateCommand();
        command.CommandText="""
            CREATE TABLE IF NOT EXISTS catalog_embedded_search (
                volume_id TEXT NOT NULL,file_reference TEXT NOT NULL,kind INTEGER NOT NULL,
                evidence_kind TEXT NOT NULL,search_text TEXT NOT NULL CHECK(length(search_text)<=65536),
                created_utc_ticks INTEGER,size_bytes INTEGER NOT NULL,modified_file_time INTEGER NOT NULL,
                PRIMARY KEY(volume_id,file_reference,kind,evidence_kind)
            ) STRICT, WITHOUT ROWID;
            """;
        await command.ExecuteNonQueryAsync(token);
    }
    public static void Validate(FileFactObservation observation)
    {
        if(observation.SearchEvidence is not {} evidence)return;
        if(observation.Kind is not (FileFactKind.ImageDimensions or FileFactKind.Video)||observation.State!=FileFactState.Indexed
            ||evidence.Count>12||evidence.Any(e=>e is null||!kinds.Contains(e.Kind)||string.IsNullOrWhiteSpace(e.Text)||e.Text.Length>65536||e.Text.Contains('\0'))
            ||evidence.Select(e=>e.Kind).Distinct().Count()!=evidence.Count)throw new ArgumentException("Invalid embedded search evidence.");
    }
    public static async Task PublishAsync(SqliteConnection connection,SqliteTransaction transaction,FileFactObservation observation,CancellationToken token)
    {
        using var command=connection.CreateCommand();command.Transaction=transaction;
        FileFactDatabase.BindIdentity(command,observation.Identity);command.Parameters.AddWithValue("$kind",(int)observation.Kind);
        command.CommandText="DELETE FROM catalog_embedded_search WHERE volume_id=$volume AND file_reference=$reference AND kind=$kind;";
        await command.ExecuteNonQueryAsync(token);
        if(observation.SearchEvidence is not {Count:>0} evidence)return;
        command.Parameters.AddWithValue("$size",observation.Source.SizeBytes);command.Parameters.AddWithValue("$modified",observation.Source.ModifiedFileTime);
        var kind=command.Parameters.Add("$evidence",SqliteType.Text);var text=command.Parameters.Add("$text",SqliteType.Text);
        command.CommandText="""
            INSERT INTO catalog_embedded_search SELECT $volume,$reference,$kind,$evidence,$text,created_utc_ticks,$size,$modified
            FROM catalog_nodes_v2 WHERE volume_id=$volume AND file_reference=$reference;
            """;
        foreach(var item in evidence){kind.Value=item.Kind;text.Value=item.Text;await command.ExecuteNonQueryAsync(token);}
    }
    public static string Match(string parameter)=>$"""
        EXISTS(SELECT 1 FROM catalog_embedded_search em WHERE em.volume_id=n.volume_id AND em.file_reference=n.file_reference
          AND em.created_utc_ticks IS n.created_utc_ticks AND em.size_bytes=n.size_bytes AND em.modified_file_time=n.modified_utc_ticks
          AND n.is_directory=0 AND (n.attributes & 0x00441400)=0
          AND em.search_text LIKE {parameter} ESCAPE '\' COLLATE NOCASE)
        """;
    public static async Task<IReadOnlyList<FileFactEvidence>?> ReadAsync(SqliteConnection connection,SqliteTransaction transaction,CatalogEntryIdentity identity,FileFactKind kind,CancellationToken token)
    {
        using var command=connection.CreateCommand();command.Transaction=transaction;FileFactDatabase.BindIdentity(command,identity);
        command.Parameters.AddWithValue("$kind",(int)kind);
        command.CommandText="SELECT evidence_kind,search_text FROM catalog_embedded_search WHERE volume_id=$volume AND file_reference=$reference AND kind=$kind ORDER BY evidence_kind;";
        using var reader=await command.ExecuteReaderAsync(token);var evidence=new List<FileFactEvidence>();
        while(await reader.ReadAsync(token))evidence.Add(new(reader.GetString(0),reader.GetString(1)));
        return evidence.Count==0?null:evidence;
    }
    public static async Task InvalidateAsync(SqliteConnection connection,SqliteTransaction transaction,string volume,string? reference,CancellationToken token)
    {
        using var command=connection.CreateCommand();command.Transaction=transaction;
        command.CommandText="DELETE FROM catalog_embedded_search WHERE volume_id=$volume"+(reference is null?"":" AND file_reference=$reference");
        command.Parameters.AddWithValue("$volume",volume);if(reference is not null)command.Parameters.AddWithValue("$reference",reference.ToUpperInvariant());
        await command.ExecuteNonQueryAsync(token);
    }
}
