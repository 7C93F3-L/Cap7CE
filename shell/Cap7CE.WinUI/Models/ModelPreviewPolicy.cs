namespace Cap7CE.WinUI.Models;

internal static class ModelPreviewPolicy
{
    public const long MaximumFileBytes=64*1024*1024,MaximumTotalBytes=256*1024*1024;
    public const int MaximumRequests=128;
    public const string Origin="https://cap7ce-model.invalid/";
    public static bool Supports(string extension)=>extension.ToLowerInvariant() is ".glb" or ".gltf" or ".obj";
    public static string SourceUri(string source)=>Origin+"source/"+Uri.EscapeDataString(Path.GetFileName(source));
    public static string Resolve(string source,string uri)
    {
        var request=new Uri(uri,UriKind.Absolute);
        if(request.GetLeftPart(UriPartial.Authority)+"/"!=Origin||!request.AbsolutePath.StartsWith("/source/",StringComparison.Ordinal)
            ||request.Query.Length!=0)throw new UnauthorizedAccessException();
        var relative=Uri.UnescapeDataString(request.AbsolutePath[8..]);
        if(relative.Contains('\\')||relative.Contains(':')||relative.Split('/').Any(part=>part is "" or "." or ".."))throw new UnauthorizedAccessException();
        var directory=Path.GetDirectoryName(Path.GetFullPath(source))!;
        var path=Path.GetFullPath(Path.Combine(directory,relative.Replace('/',Path.DirectorySeparatorChar)));
        var prefix=directory.EndsWith(Path.DirectorySeparatorChar)?directory:directory+Path.DirectorySeparatorChar;
        if(!path.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new UnauthorizedAccessException();
        if(string.Equals(path,Path.GetFullPath(source),StringComparison.OrdinalIgnoreCase))return path;
        if(Path.GetExtension(path).ToLowerInvariant() is not (".mtl" or ".bin" or ".png" or ".jpg" or ".jpeg" or ".webp" or ".tga" or ".tif" or ".tiff" or ".ktx2" or ".basis"))
            throw new UnauthorizedAccessException();
        return path;
    }
}
