using System.Buffers.Binary;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Tests;

internal static class ReaderProtocolTests
{
    public static async Task RunAsync()
    {
        RoundTripsBinaryEnvelope();
        await RoundTripsStreamAsync();
        RejectsMalformedFrames();
        await RejectsTruncatedStreamAsync();
        RoundTripsOperationPayloads();
        RejectsMalformedOperationPayloads();
        FreezesReaderBoundary();
    }

    private static void RoundTripsBinaryEnvelope()
    {
        var payload = new byte[] { 1, 3, 5, 7 };
        var frame = ReaderFrame.Request(ReaderOperation.MftReadPage, 42, payload);
        var encoded = ReaderFrameCodec.Encode(frame);
        var decoded = ReaderFrameCodec.Decode(encoded);
        TestAssert.Equal(ReaderProtocol.HeaderBytes + payload.Length, encoded.Length, "reader frame size");
        TestAssert.Equal(ReaderMessageKind.Request, decoded.Header.Kind, "reader frame kind");
        TestAssert.Equal(ReaderOperation.MftReadPage, decoded.Header.Operation, "reader frame operation");
        TestAssert.Equal(42UL, decoded.Header.RequestId, "reader frame request id");
        TestAssert.True(decoded.Payload.Span.SequenceEqual(payload), "reader frame payload");
        TestAssert.Equal(ReaderProtocol.LegacyMajorVersion, decoded.Header.MajorVersion, "CR/1 frame version");
        var cr2 = ReaderFrameCodec.Decode(ReaderFrameCodec.Encode(
            ReaderFrame.RequestV2(ReaderOperation.VolumeEnumerate, 43, ReadOnlyMemory<byte>.Empty)));
        TestAssert.Equal(ReaderProtocol.CurrentMajorVersion, cr2.Header.MajorVersion, "CR/2 frame version");
    }

    private static async Task RoundTripsStreamAsync()
    {
        await using var stream = new MemoryStream();
        var frame = ReaderFrame.Response(
            ReaderOperation.JournalReadBatch,
            91,
            ReaderStatus.Success,
            ReaderFrameFlags.EndOfStream,
            new byte[] { 2, 4, 6 });
        await ReaderFrameCodec.WriteAsync(stream, frame, CancellationToken.None);
        stream.Position = 0;
        var decoded = await ReaderFrameCodec.ReadAsync(stream, CancellationToken.None);
        TestAssert.Equal(frame.Header, decoded.Header, "reader stream header");
        TestAssert.True(decoded.Payload.Span.SequenceEqual(frame.Payload.Span), "reader stream payload");
    }

    private static void RejectsMalformedFrames()
    {
        var valid = ReaderFrameCodec.Encode(ReaderFrame.Request(ReaderOperation.Status, 1, ReadOnlyMemory<byte>.Empty));
        AssertMutationFails(valid, "invalid-magic", bytes => bytes[0] ^= 0xff);
        AssertMutationFails(valid, "unsupported-version", bytes =>
            BinaryPrimitives.WriteUInt16LittleEndian(bytes.AsSpan(6), 3));
        AssertMutationFails(valid, "invalid-operation", bytes =>
            BinaryPrimitives.WriteUInt16LittleEndian(bytes.AsSpan(12), ushort.MaxValue));
        AssertMutationFails(valid, "invalid-request-id", bytes =>
            BinaryPrimitives.WriteUInt64LittleEndian(bytes.AsSpan(16), 0));
        AssertMutationFails(valid, "payload-length-mismatch", bytes =>
            BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(24), 1));
        AssertMutationFails(valid, "invalid-request-envelope", bytes =>
            BinaryPrimitives.WriteUInt16LittleEndian(bytes.AsSpan(14), (ushort)ReaderFrameFlags.MoreData));

