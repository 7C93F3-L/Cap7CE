using Cap7CE.Core.Adapters;

namespace Cap7CE.Core.Host;

public sealed class SyntheticMetadataSearchSource : IMetadataSearchSource
{
    public const string VolumeId = "synthetic-volume";
    private static readonly string[] Extensions = ["png", "jpg", "psd", "pdf", "txt", "mp4", "wav", "ttf"];
    private readonly int itemCount;

    public SyntheticMetadataSearchSource(int itemCount = 100_000)
    {
        if (itemCount < 1) throw new ArgumentOutOfRangeException(nameof(itemCount));
        this.itemCount = itemCount;
    }

    public long CatalogRevision => 1;

    public async Task<MetadataSearchPage> ReadPageAsync(
        MetadataSearchPageRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Query == "slow-fixture")
        {
            for (var step = 0; step < 30; step++)
            {
                await Task.Delay(10, cancellationToken);
            }
            return new MetadataSearchPage([], null);
        }

        var items = new List<MetadataSearchItem>(request.PageSize);
        var index = request.Offset;
        for (; index < itemCount; index++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var extension = Extensions[(int)(index % Extensions.Length)];
            var name = $"fixture-{index:D5}.{extension}";
            var relativePath = $"synthetic/group-{index % 16:D2}/{name}";
            if (request.Query.Length == 0
                || name.Contains(request.Query, StringComparison.OrdinalIgnoreCase)
                || relativePath.Contains(request.Query, StringComparison.OrdinalIgnoreCase))
            {
                if (items.Count == request.PageSize)
                {
                    return new MetadataSearchPage(items, index);
                }
                items.Add(new MetadataSearchItem(
                    $"synthetic-{index:D5}",
                    name,
                    relativePath,
                    extension,
                    false));
            }
        }
        return new MetadataSearchPage(items, null);
    }
}
