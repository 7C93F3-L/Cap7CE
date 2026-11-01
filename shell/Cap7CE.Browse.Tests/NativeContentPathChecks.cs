using Cap7CE.WinUI.Services;

internal static class NativeContentPathChecks
{
    public static void Run()
    {
        var root=Path.Combine(Path.GetTempPath(),"cap7ce-content-"+Guid.NewGuid().ToString("N"));
        var app=Path.Combine(root,"app");Directory.CreateDirectory(app);
        try {
            Check(NativeContentPaths.Root(root)==root,"development content stays beside the runtime");
            File.WriteAllText(Path.Combine(app,"cap7ce-native.json"),"{\"shell\":\"WinUI\"}");
            Check(NativeContentPaths.Root(app)==app,"portable content stays beside its marker");
            File.WriteAllText(Path.Combine(app,"cap7ce-native.json"),"{\"layout\":\"installed-app\"}");
            Check(NativeContentPaths.Root(app)==root,"installed AI content stays outside app");
            Check(NativeContentPaths.Root(app+Path.DirectorySeparatorChar)==root,"installer trailing separator preserves content location");
        }finally{Directory.Delete(root,true);}
    }
    private static void Check(bool value,string message){if(!value)throw new Exception(message);}
}