        AssertFailure("payload-too-large", () => ReaderFrameCodec.Encode(ReaderFrame.Request(
            ReaderOperation.MftReadPage,
            2,
            new byte[ReaderProtocol.MaximumPayloadBytes + 1])));
        AssertFailure("conflicting-stream-flags", () => ReaderFrameCodec.Encode(ReaderFrame.Response(
            ReaderOperation.MftReadPage,
            3,
            ReaderStatus.Success,
            ReaderFrameFlags.MoreData | ReaderFrameFlags.EndOfStream,
            ReadOnlyMemory<byte>.Empty)));
        AssertFailure("invalid-error-envelope", () => ReaderFrameCodec.Encode(ReaderFrame.Response(
            ReaderOperation.MftReadPage,
            4,
            ReaderStatus.AccessDenied,
            ReaderFrameFlags.None,
            new byte[] { 9 })));
        AssertFailure("operation-requires-cr2", () => ReaderFrameCodec.Encode(ReaderFrame.Request(
            ReaderOperation.VolumeEnumerate, 5, ReadOnlyMemory<byte>.Empty)));
    }

    private static async Task RejectsTruncatedStreamAsync()
    {
        var encoded = ReaderFrameCodec.Encode(ReaderFrame.Request(
            ReaderOperation.VolumeInspect,
            5,
            new byte[] { 1, 2, 3 }));
        await using var stream = new MemoryStream(encoded[..^1]);
        try
        {
            _ = await ReaderFrameCodec.ReadAsync(stream, CancellationToken.None);
        }
        catch (ReaderProtocolException error)
        {
            TestAssert.Equal("truncated-payload", error.Code, "truncated reader stream");
            return;
        }
        throw new InvalidOperationException("truncated reader stream: expected ReaderProtocolException");
    }

    private static void FreezesReaderBoundary()
    {
        var boundary = ReaderSecurityBoundary.Describe();
        TestAssert.False(boundary.AcceptsArbitraryPaths, "reader arbitrary path boundary");
        TestAssert.False(boundary.AcceptsDevicePaths, "reader device path boundary");
        TestAssert.False(boundary.AcceptsSql, "reader SQL boundary");
        TestAssert.False(boundary.AcceptsCommands, "reader command boundary");
        TestAssert.False(boundary.ReadsFileContent, "reader content boundary");
        TestAssert.False(boundary.WritesSourceVolumes, "reader source write boundary");
        TestAssert.False(boundary.OpensNetworkListeners, "reader network boundary");
        TestAssert.Equal(11, boundary.Operations.Count, "reader operation count");
        TestAssert.Equal(1, boundary.MaximumConcurrentRequests, "reader concurrency limit");
        TestAssert.Equal(64, boundary.MaximumRequestedPages, "reader page request limit");
        TestAssert.Equal(50_000, ReaderProtocol.MaximumRecordsPerFrame, "reader record frame limit");
        TestAssert.Equal(4_096, ReaderProtocol.MaximumRecordsPerPage, "reader page record limit");
        TestAssert.Equal(30_000, ReaderProtocol.DefaultDeadlineMilliseconds, "reader default deadline");
    }

    private static void RoundTripsOperationPayloads()
    {
        var nonce = Enumerable.Range(0, ReaderProtocol.HelloNonceBytes).Select(index => (byte)index).ToArray();
        var helloRequest = ReaderPayloadCodec.DecodeHelloRequest(
            ReaderPayloadCodec.EncodeHelloRequest(new ReaderHelloRequest(nonce, 42)));
        TestAssert.Equal(42u, helloRequest.ClientProcessId, "reader hello client PID");
        TestAssert.True(nonce.SequenceEqual(helloRequest.Nonce), "reader hello nonce");

        var helloResponse = ReaderPayloadCodec.DecodeHelloResponse(
            ReaderPayloadCodec.EncodeHelloResponse(new ReaderHelloResponse(
                nonce, 84, ReaderProtocol.MaximumPayloadBytes, ReaderProtocol.MaximumRecordsPerPage,
                ReaderCapabilities.SnapshotPaging | ReaderCapabilities.JournalPaging)));
        TestAssert.Equal(84u, helloResponse.ServerProcessId, "reader hello server PID");

        var volumeId = new ReaderOpaqueId(7, 11);
        var snapshotId = new ReaderOpaqueId(13, 17);
        var status = ReaderPayloadCodec.DecodeStatusResponse(
            ReaderPayloadCodec.EncodeStatusResponse(new ReaderStatusResponse(
                true, true, true, true, 1, volumeId)));
        TestAssert.True(status.Ready && status.FixtureOnly, "reader fixture status");
        TestAssert.Equal(volumeId, status.PrimaryVolumeId, "reader status volume");

        var inspect = ReaderPayloadCodec.DecodeVolumeInspectResponse(
            ReaderPayloadCodec.EncodeVolumeInspectResponse(new ReaderVolumeInspectResponse(
                volumeId, 3, 23, true, true)));
        TestAssert.Equal(3UL, inspect.RecordCount, "reader inspect records");

        var volumeList = ReaderPayloadCodec.DecodeVolumeEnumerateResponse(
            ReaderPayloadCodec.EncodeVolumeEnumerateResponse(new ReaderVolumeEnumerateResponse(
            [
                new ReaderVolumeDescriptor(volumeId, "A:", true, true, true),
                new ReaderVolumeDescriptor(new ReaderOpaqueId(19, 29), "B:", true, true, true)
            ])));
        TestAssert.Equal(2, volumeList.Volumes.Count, "CR/2 volume discovery");
        var inspectV2 = ReaderPayloadCodec.DecodeVolumeInspectResponseV2(
            ReaderPayloadCodec.EncodeVolumeInspectResponseV2(new ReaderVolumeInspectResponseV2(
                volumeId, 3, 23, 10, 11, 100, true, true)));
        TestAssert.Equal(11L, inspectV2.LowestValidUsn, "CR/2 lowest valid USN");

        var open = ReaderPayloadCodec.DecodeMftOpenSnapshotResponse(
            ReaderPayloadCodec.EncodeMftOpenSnapshotResponse(new ReaderMftOpenSnapshotResponse(
                snapshotId, 3, 23, 100)));
        TestAssert.Equal(snapshotId, open.SnapshotId, "reader snapshot id");
        TestAssert.Equal(23UL, open.JournalId, "reader snapshot journal");
        TestAssert.Equal(100L, open.JournalStartingUsn, "reader snapshot checkpoint");

        var pageRequest = ReaderPayloadCodec.DecodeMftReadPageRequest(
            ReaderPayloadCodec.EncodeMftReadPageRequest(new ReaderMftReadPageRequest(snapshotId, 2, 200)));
        TestAssert.Equal(200u, pageRequest.MaximumRecords, "reader page limit");
        var page = ReaderPayloadCodec.DecodeMftReadPageResponse(
            ReaderPayloadCodec.EncodeMftReadPageResponse(new ReaderMftReadPageResponse(3, true,
            [
                new ReaderMftRecord(3, 1, 128, 1000, 32, false, "fixture-03.png", ".png")
            ])));
        TestAssert.Equal("fixture-03.png", page.Records.Single().Name, "reader record name");
        TestAssert.True(page.EndOfStream, "reader page end");
        var pageV2 = ReaderPayloadCodec.DecodeMftReadPageResponseV2(
            ReaderPayloadCodec.EncodeMftReadPageResponseV2(new ReaderMftReadPageResponseV2(3, true,
            [
                new ReaderMftRecordV2(3, 1, 128, 900, 1000, 32, false, "fixture-03.png", ".png")
            ])));
        TestAssert.Equal(128UL, pageV2.Records.Single().SizeBytes, "CR/2 file size");
        TestAssert.Equal(900L, pageV2.Records.Single().CreationFileTimeUtc, "CR/2 creation time");

        var usnRequest = ReaderPayloadCodec.DecodeMftReadPageRequest(ReaderPayloadCodec.EncodeMftReadPageRequest(new(snapshotId, 0, 20, true)));
        TestAssert.True(usnRequest.IncludeFileUsn, "snapshot USN extension is explicitly requested");
        var usnPage = pageV2 with { Records = [pageV2.Records[0] with { LastUsn = 42 }, pageV2.Records[0] with { LastUsn = null }] };
        var usnRoundtrip = ReaderPayloadCodec.DecodeMftReadPageResponseV2(ReaderPayloadCodec.EncodeMftReadPageResponseV2(usnPage, true), true);
        TestAssert.Equal(42L, usnRoundtrip.Records[0].LastUsn, "negotiated per-file USN roundtrip");
        TestAssert.True(usnRoundtrip.Records[1].LastUsn is null, "unavailable USN remains unavailable");
        TestAssert.True(ReaderPayloadCodec.DecodeMftReadPageResponseV2(ReaderPayloadCodec.EncodeMftReadPageResponseV2(usnPage)).Records[0].LastUsn is null, "legacy wire format stays unchanged");

        var journalRequest = ReaderPayloadCodec.DecodeJournalReadBatchRequest(
            ReaderPayloadCodec.EncodeJournalReadBatchRequest(new ReaderJournalReadBatchRequest(
                volumeId, 23, 100, 20)));
        TestAssert.Equal(100L, journalRequest.StartingUsn, "reader journal start");
        var journal = ReaderPayloadCodec.DecodeJournalReadBatchResponse(
            ReaderPayloadCodec.EncodeJournalReadBatchResponse(new ReaderJournalReadBatchResponse(
                23, 101, true, [new ReaderJournalRecord(
                    3, 1, 0x100, 100, 0x20, false, "fixture-03.png")])));
        TestAssert.Equal(101L, journal.NextUsn, "reader journal next");
        TestAssert.True(journal.Continuous, "reader journal continuity");
        TestAssert.Equal(100L, journal.Records[0].Usn, "reader journal record usn");
        var journalV2 = ReaderPayloadCodec.DecodeJournalReadBatchResponseV2(
            ReaderPayloadCodec.EncodeJournalReadBatchResponseV2(new ReaderJournalReadBatchResponseV2(
                23, 10, 11, 101, true,
                [new ReaderJournalRecordV2(
                    3, 1, 0x100, 100, 0x20, false, true, "fixture-03.png", ".png", 128, 900, 1000)])));
        TestAssert.Equal(10L, journalV2.FirstUsn, "CR/2 journal first USN");
        TestAssert.True(journalV2.Records[0].Exists, "CR/2 journal live fact");

        var close = ReaderPayloadCodec.DecodeMftCloseSnapshotRequest(
            ReaderPayloadCodec.EncodeMftCloseSnapshotRequest(new ReaderMftCloseSnapshotRequest(snapshotId)));
        TestAssert.Equal(snapshotId, close.SnapshotId, "reader close snapshot");
        var cancel = ReaderPayloadCodec.DecodeCancelRequest(
            ReaderPayloadCodec.EncodeCancelRequest(new ReaderCancelRequest(99)));
        TestAssert.Equal(99UL, cancel.TargetRequestId, "reader cancel target");
    }

    private static void RejectsMalformedOperationPayloads()
    {
        AssertFailure("invalid-hello-nonce", () => ReaderPayloadCodec.EncodeHelloRequest(
            new ReaderHelloRequest([1, 2], 4)));
        AssertFailure("invalid-record-limit", () => ReaderPayloadCodec.EncodeMftReadPageRequest(
            new ReaderMftReadPageRequest(new ReaderOpaqueId(1, 2), 0, 0)));
        AssertFailure("invalid-volume-id", () => ReaderPayloadCodec.EncodeVolumeInspectRequest(
            new ReaderVolumeInspectRequest(default)));
        AssertFailure("expected-empty-payload", () => ReaderPayloadCodec.RequireEmpty([1]));
        AssertFailure("truncated-operation-payload", () => ReaderPayloadCodec.DecodeStatusResponse([1, 2]));
        var status = ReaderPayloadCodec.EncodeStatusResponse(new ReaderStatusResponse(
            true, true, true, true, 1, new ReaderOpaqueId(1, 2)));
        AssertFailure("trailing-operation-payload", () =>
            ReaderPayloadCodec.DecodeStatusResponse([.. status, 0]));
        var invalidUtf8 = ReaderPayloadCodec.EncodeMftReadPageResponse(new ReaderMftReadPageResponse(
            1, true, [new ReaderMftRecord(1, 0, 0, 0, 0, false, "a", ".x")]));
        invalidUtf8[58] = 0xff;
        AssertFailure("record-name-invalid-utf8", () => ReaderPayloadCodec.DecodeMftReadPageResponse(invalidUtf8));
    }

    private static void AssertMutationFails(byte[] source, string code, Action<byte[]> mutate)
    {
        var mutated = source.ToArray();
        mutate(mutated);
        AssertFailure(code, () => ReaderFrameCodec.Decode(mutated));
    }

    private static void AssertFailure(string code, Action action)
    {
        try
        {
            action();
        }
        catch (ReaderProtocolException error)
        {
            TestAssert.Equal(code, error.Code, "reader protocol error");
            return;
        }
        throw new InvalidOperationException($"reader protocol error: expected {code}");
    }
}
