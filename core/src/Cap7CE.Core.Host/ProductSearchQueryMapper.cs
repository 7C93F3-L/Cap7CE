using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host;

internal static class ProductSearchQueryMapper
{
    public static CatalogV2Query Map(SearchStartRequest request, CatalogQueryCursorKey? after)
    {
        var scope = request.Scope?.Kind switch
        {
            null or "all-volumes" => CatalogQueryScope.AllVolumes(),
            "directory-descendants" when request.Scope.VolumeId is not null && request.Scope.RootFileReference is not null =>
                CatalogQueryScope.Descendants(request.Scope.VolumeId, request.Scope.RootFileReference),
            "direct-children" when request.Scope.VolumeId is not null && request.Scope.RootFileReference is not null =>
                CatalogQueryScope.DirectChildren(request.Scope.VolumeId, request.Scope.RootFileReference),
            "saved-scope" when request.Scope.SavedScopeId is not null => CatalogQueryScope.Saved(request.Scope.SavedScopeId),
            _ => throw Invalid("Search scope is invalid.")
        };
        var type = request.EntryType switch
        {
            null or "any" => CatalogEntryType.Any,
            "file" => CatalogEntryType.File,
            "directory" => CatalogEntryType.Directory,
            _ => throw Invalid("Entry type is invalid.")
        };
        var target = request.TextTarget switch
        {
            null or "name" => CatalogQueryTextTarget.Name,
            "path" => CatalogQueryTextTarget.Path,
            "name-or-path" => CatalogQueryTextTarget.NameOrPath,
            _ => throw Invalid("Text target is invalid.")
        };
        FileFactQueryFilter? facts = null;
        if (request.Facts is { } input)
        {
            var kind = input.Kind switch
            {
                "image-dimensions" => FileFactKind.ImageDimensions,
                "video" => FileFactKind.Video,
                "audio" => FileFactKind.Audio,
                "font" => FileFactKind.Font,
                "model" => FileFactKind.Model,
                "document" => FileFactKind.Document,
                "three-d" => FileFactKind.ThreeD,
                "text-data" => FileFactKind.TextData,
                "archive" => FileFactKind.Archive,
                _ => throw Invalid("Fact kind is invalid.")
            };
            facts = new(kind, input.ExtractorVersion, input.MinimumWidth, input.MaximumWidth,
                input.MinimumHeight, input.MaximumHeight, input.MinimumDurationMilliseconds,
                input.MaximumDurationMilliseconds, Ratio(input.MinimumAspectRatio), Ratio(input.MaximumAspectRatio),
                input.AspectRanges?.Select(range => range is null ? throw Invalid("Aspect interval is invalid.")
                    : new FileFactAspectRange(Ratio(range.Minimum), Ratio(range.Maximum), range.MinimumInclusive, range.MaximumInclusive)).ToArray(),
                input.ShortEdgeRanges?.Select(range => range is null ? throw Invalid("Dimension interval is invalid.")
                    : new FileFactIntegerRange(range.Minimum, range.Maximum)).ToArray(), input.IsAnimated,
                input.VisualGroups?.Select(group => group?.Alternatives is null ? throw Invalid("Visual group is invalid.")
                    : new FileFactVisualGroup(group.Alternatives.Select(alternative => alternative is null ? throw Invalid("Visual alternative is invalid.")
                        : (IReadOnlyList<FileFactVisualConstraint>)alternative.Select(constraint => constraint is null ? throw Invalid("Visual constraint is invalid.")
                            : new FileFactVisualConstraint(constraint.Metric, constraint.Operator, constraint.Value)).ToArray()).ToArray())).ToArray(),
                input.ChannelRanges?.Select(range => range is null ? throw Invalid("Channel range is invalid.") : new FileFactIntegerRange(range.Minimum, range.Maximum)).ToArray(),
                input.Font is { } font ? new(font.WeightRanges?.Select(range => range is null ? throw Invalid("Font weight range is invalid.")
                    : new FileFactIntegerRange(range.Minimum, range.Maximum)).ToArray(), font.Italic, font.SupportsLatin, font.SupportsChinese, font.Variable) : null,
                input.Model is { } model ? new(model.ParameterRanges?.Select(range => range is null ? throw Invalid("Model parameter range is invalid.")
                    : new FileFactLongRange(range.Minimum, range.Maximum)).ToArray(), model.Precisions) : null,
                input.Document is { } document ? new(document.MinimumContentCount, document.MaximumContentCount, document.HasEmbeddedImages,
                    document.MinimumArtboardCount, document.MaximumArtboardCount) : null,
                input.ThreeD is { } threeD ? new(threeD.MinimumTriangleCount, threeD.MaximumTriangleCount, threeD.Structures) : null,
                input.TextData is { } textData ? new(textData.FactKind, textData.MinimumCharacterCount, textData.MaximumCharacterCount,
                    textData.MinimumLineCount, textData.MaximumLineCount, textData.MinimumRecordCount, textData.MaximumRecordCount,
                    textData.MinimumColumnCount, textData.MaximumColumnCount, textData.JsonRootKind) : null,
                input.Archive is { } archive ? new(archive.MinimumFileCount, archive.MaximumFileCount, archive.ContentTypes, archive.Structures) : null);
        }
        var file = request.FileConditions is { } conditions ? new CatalogFileConditions(conditions.Extensions,
            conditions.MinimumSizeBytes, conditions.MaximumSizeBytes, FileTime(conditions.MinimumModifiedFileTime),
            FileTime(conditions.MaximumModifiedFileTime), conditions.ExcludedExtensions) : null;
        return new(request.Query, request.VolumeIds, scope, request.Extension, type, request.PageSize, after, facts, target,
            RandomSeed: request.RandomSeed, FileConditions: file, ExcludeHidden: request.ExcludeHidden, Sort: request.Sort switch {
                CoreSearchSorts.NameAscending => CatalogQuerySort.NameAscending,
                CoreSearchSorts.NameDescending => CatalogQuerySort.NameDescending,
                CoreSearchSorts.ModifiedAscending => CatalogQuerySort.ModifiedAscending,
                CoreSearchSorts.ModifiedDescending => CatalogQuerySort.ModifiedDescending,
                _ => throw Invalid("Search sort is invalid.") });
    }

    private static FileFactRatio? Ratio(CoreSearchRatio? input) => input is null ? null : new(input.Numerator, input.Denominator);
    private static long? FileTime(string? value)
    {
        if (value is null) return null;
        if (value.Length is < 1 or > 19 || !value.All(char.IsAsciiDigit)
            || !long.TryParse(value, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var result))
            throw Invalid("Modified timestamp is invalid.");
        return result;
    }
    private static CoreProtocolException Invalid(string message) => new(CoreErrorCodes.InvalidRequest, message);
}
