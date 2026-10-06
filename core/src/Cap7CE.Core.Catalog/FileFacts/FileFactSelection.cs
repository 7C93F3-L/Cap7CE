using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactExtractor(FileFactKind Kind, int ExtractorVersion);
public sealed record FileFactClaimSpecification(IReadOnlyList<FileFactExtractor> Extractors, string? VolumeId = null);

public static class FileFactSelection
{
    public static FileFactQueuePolicy ForVolume(FileFactQueuePolicy policy, string? volumeId)
    {
        if (volumeId is null) return policy;
        if (!policy.VolumeOrder.Contains(volumeId, StringComparer.Ordinal)) throw new ArgumentException("Volume is outside configured order.");
        return new([volumeId], policy.Includes.Where(scope => scope.VolumeId == volumeId).ToArray(),
            policy.Excludes.Where(scope => scope.VolumeId == volumeId).ToArray());
    }

    public static void Validate(FileFactClaimSpecification? specification)
    {
        if (specification is null) return;
        if (specification.Extractors is null || specification.Extractors.Count is < 1 or > 16 ||
            specification.Extractors.Any(item => item is null || !Enum.IsDefined(item.Kind) || item.ExtractorVersion <= 0))
            throw new ArgumentException("Invalid extractor selection.");
        if (specification.VolumeId is not null)
            FileFactDatabase.ValidateIdentity(new(specification.VolumeId, "0000000000000000"));
    }

    internal static string Bind(SqliteCommand command, FileFactClaimSpecification? specification)
    {
        if (specification is null) return "1";
        var conditions = specification.Extractors.Distinct().Select((item, index) => {
            command.Parameters.AddWithValue("$selectedKind" + index, (int)item.Kind);
            command.Parameters.AddWithValue("$selectedExtractor" + index, item.ExtractorVersion);
            return $"(j.kind = $selectedKind{index} AND j.extractor_version = $selectedExtractor{index})";
        });
        var selected = "(" + string.Join(" OR ", conditions) + ")";
        if (specification.VolumeId is null) return selected;
        command.Parameters.AddWithValue("$selectedVolume", specification.VolumeId);
        return selected + " AND j.volume_id = $selectedVolume";
    }
}
