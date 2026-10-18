using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Tests;

internal static class ReaderFileEntryProtocolTests
{
    public static async Task RunAsync()
    {
        var request = new ReaderFileEntryBatchRequest(new(1,2), [3,4,5], 1);
        var decoded = ReaderPayloadCodec.DecodeFileEntryBatchRequest(ReaderPayloadCodec.EncodeFileEntryBatchRequest(request));
        TestAssert.Equal(request.VolumeId, decoded.VolumeId, "entry request is restricted to opaque volume identity");
        TestAssert.True(request.FileReferences.SequenceEqual(decoded.FileReferences), "bounded opaque file references round trip");
        TestAssert.Equal(1u, decoded.StartIndex, "metadata continuation retains request position");
        var file = new ReaderFileEntrySet(4, ReaderFileEntryState.Complete, 2, 100, 133000000000000001, 133000000000000003,
            [new(5,"one.png"), new(6,"中文.png")]);
        var response = new ReaderFileEntryBatchResponse(3,true,[file,new(5,ReaderFileEntryState.Missing,0,null,null,null,[])]);
        var encoded = ReaderPayloadCodec.EncodeFileEntryBatchResponse(response);
        var result = ReaderPayloadCodec.DecodeFileEntryBatchResponse(encoded);
        TestAssert.Equal(file.CreationFileTimeUtc, result.Files[0].CreationFileTimeUtc, "entry source keeps exact 64-bit identity stamp");
        TestAssert.True(file.Names.SequenceEqual(result.Files[0].Names), "entry parents and UTF-8 names round trip");
        TestAssert.Equal(ReaderFileEntryState.Missing,result.Files[1].State,"physical absence differs from unavailable metadata");
        var frame=ReaderFrame.RequestV2(ReaderOperation.FileEntryNames,7,ReaderPayloadCodec.EncodeFileEntryBatchRequest(request));
        TestAssert.Equal(ReaderOperation.FileEntryNames,ReaderFrameCodec.Decode(ReaderFrameCodec.Encode(frame)).Header.Operation,"new fixed metadata operation stays on CR/2");
        foreach(var invalid in new[] { request with { VolumeId=default }, request with { StartIndex=3 },
            request with { FileReferences=[3,3] }, request with { FileReferences=[0] },
            request with { FileReferences=Enumerable.Range(1,65).Select(i=>(ulong)i).ToArray() } })
            await TestAssert.ThrowsAsync<ReaderProtocolException>(()=>Task.FromResult(ReaderPayloadCodec.EncodeFileEntryBatchRequest(invalid)),"invalid opaque metadata request rejected");
        foreach(var invalid in new[] { file with { LinkCount=3 }, file with { CreationFileTimeUtc=null },
            file with { State=ReaderFileEntryState.Unavailable }, file with { Names=[new(5,"../escape"),new(6,"safe")] },
            file with { Names=[new(5,"same"),new(5,"same")] } })
            await TestAssert.ThrowsAsync<ReaderProtocolException>(()=>Task.FromResult(ReaderPayloadCodec.EncodeFileEntryBatchResponse(new(1,true,[invalid]))),"partial, unknown or malformed names are not accepted as complete");
        foreach(var length in Enumerable.Range(0,encoded.Length))
            await TestAssert.ThrowsAsync<ReaderProtocolException>(()=>Task.FromResult(ReaderPayloadCodec.DecodeFileEntryBatchResponse(encoded.AsSpan(0,length))),"truncated metadata is rejected");
        await TestAssert.ThrowsAsync<ReaderProtocolException>(()=>Task.FromResult(ReaderPayloadCodec.DecodeFileEntryBatchResponse([..encoded,0])),"trailing data is rejected");
        var large = file with { LinkCount=1024, Names=Enumerable.Range(0,1024).Select(i=>new ReaderFileName(5,new string('a',1018)+i.ToString("D4"))).ToArray() };
        await TestAssert.ThrowsAsync<ReaderProtocolException>(()=>Task.FromResult(ReaderPayloadCodec.EncodeFileEntryBatchResponse(new(1,true,[large]))),"byte budget is checked before allocating an oversized output frame");
    }
}
