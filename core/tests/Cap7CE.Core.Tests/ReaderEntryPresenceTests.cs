using System.Buffers.Binary;
using Cap7CE.Core.Reader.Host;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Tests;

internal static class ReaderEntryPresenceTests
{
    public static void Run()
    {
        const ulong target = 0x0001_0000_0000_002A;
        static byte[] Page(ulong reference) {
            var page = new byte[72];
            BinaryPrimitives.WriteUInt64LittleEndian(page, 43);
            BinaryPrimitives.WriteUInt32LittleEndian(page.AsSpan(8), 64);
            BinaryPrimitives.WriteUInt16LittleEndian(page.AsSpan(12), 2);
            BinaryPrimitives.WriteUInt64LittleEndian(page.AsSpan(16), reference);
            BinaryPrimitives.WriteUInt16LittleEndian(page.AsSpan(64), 2);
            BinaryPrimitives.WriteUInt16LittleEndian(page.AsSpan(66), 60);
            page[68] = (byte)'x'; return page;
        }
        TestAssert.Equal(ReaderFileEntryState.Unavailable, ReaderEntryPresence.Classify(target, Page(target)), "present but unreadable identity must not be deleted");
        TestAssert.Equal(ReaderFileEntryState.Missing, ReaderEntryPresence.Classify(target, Page(target + 1)), "next occupied MFT ordinal proves target slot absent");
        TestAssert.Equal(ReaderFileEntryState.Missing, ReaderEntryPresence.Classify(target, Page(target + (1UL << 48))), "reused slot is a different physical identity");
        TestAssert.Equal(ReaderFileEntryState.Unavailable, ReaderEntryPresence.Classify(target, Page(target - 1)), "backwards result is not absence proof");
        foreach (var error in new[] { 5, 87, 303, 1117, 122 })
            TestAssert.Equal(ReaderFileEntryState.Unavailable, ReaderEntryPresence.ReadFailure(error), "ambiguous metadata failure stays unavailable");
        foreach (var error in new[] { 18, 38, 259 })
            TestAssert.Equal(ReaderFileEntryState.Missing, ReaderEntryPresence.ReadFailure(error), "enumeration end proves no occupied target slot");
        foreach (var count in new[] { 0, 8, 16, 60, 67 })
            TestAssert.Equal(ReaderFileEntryState.Unavailable, ReaderEntryPresence.Classify(target, Page(target + 1).AsSpan(0, count)), "truncated metadata never proves absence");
        var badVersion = Page(target + 1); badVersion[12] = 3;
        TestAssert.Equal(ReaderFileEntryState.Unavailable, ReaderEntryPresence.Classify(target, badVersion), "unsupported metadata layout stays unavailable");
        var badName = Page(target + 1); badName[64] = 3;
        TestAssert.Equal(ReaderFileEntryState.Unavailable, ReaderEntryPresence.Classify(target, badName), "malformed metadata stays unavailable");
        var badLength = Page(target + 1); badLength[8] = 255;
        TestAssert.Equal(ReaderFileEntryState.Unavailable, ReaderEntryPresence.Classify(target, badLength), "oversized record stays unavailable");
    }
}
