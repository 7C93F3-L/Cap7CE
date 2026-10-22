using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Reflection.PortableExecutable;

internal static class NativeEntryPointProbe
{
    public static void Run(string root)
    {
        using var file=File.OpenRead(Path.Combine(root,"shell/artifacts/winui/Cap7CE.WinUI.dll"));
        using var pe=new PEReader(file);var metadata=pe.GetMetadataReader();
        var token=pe.PEHeaders.CorHeader?.EntryPointTokenOrRelativeVirtualAddress??0;
        if((token&0xff000000)!=0x06000000)throw new Exception("Native shell must have a managed entry point.");
        var entry=metadata.GetMethodDefinition(MetadataTokens.MethodDefinitionHandle(token&0xffffff));
        var attributes=entry.GetCustomAttributes().Select(handle=>{
            var constructor=metadata.GetCustomAttribute(handle).Constructor;
            if(constructor.Kind!=HandleKind.MemberReference)return "";
            var parent=metadata.GetMemberReference((MemberReferenceHandle)constructor).Parent;
            return parent.Kind==HandleKind.TypeReference?metadata.GetString(metadata.GetTypeReference((TypeReferenceHandle)parent).Name):"";
        }).ToArray();
        if(!attributes.Contains("STAThreadAttribute")||attributes.Contains("AsyncStateMachineAttribute"))
            throw new Exception("The compiled WinUI entry point must preserve STAThread; async Main drops it.");
        Console.WriteLine("passed: compiled WinUI entry point preserves STAThread");
    }
}
