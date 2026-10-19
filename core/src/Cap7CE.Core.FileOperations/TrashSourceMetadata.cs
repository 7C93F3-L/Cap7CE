namespace Cap7CE.Core.FileOperations;

public static class TrashSourceMetadata
{
    public static void Validate(TrashTarget target, bool followLinks, bool catalog)
    {
        try {
            var source = WindowsDirectorySource.Capture(target.Path, followLinks);
            if (source is null) { _ = File.GetAttributes(target.Path); throw new TrashException(catalog ? "target-changed" : "not-file"); }
            if ((!followLinks && source.IsLink) || source.IsDirectory != target.IsDirectory)
                throw new TrashException(catalog ? "target-changed" : "not-file");
        }
        catch (FileNotFoundException) { throw new TrashException("source-missing"); }
        catch (DirectoryNotFoundException) { throw new TrashException("source-missing"); }
        catch (UnauthorizedAccessException) { throw new TrashException("permission-denied"); }
        catch (IOException) { throw new TrashException("source-unavailable"); }
    }
}
