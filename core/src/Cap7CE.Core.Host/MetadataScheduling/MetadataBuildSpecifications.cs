using Cap7CE.Core.Catalog.FileFacts;

namespace Cap7CE.Core.Host.MetadataScheduling;

public static class MetadataBuildSpecifications
{
    public static IReadOnlyList<FileFactChangeSpecification> Copy(IReadOnlyList<FileFactChangeSpecification> specifications, bool requireComplete = false)
    {
        if (specifications is null || specifications.Count is < 1 or > 9 || requireComplete && specifications.Count != 9
            || specifications.Any(item => item is null || !Enum.IsDefined(item.Kind) || item.ExtractorVersion < 1 || item.Extensions is not { Count: >= 1 and <= 64 }
                || item.Extensions.Any(extension => extension is null || extension.Length is < 2 or > 16 || extension[0] != '.' || extension[1..].Any(character => !char.IsAsciiLetterOrDigit(character))))
            || specifications.Select(item => item.Kind).Distinct().Count() != specifications.Count) throw new InvalidOperationException("metadata-build-invalid-specification");
        return Array.AsReadOnly(specifications.Select(item => item with { Extensions = Array.AsReadOnly(item.Extensions.ToArray()) }).ToArray());
    }
}
