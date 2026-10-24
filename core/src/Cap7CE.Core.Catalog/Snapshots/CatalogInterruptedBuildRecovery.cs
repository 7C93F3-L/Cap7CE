namespace Cap7CE.Core.Catalog;

public sealed partial class CatalogV2Database
{
    // Caller must own either this snapshot revision or the exclusive product lease.
    // BeginBuild already invalidated facts. Preserve all published rows and annotations.
    public async Task<bool> RecoverInterruptedBuildAsync(string volumeId,long expectedVolumeRevision,CancellationToken token=default)
    {
        RequireText(volumeId,64,nameof(volumeId));RequireNonNegative(expectedVolumeRevision,nameof(expectedVolumeRevision));
        await using var connection=await OpenAsync(false,token);connection.DefaultTimeout=1;
        using var transaction=connection.BeginTransaction();
        var volume=await ReadVolumeAsync(connection,transaction,volumeId,token);
        if(volume is null||volume.State!=CatalogV2VolumeState.Building||volume.CatalogRevision!=expectedVolumeRevision)return false;
        var revision=NextRevision(await ReadRevisionAsync(connection,transaction,token));
        using var command=connection.CreateCommand();command.Transaction=transaction;
        command.CommandText="""
            UPDATE catalog_volumes_v2 SET state='needsRebuild',catalog_revision=$revision
            WHERE volume_id=$volume AND state='building' AND catalog_revision=$expected;
            """;
        command.Parameters.AddWithValue("$revision",revision);command.Parameters.AddWithValue("$volume",volumeId);
        command.Parameters.AddWithValue("$expected",expectedVolumeRevision);
        if(await command.ExecuteNonQueryAsync(token)!=1)return false;
        await SetRevisionAsync(connection,transaction,revision,token);token.ThrowIfCancellationRequested();transaction.Commit();return true;
    }
}
