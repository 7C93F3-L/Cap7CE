using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;
using System.Text.Json;

namespace Cap7CE.Core.Tests;

internal static class ProductFactSearchTests
{
    // Reuses the independent query fixture before mutation/scale cases.
    public static async Task RunAsync(CatalogV2Database catalog, FileFactDatabase facts)
    {
        await using var runtime = new ProductCoreRuntime(catalog, new NoReader());
        var dispatcher = new CoreRequestDispatcher(runtime, new ProductSearchCursorCodec());
        var sequence = 0;
        async Task<CoreResponseEnvelope> SendAsync(string operation, object body) => await dispatcher.DispatchAsync(
            new(1, "fact-protocol-" + ++sequence, operation, 5_000, CoreProtocolJson.ToElement(body)), CancellationToken.None);
        async Task<SearchPageResponse> SearchAsync(SearchStartRequest request)
        {
            // Exercise the same strict UTF-8 JSON contract used by SC/1, including Chinese paths.
            var bytes = JsonSerializer.SerializeToUtf8Bytes(request, CoreProtocolJson.Options);
            var decoded = JsonSerializer.Deserialize<SearchStartRequest>(bytes, CoreProtocolJson.Options)!;
            return ProtocolClient.ReadBody<SearchPageResponse>(await SendAsync(CoreOperations.SearchStart, decoded));
        }
        var original = new SearchStartRequest("same", 1, CoreSearchSorts.NameAscending, [], EntryType: "file");
        TestAssert.False(CoreProtocolJson.ToElement(original).TryGetProperty("facts", out _), "legacy request omits optional facts");
        var legacy = await SearchAsync(original);
        TestAssert.True(legacy.FactRevision is null, "legacy search does not expose a new fact version");
        TestAssert.False(CoreProtocolJson.ToElement(legacy).TryGetProperty("factRevision", out _), "legacy response retains its wire shape");
        var browse = await SearchAsync(original with { Query = "", PageSize = 100 });
        TestAssert.Equal(7, browse.Items.Count, "product empty query browses all current files");
        var baseFiltered = await SearchAsync(original with { Query = "", PageSize = 1,
            FileConditions = new([".PNG"], 100, 100, "133000000000000003", "133000000000000003") });
        TestAssert.True(baseFiltered.NextCursor is not null && baseFiltered.Items.Single().Extension == ".png", "base filters need no facts and support case insensitive extensions");
        var baseNext = ProtocolClient.ReadBody<SearchPageResponse>(await SendAsync(CoreOperations.SearchNextPage,
            new SearchNextPageRequest(baseFiltered.NextCursor!)));
        TestAssert.True(baseNext.Items.Single().Extension == ".png", "signed cursor preserves base filters");
        var baseCount = 2;
        while (baseNext.NextCursor is { } baseCursor)
        {
            baseNext = ProtocolClient.ReadBody<SearchPageResponse>(await SendAsync(CoreOperations.SearchNextPage, new SearchNextPageRequest(baseCursor)));
            TestAssert.True(baseNext.Items.All(item => item.Extension == ".png"), "all pages retain extension intersection");
            baseCount += baseNext.Items.Count;
        }
        TestAssert.Equal(6, baseCount, "base filtering covers every PNG without unrelated video");
        var manyExtensions = Enumerable.Range(0, 127).Select(index => $".x{index:D3}" + new string('a', 58)).Prepend(".png").ToArray();
        var largeConditions = await SearchAsync(original with { Query = "", PageSize = 1, FileConditions = new(manyExtensions) });
        TestAssert.True(largeConditions.NextCursor!.Length > 8192, "valid bounded format selections can exceed old cursor size");
        var largeNext = ProtocolClient.ReadBody<SearchPageResponse>(await SendAsync(CoreOperations.SearchNextPage, new SearchNextPageRequest(largeConditions.NextCursor!)));
        TestAssert.True(largeNext.Items.Single().Extension == ".png", "maximum format list remains pageable");
        TestAssert.Equal(7, (await SearchAsync(original with { Query = "", PageSize = 100, FileConditions = new([".png", ".MP4"]) })).Items.Count, "extensions combine as OR within overall intersection");
        TestAssert.Equal(0, (await SearchAsync(original with { Query = "", PageSize = 100, FileConditions = new([]) })).Items.Count, "explicit empty extension intersection means no matches");
        TestAssert.Equal(0, (await SearchAsync(original with { Query = "", PageSize = 100,
            FileConditions = new(MinimumModifiedFileTime: "133000000000000004") })).Items.Count, "FILETIME single tick remains exact over JSON");
        TestAssert.Equal(0, (await SearchAsync(original with { Query = "", PageSize = 100,
            FileConditions = new(MinimumSizeBytes: 101) })).Items.Count, "file size boundary");
        foreach (var conditions in new[] { new CoreSearchFileConditions([".png", ".PNG"]),
            new CoreSearchFileConditions(["../png"]),
            new CoreSearchFileConditions(MinimumSizeBytes: 101, MaximumSizeBytes: 100),
            new CoreSearchFileConditions(MinimumModifiedFileTime: "-1"),
            new CoreSearchFileConditions(MaximumModifiedFileTime: "9223372036854775808") })
        {
            var invalidFile = await SendAsync(CoreOperations.SearchStart, original with { FileConditions = conditions });
            TestAssert.Equal(CoreErrorCodes.InvalidRequest, invalidFile.Error!.Code, "invalid base conditions rejected");
        }
        var path = await SearchAsync(original with { Query = @"X:\素材%_\", PageSize = 100, TextTarget = "path" });
        TestAssert.Equal(5, path.Items.Count, "product literal Unicode path matches descendants");
        var filter = new CoreSearchFactFilter("image-dimensions", 1, MinimumWidth: 500,
            MinimumAspectRatio: new(1, 1));
        foreach (var id in new[] { new CatalogEntryIdentity("a", "0000000000000010"), new CatalogEntryIdentity("b", "0000000000000010") })
        {
            var current = (await facts.ReadCurrentAsync(id, FileFactKind.ImageDimensions, 1))!;
            var properties = FileFactImageMetrics.Names.ToDictionary(name => name, _ => 0);
            properties["colorRatio.red"] = 10000;
            await facts.PublishAsync(current with { IsAnimated = true, VisualProperties = properties });
        }
        var imagePage = await SearchAsync(original with { Query = "", PageSize = 1,
            Facts = new("image-dimensions", 1, IsAnimated: true, VisualGroups: [new([[new("colorRatio.red", ">", 1500)]])]) });
        TestAssert.Equal("a:0000000000000010", imagePage.Items.Single().Id, "combined color and animation first page");
        var imageNext = ProtocolClient.ReadBody<SearchPageResponse>(await SendAsync(CoreOperations.SearchNextPage, new SearchNextPageRequest(imagePage.NextCursor!)));
        TestAssert.Equal("b:0000000000000010", imageNext.Items.Single().Id, "signed cursor preserves image detail predicates");
        TestAssert.True(imageNext.NextCursor is null, "unknown image properties stay excluded on later pages");
        var aspectUnion = await SearchAsync(original with { Query = "", PageSize = 1,
            Facts = new("image-dimensions", 1, AspectRanges: [new(Maximum: new(1, 2)), new(Minimum: new(2, 1))]) });
        TestAssert.Equal("a:0000000000000010", aspectUnion.Items.Single().Id, "aspect union first page");
        var aspectNext = ProtocolClient.ReadBody<SearchPageResponse>(await SendAsync(CoreOperations.SearchNextPage, new SearchNextPageRequest(aspectUnion.NextCursor!)));
        TestAssert.Equal("a:0000000000000011", aspectNext.Items.Single().Id, "signed cursor preserves disjoint aspect union");
        TestAssert.True(aspectNext.NextCursor is null, "square between disjoint intervals never enters later page");
        var resolutionUnion = await SearchAsync(original with { Query = "", PageSize = 1,
            Facts = new("image-dimensions", 1, ShortEdgeRanges: [new(350, 450), new(700, 800)]) });
        var resolutionNext = ProtocolClient.ReadBody<SearchPageResponse>(await SendAsync(CoreOperations.SearchNextPage, new SearchNextPageRequest(resolutionUnion.NextCursor!)));
        TestAssert.Equal("a:0000000000000011", resolutionNext.Items.Single().Id, "signed cursor keeps disjoint short-edge intervals");
        TestAssert.True(resolutionNext.NextCursor is null, "short-edge gap excludes square result");
        var filtered = original with { Query = "", Facts = filter };
        var first = await SearchAsync(filtered);
        TestAssert.Equal("a:0000000000000010", first.Items.Single().Id, "product fact first page");
        TestAssert.Equal(await facts.ReadRevisionAsync(), first.FactRevision!.Value, "product fact revision from snapshot");
        TestAssert.True(first.NextCursor is not null, "fact query has cursor");
        // A fact publication must not invalidate an otherwise stable Catalog cursor.
        var extra = new CatalogEntryIdentity("a", "0000000000000010");
        await facts.PublishAsync(new(extra, (await facts.CaptureAsync(extra))!, FileFactKind.ImageDimensions, 1,
            FileFactState.Indexed, 800, 400));
        var next = ProtocolClient.ReadBody<SearchPageResponse>(await SendAsync(CoreOperations.SearchNextPage,
            new SearchNextPageRequest(first.NextCursor!)));
        TestAssert.Equal("b:0000000000000010", next.Items.Single().Id, "cursor keeps all fact conditions and compound identity order");
        TestAssert.True(next.FactRevision > first.FactRevision && next.NextCursor is null, "coverage growth reports revision without restarting pagination");
        try
        {
            await runtime.QueryAsync(filtered, new("same.png", "a", "0000000000000010"), CancellationToken.None,
                (await catalog.ReadRevisionAsync()) + 1);
            throw new InvalidOperationException("Expected stale cursor failure.");
        }
        catch (CoreProtocolException error)
        { TestAssert.Equal(CoreErrorCodes.InvalidCursor, error.Code, "pagination validates Catalog revision inside query snapshot"); }
        var video = await SearchAsync(original with { Query = "", PageSize = 100,
            Facts = new("video", 1, MinimumDurationMilliseconds: 90_000, MaximumDurationMilliseconds: 91_000) });
        TestAssert.Equal("movie.mp4", video.Items.Single().Name, "product duration filter");
        var scoped = await SearchAsync(filtered with { PageSize = 100,
            Scope = new("directory-descendants", "a", "0000000000000002"), TextTarget = "name-or-path", Query = "素材" });
        TestAssert.Equal(1, scoped.Items.Count, "product scope/text/facts compose as intersection");
        TestAssert.Equal(0, (await SearchAsync(filtered with { FileConditions = new(MinimumSizeBytes: 101) })).Items.Count, "base and metadata conditions intersect");
        foreach (var invalid in new[] {
            original with { TextTarget = "all" }, original with { Facts = filter with { Kind = "unknown" } },
            original with { Facts = filter with { MinimumWidth = -1 } },
            original with { Facts = filter with { MaximumAspectRatio = new(0, 1) } },
            original with { Facts = filter with { MinimumDurationMilliseconds = 1 } } })
        {
            var rejected = await SendAsync(CoreOperations.SearchStart, invalid);
            TestAssert.Equal(CoreErrorCodes.InvalidRequest, rejected.Error!.Code, "invalid product filter has validation error");
        }
        var liveFirst = await SearchAsync(original with { Query = "", PageSize = 1,
            Continuation = "live", FileConditions = new([".png"]) });
        var strictFirst = await SearchAsync(original with { Query = "", PageSize = 1 });
        await catalog.SetVolumeSelectionAsync(["a", "b"]);
        var liveNext = ProtocolClient.ReadBody<SearchPageResponse>(await SendAsync(CoreOperations.SearchNextPage,
            new SearchNextPageRequest(liveFirst.NextCursor!)));
        TestAssert.True(liveNext.CatalogRevision > liveFirst.CatalogRevision, "live page accepts a fresh catalog revision");
        TestAssert.True(liveNext.Items.Single().Extension == ".png", "live cursor retains file intersection");
        var strictStale = await SendAsync(CoreOperations.SearchNextPage, new SearchNextPageRequest(strictFirst.NextCursor!));
        TestAssert.Equal(CoreErrorCodes.InvalidCursor, strictStale.Error!.Code, "strict product query remains revision-bound");
        var unknownMode = await SendAsync(CoreOperations.SearchStart, original with { Continuation = "unknown" });
        TestAssert.Equal(CoreErrorCodes.InvalidRequest, unknownMode.Error!.Code, "unrecognized continuation rejected");
        var fixture = new CoreRequestDispatcher(new SyntheticMetadataSearchSource(3), new SearchCursorCodec());
        var unsupported = await fixture.DispatchAsync(new(1, "fixture-facts", CoreOperations.SearchStart, 5_000,
            CoreProtocolJson.ToElement(filtered with { VolumeIds = [SyntheticMetadataSearchSource.VolumeId] })), CancellationToken.None);
        TestAssert.Equal(CoreErrorCodes.InvalidRequest, unsupported.Error!.Code, "fixture never silently ignores product conditions");
    }

    private sealed class NoReader : ICatalogReaderSessionFactory
    {
        public Task<ICatalogReaderSession> ConnectAsync(CancellationToken token) => throw new InvalidOperationException("Query must not connect Reader.");
    }
}
