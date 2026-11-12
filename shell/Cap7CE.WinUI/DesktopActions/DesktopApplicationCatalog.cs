namespace Cap7CE.WinUI.DesktopActions;
// Windows owns the app registrations and shortcut launch parameters. Never scan installation directories.
internal static class DesktopApplicationCatalog
{
    public static Task<DesktopProgram[]> ReadAsync(CancellationToken token)=>DesktopShellApartment.RunAsync(()=>{
        object? shell=null,folder=null,items=null;
        try {
            shell=Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application",true)!);
            folder=((dynamic)shell!).NameSpace("shell:AppsFolder");items=((dynamic)folder!).Items();
            var result=new List<DesktopProgram>();var count=(int)((dynamic)items).Count;
            for(var i=0;i<count;i++){
                token.ThrowIfCancellationRequested();object? item=null;
                try {
                    item=((dynamic)items).Item(i);string name=((dynamic)item!).Name,id=((dynamic)item).Path;
                    string target=Convert.ToString(((dynamic)item).ExtendedProperty("System.Link.TargetParsingPath"))??"";
                    if(string.IsNullOrWhiteSpace(name)||string.IsNullOrWhiteSpace(id))continue;
                    if(Path.IsPathFullyQualified(id)&&!Path.GetExtension(id).Equals(".exe",StringComparison.OrdinalIgnoreCase))continue;
                    result.Add(new(name,DesktopProgram.AppsPrefix+id){AppId=id,ExecutablePath=Executable(target)});
                }catch(System.Runtime.InteropServices.COMException){}finally{DesktopShellApartment.Release(item);}
            }
            return result.DistinctBy(p=>p.Path,StringComparer.OrdinalIgnoreCase).OrderBy(p=>p.Name,StringComparer.CurrentCultureIgnoreCase).ToArray();
        }finally{DesktopShellApartment.Release(items);DesktopShellApartment.Release(folder);DesktopShellApartment.Release(shell);}
    },token);
    public static Task<DesktopProgram> FromFileAsync(string path)=>DesktopShellApartment.RunAsync(()=>{
        if(!Path.GetExtension(path).Equals(".lnk",StringComparison.OrdinalIgnoreCase))return new DesktopProgram(Path.GetFileNameWithoutExtension(path),path);
        object? shell=null,folder=null,item=null,link=null;
        try {
            shell=Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application",true)!);
            folder=((dynamic)shell!).NameSpace(Path.GetDirectoryName(path));item=((dynamic)folder!).ParseName(Path.GetFileName(path));
            link=((dynamic)item!).GetLink;string target=((dynamic)link!).Path;
            string appId=Convert.ToString(((dynamic)item).ExtendedProperty("System.AppUserModel.ID"))??"";
            return new DesktopProgram(Path.GetFileNameWithoutExtension(path),path){ExecutablePath=Executable(target),AppId=string.IsNullOrWhiteSpace(appId)?null:appId};
        }finally{DesktopShellApartment.Release(link);DesktopShellApartment.Release(item);DesktopShellApartment.Release(folder);DesktopShellApartment.Release(shell);}
    });
    private static string? Executable(string path)=>Path.IsPathFullyQualified(path)&&Path.GetExtension(path).Equals(".exe",StringComparison.OrdinalIgnoreCase)?path:null;
}
