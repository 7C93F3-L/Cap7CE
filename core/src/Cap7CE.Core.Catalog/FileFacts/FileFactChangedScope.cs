using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

internal static class FileFactChangedScope
{
    public static string Bind(SqliteCommand command, FileFactCatalogChange? change, string alias = "n")
    {
        if (change is null) return "1";
        command.Parameters.AddWithValue("$changedVolume", change.Identity.VolumeId);
        if (change.ScanDescendants && change.Identity.FileReference == "0000000000000000") return alias + ".volume_id=$changedVolume";
        command.Parameters.AddWithValue("$changedReference", change.Identity.FileReference.ToUpperInvariant());
        return (change.ScanDescendants ? """
            (n.volume_id=$changedVolume AND EXISTS(
                WITH RECURSIVE changed_parents(reference,parent) AS (
                    SELECT n.file_reference,n.parent_file_reference UNION
                    SELECT p.file_reference,p.parent_file_reference FROM catalog_nodes_v2 p
                    JOIN changed_parents a ON p.file_reference=a.parent AND p.volume_id=n.volume_id
                ) SELECT 1 FROM changed_parents WHERE reference=$changedReference))
            """ : "(n.volume_id=$changedVolume AND n.file_reference=$changedReference)").Replace("n.", alias + ".", StringComparison.Ordinal);
    }
}
