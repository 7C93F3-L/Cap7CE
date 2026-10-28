using System.Runtime.InteropServices;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

// Read the current user's Shell locations once per process. No creation flags,
// folder enumeration, index requests or persistent state.
internal static class SystemLocations
{
    private static readonly (string Id,Guid Folder)[] definitions=[
        ("computer",new("0AC0837C-BBF8-452A-850D-79D08E667CA7")),
        ("home-桌面",new("B4BFCC3A-DB2C-424C-B029-7FE99A87C641")),
        ("home-文档",new("FDD39AD0-238F-46AF-ADB4-6C85480369C7")),
        ("home-下载",new("374DE290-123F-4565-9164-39C4925E467B")),
        ("home-图片",new("33E28130-4E1E-4676-835A-98395C3BC3BB")),
        ("home-音乐",new("4BD8D571-6D19-48D3-BE97-422220080E43")),
        ("home-视频",new("18989B1D-99B5-455B-841C-AB7C74E4DDFC"))
    ];
    public static SystemLocationSnapshot Current {get;}=Read();
    internal static SystemLocationSnapshot Read()
    {
        var result=new List<SystemLocation>();
        foreach(var (id,folder) in definitions) {
            nint pidl=0;
            try {
                if(SHGetKnownFolderIDList(in folder,0,0,out pidl)<0||pidl==0)continue;
                var name=Name(pidl,0);var path=id=="computer"?null:Name(pidl,0x80058000);
                if(!string.IsNullOrWhiteSpace(name)&&(id=="computer"||!string.IsNullOrEmpty(path)))result.Add(new(id,name,path));
            } finally {if(pidl!=0)ILFree(pidl);}
        }
        return new(result);
    }
    public static string? ReadDriveName(string root)
    {
        // Only drive roots are accepted; ordinary files keep their original names.
        if(root.Length!=3||!char.IsAsciiLetter(root[0])||root[1]!=':'||root[2]!='\\')return null;
        nint pidl=0;
        try{return SHParseDisplayName(root,0,out pidl,0,out _)>=0&&pidl!=0?Name(pidl,0):null;}
        finally {if(pidl!=0)ILFree(pidl);}
    }
    private static string? Name(nint pidl,uint form)
    {
        nint text=0;
        try{return SHGetNameFromIDList(pidl,form,out text)>=0&&text!=0?Marshal.PtrToStringUni(text):null;}
        finally {if(text!=0)Marshal.FreeCoTaskMem(text);}
    }
    [DllImport("shell32.dll",ExactSpelling=true)]
    private static extern int SHGetKnownFolderIDList(in Guid folder,uint flags,nint token,out nint pidl);
    [DllImport("shell32.dll",ExactSpelling=true)]
    private static extern int SHGetNameFromIDList(nint pidl,uint form,out nint text);
    [DllImport("shell32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]
    private static extern int SHParseDisplayName(string name,nint bindContext,out nint pidl,uint attributes,out uint actualAttributes);
    [DllImport("shell32.dll",ExactSpelling=true)]
    private static extern void ILFree(nint pidl);
}
