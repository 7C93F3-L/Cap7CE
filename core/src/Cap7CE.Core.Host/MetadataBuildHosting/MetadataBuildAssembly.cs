using Cap7CE.Core.Host.MetadataWorkers;

namespace Cap7CE.Core.Host.MetadataBuildHosting;

public static class MetadataBuildAssembly
{
    public static void Configure(ProductCoreRuntime runtime, string catalogPath, bool product)
    {
        if (runtime.FileFacts?.CanExecute != true || NodeMetadataResources.FromEnvironment() is not { } resources) return;
        var directory = product ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cap7CE", "Core")
            : Path.Combine(Path.GetDirectoryName(catalogPath)!, "metadata-config");
        runtime.ConfigureMetadataBuild(new(runtime.FileFacts, runtime, resources, directory));
    }
}
