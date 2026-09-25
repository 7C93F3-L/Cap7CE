using System.Buffers.Binary;
using System.Text;
using Cap7CE.Core.Reader.Host;

namespace Cap7CE.Core.Tests;

internal static class ReaderNtfsParserTests
{
    public static void Run()
    {
        ParsesMftV2WithoutOpeningAFile();
        ParsesJournalV2WithoutOpeningAFile();
        RejectsUnsupportedAndTruncatedRecords();
    }

    private static void ParsesMftV2WithoutOpeningAFile()
    {
        var name = Encoding.Unicode.GetBytes("sample.png");
        var length = 60 + name.Length;
        var buffer = new byte[8 + length];
        BinaryPrimitives.WriteUInt64LittleEndian(buffer.AsSpan(0, 8), 99);
        WriteV2Record(buffer.AsSpan(8), length, 41, 5, 123, 0x20, name);
        var record = ReaderNtfsVolume.ParseMftForTest(buffer).Single();
        TestAssert.Equal(41UL, record.FileReference, "mft parser id");
        TestAssert.Equal(5UL, record.ParentFileReference, "mft parser parent");
        TestAssert.Equal("sample.png", record.Name, "mft parser name");
        TestAssert.Equal(".png", record.Extension, "mft parser extension");
        TestAssert.False(record.IsDirectory, "mft parser directory");
    }

    private static void ParsesJournalV2WithoutOpeningAFile()
    {
        var name = Encoding.Unicode.GetBytes("renamed.psd");
        var length = 60 + name.Length;
        var buffer = new byte[8 + length];
        BinaryPrimitives.WriteInt64LittleEndian(buffer.AsSpan(0, 8), 501);
        WriteV2Record(buffer.AsSpan(8), length, 77, 6, 500, 0x20, name);
        BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(8 + 40, 4), 0x2000);
        var record = ReaderNtfsVolume.ParseJournalForTest(buffer, 501, 1).Single();
        TestAssert.Equal(500L, record.Usn, "journal parser usn");
        TestAssert.Equal(0x2000u, record.Reason, "journal parser reason");
        TestAssert.Equal("renamed.psd", record.Name, "journal parser name");
    }

    private static void RejectsUnsupportedAndTruncatedRecords()
    {
        var unsupported = new byte[68];
        BinaryPrimitives.WriteUInt32LittleEndian(unsupported.AsSpan(8, 4), 60);
        BinaryPrimitives.WriteUInt16LittleEndian(unsupported.AsSpan(12, 2), 4);
        AssertInvalid(() => ReaderNtfsVolume.ParseMftForTest(unsupported));
        AssertInvalid(() => ReaderNtfsVolume.ParseJournalForTest(new byte[9], 1, 1));
    }

    private static void WriteV2Record(
        Span<byte> record,
        int length,
        ulong id,
        ulong parent,
        long usn,
        uint attributes,
        byte[] name)
    {
        BinaryPrimitives.WriteUInt32LittleEndian(record.Slice(0, 4), checked((uint)length));
        BinaryPrimitives.WriteUInt16LittleEndian(record.Slice(4, 2), 2);
        BinaryPrimitives.WriteUInt64LittleEndian(record.Slice(8, 8), id);
        BinaryPrimitives.WriteUInt64LittleEndian(record.Slice(16, 8), parent);
        BinaryPrimitives.WriteInt64LittleEndian(record.Slice(24, 8), usn);
        BinaryPrimitives.WriteUInt32LittleEndian(record.Slice(52, 4), attributes);
        BinaryPrimitives.WriteUInt16LittleEndian(record.Slice(56, 2), checked((ushort)name.Length));
        BinaryPrimitives.WriteUInt16LittleEndian(record.Slice(58, 2), 60);
        name.CopyTo(record[60..]);
    }

    private static void AssertInvalid(Action action)
    {
        try { action(); }
        catch (InvalidDataException) { return; }
        throw new InvalidOperationException("NTFS parser should reject malformed input.");
    }
}
