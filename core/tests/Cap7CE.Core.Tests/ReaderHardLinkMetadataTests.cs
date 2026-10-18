using System.Buffers.Binary;
using System.Runtime.InteropServices;
using Cap7CE.Core.Reader.Host;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.Core.Tests;

internal static class ReaderHardLinkMetadataTests
{
    public static async Task RunAsync()
    {
        var one = new byte[30];
        BinaryPrimitives.WriteUInt32LittleEndian(one,30); BinaryPrimitives.WriteUInt32LittleEndian(one.AsSpan(4),1);
        BinaryPrimitives.WriteUInt64LittleEndian(one.AsSpan(16),5); BinaryPrimitives.WriteUInt32LittleEndian(one.AsSpan(24),1);
        one[28]=(byte)'x';
        TestAssert.Equal("x",ReaderHardLinkBuffer.Decode(one,1).Single().Name,"native name length is UTF-16 characters");
        foreach(var changed in new[]{0,4,8,24}) {
            var bad=(byte[])one.Clone(); bad[changed]=255;
            await TestAssert.ThrowsAsync<InvalidDataException>(()=>Task.FromResult(ReaderHardLinkBuffer.Decode(bad,1)),"malformed metadata has no partial acceptance");
        }
        await TestAssert.ThrowsAsync<InvalidDataException>(()=>Task.FromResult(ReaderHardLinkBuffer.Decode(one,2)),"incomplete native link count rejected");
        if(!OperatingSystem.IsWindows())return;
        var root=Path.Combine(Path.GetTempPath(),"Cap7CE-reader-links-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try {
            var source=Path.Combine(root,"source.txt");var alias=Path.Combine(root,"另一个名字.txt");
            await File.WriteAllTextAsync(source,"private native reader metadata fixture");
            TestAssert.True(CreateHardLinkW(alias,source,IntPtr.Zero),"create only private synthetic link");
            using var handle=CreateFileW(source,0x80,7,IntPtr.Zero,3,0x00200000,IntPtr.Zero);
            TestAssert.False(handle.IsInvalid,"ordinary read-attributes-only fixture handle");
            var names=ReaderHardLinkMetadata.TryRead(handle,2,CancellationToken.None);
            TestAssert.True(names is not null,"native Reader metadata is complete");
            var reference=NativeFileEntryReader.Read(source)!;
            TestAssert.True(names!.Select(name=>$"{name.ParentFileReference:X16}:{name.Name}").Order()
                .SequenceEqual(reference.Entries.Select(name=>name.ParentFileReference+":"+name.Name).Order()),"same-handle Reader metadata matches independent Win32 enumeration");
            using var cancellation=new CancellationTokenSource();cancellation.Cancel();
            await TestAssert.ThrowsAsync<OperationCanceledException>(()=>Task.Run(()=>ReaderHardLinkMetadata.TryRead(handle,2,cancellation.Token)),"Reader metadata honors cancellation");
            TestAssert.True(ReaderHardLinkMetadata.TryRead(handle,1025,CancellationToken.None) is null,"metadata allocation has a fixed entry bound");
        } finally {Directory.Delete(root,recursive:true);}
    }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true,ExactSpelling=true)]
    private static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true,ExactSpelling=true)]
    [return:MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateHardLinkW(string newName,string existingName,IntPtr security);
}
