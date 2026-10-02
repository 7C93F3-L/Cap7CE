namespace Cap7CE.Core.Setup;

internal static class CapabilitySetupWindowsCleanup
{
    public static void Finalize(
        CapabilitySetupAction action,
        CapabilitySetupWindowsPolicy policy,
        IReadOnlyList<string> recoveryTrees,
        IReadOnlyList<string> pendingFiles)
    {
        foreach (var path in recoveryTrees) CapabilitySetupWindowsFileSystem.DeleteOwnedTree(path);
        foreach (var path in pendingFiles) CapabilitySetupWindowsFileSystem.DeleteOwnedFile(path);
        if (action != CapabilitySetupAction.Remove && File.Exists(policy.OwnershipPath)) return;
        DeleteEmptyDirectory(policy.Layout.StateDirectory);
        DeleteEmptyParents(policy.Layout.StateDirectory, 2);
        DeleteEmptyParents(policy.Layout.CoreProgramDirectory, 2);
        DeleteEmptyParents(policy.Layout.ReaderProgramDirectory, 2);
        DeleteEmptyParents(policy.Layout.ReaderDataDirectory, 2);
        if (action == CapabilitySetupAction.Remove) DeleteEmptyParents(policy.Layout.CatalogDirectory, 1);
    }

    private static void DeleteEmptyParents(string path, int maximumLevels)
    {
        var current = Directory.GetParent(path);
        for (var level = 0; level < maximumLevels && current is not null; level++)
        {
            if (!DeleteEmptyDirectory(current.FullName)) break;
            current = current.Parent;
        }
    }

    private static bool DeleteEmptyDirectory(string path)
    {
        if (!Directory.Exists(path)) return true;
        var directory = new DirectoryInfo(path);
        if ((directory.Attributes & FileAttributes.ReparsePoint) != 0)
        {
            throw new InvalidDataException("setup-reparse-point");
        }
        if (directory.EnumerateFileSystemInfos().Any()) return false;
        directory.Delete();
        return true;
    }
}
