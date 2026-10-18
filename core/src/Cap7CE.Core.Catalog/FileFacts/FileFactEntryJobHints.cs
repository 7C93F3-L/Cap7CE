using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

// Optional entry-extension hints stay inside Core and never become client authority.
internal static class FileFactEntryJobHints
{
    public static async Task WriteAsync(SqliteConnection connection, SqliteTransaction transaction,
        FileFactJob job, FileFactSourceVersion source, CancellationToken token)
    {
        if (job.PreferredExtension is not { } extension) return;
        Validate(extension);
        using var command = Bind(connection, transaction, job, source);
        command.Parameters.AddWithValue("$extension", extension);
        command.CommandText = """
            INSERT INTO catalog_file_entry_job_hints VALUES($volume,$reference,$kind,$extractor,$size,$modified,$epoch,$revision,$extension)
            ON CONFLICT(volume_id,file_reference,kind,extractor) DO UPDATE SET
                size=excluded.size,modified=excluded.modified,epoch=excluded.epoch,revision=excluded.revision,extension=excluded.extension;
            """;
        await command.ExecuteNonQueryAsync(token);
    }
    public static async Task<string?> ReadAsync(SqliteConnection connection, SqliteTransaction transaction,
        FileFactLease lease, CancellationToken token)
    {
        using var command = Bind(connection, transaction, lease.Job, lease.Source);
        command.CommandText = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='catalog_file_entry_job_hints');";
        if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) == 0) return null;
        command.CommandText = """
            SELECT extension FROM catalog_file_entry_job_hints WHERE volume_id=$volume AND file_reference=$reference
                AND kind=$kind AND extractor=$extractor AND size=$size AND modified=$modified AND epoch=$epoch AND revision=$revision;
            """;
        if (await command.ExecuteScalarAsync(token) is not string extension) return null;
        Validate(extension); return extension;
    }
    private static SqliteCommand Bind(SqliteConnection connection, SqliteTransaction transaction, FileFactJob job, FileFactSourceVersion source)
    {
        var command = connection.CreateCommand(); command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, job.Identity);
        command.Parameters.AddWithValue("$kind", (int)job.Kind); command.Parameters.AddWithValue("$extractor", job.ExtractorVersion);
        command.Parameters.AddWithValue("$size", source.SizeBytes); command.Parameters.AddWithValue("$modified", source.ModifiedFileTime);
        command.Parameters.AddWithValue("$epoch", source.VolumeEpoch); command.Parameters.AddWithValue("$revision", source.ContentRevision);
        return command;
    }
    private static void Validate(string extension)
    {
        if (extension.Length is < 2 or > 16 || extension[0] != '.' || extension[1..].Any(c => !char.IsAsciiLetterOrDigit(c)))
            throw new ArgumentException("Invalid entry extension hint.");
    }
}
