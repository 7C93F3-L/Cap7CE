using System.Buffers.Binary;
using System.Text;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Reader.Host;

internal static class ReaderHardLinkBuffer
{
    private static readonly UnicodeEncoding StrictUnicode = new(false, false, true);
    public static IReadOnlyList<ReaderFileName> Decode(ReadOnlySpan<byte> bytes, uint expectedCount)
    {
        if (bytes.Length < 30 || bytes.Length > 1024 * 1024 || expectedCount is < 1 or > 1024) throw new InvalidDataException("reader-link-header");
        var needed = BinaryPrimitives.ReadUInt32LittleEndian(bytes);
        var count = BinaryPrimitives.ReadUInt32LittleEndian(bytes[4..]);
        if (needed < 30 || needed > bytes.Length || count != expectedCount) throw new InvalidDataException("reader-link-incomplete");
        var names = new List<ReaderFileName>(checked((int)count));
        var seen = new HashSet<(ulong, string)>(); var offset = 8;
        for (var index = 0u; index < count; index++) {
            if (offset > needed - 20) throw new InvalidDataException("reader-link-entry");
            var next = BinaryPrimitives.ReadUInt32LittleEndian(bytes[offset..]);
            var parent = BinaryPrimitives.ReadUInt64LittleEndian(bytes[(offset + 8)..]);
            var characters = BinaryPrimitives.ReadUInt32LittleEndian(bytes[(offset + 16)..]);
            if (characters is < 1 or > 1024 || parent == 0 || characters * 2 > needed - offset - 20)
                throw new InvalidDataException("reader-link-name-size");
            string name;
            try { name = StrictUnicode.GetString(bytes.Slice(offset + 20, checked((int)characters * 2))); }
            catch (DecoderFallbackException) { throw new InvalidDataException("reader-link-name-encoding"); }
            if (Encoding.UTF8.GetByteCount(name) > ReaderProtocol.MaximumRecordNameBytes || name is "." or ".."
                || name.IndexOfAny(['\0', '\\', '/', ':', '?', '*', '<', '>', '|', '"']) >= 0 || !seen.Add((parent, name)))
                throw new InvalidDataException("reader-link-name");
            names.Add(new(parent, name));
            if (index + 1 == count) {
                if (next != 0) throw new InvalidDataException("reader-link-tail");
            } else {
                if (next < 20 + characters * 2 || (next & 7) != 0 || next > needed - offset - 20)
                    throw new InvalidDataException("reader-link-offset");
                offset = checked(offset + (int)next);
            }
        }
        return names.AsReadOnly();
    }
}
