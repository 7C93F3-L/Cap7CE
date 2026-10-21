namespace Cap7CE.Core.Configuration;

public sealed class FavoriteDirectoryRegistry(FavoriteConfigurationFile file)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    public async Task<IReadOnlyList<FavoriteDirectory>> ExecuteAsync(string operation, string? id = null, string? path = null,
        string? name = null, string? direction = null, string? oldPath = null, string? newPath = null, CancellationToken token = default,
        IReadOnlyList<string>? orderedIds = null, IReadOnlyList<string>? expectedIds = null)
    {
        await gate.WaitAsync(token);
        try
        {
            var current = (await file.ReadAsync(token)).ToList();
            if (operation == "list") return current;
            switch (operation)
            {
                case "add":
                    var selected = FavoriteDirectoryRules.PathValue(path);
                    var label = FavoriteDirectoryRules.NameValue(name ?? FavoriteDirectoryRules.DefaultName(selected));
                    if (current.Any(item => FavoriteDirectoryRules.Key(item.Path) == FavoriteDirectoryRules.Key(selected))) return current;
                    if (current.Count >= FavoriteDirectoryRules.MaximumCount) throw new FavoriteConfigurationException("favorite-directories-limit");
                    current.Add(new(Guid.NewGuid().ToString("D"), selected, label)); break;
                case "rename":
                    var renamed = FavoriteDirectoryRules.NameValue(name); var renameIndex = RequireId(current, id);
                    if (current[renameIndex].Name == renamed) return current;
                    current[renameIndex] = current[renameIndex] with { Name = renamed }; break;
                case "remove": current.RemoveAt(RequireId(current, id)); break;
                case "move":
                    if (direction is not ("up" or "down")) throw new FavoriteConfigurationException("favorite-directory-invalid-direction");
                    var index = RequireId(current, id); var target = index + (direction == "up" ? -1 : 1);
                    if (target < 0 || target >= current.Count) return current;
                    (current[index], current[target]) = (current[target], current[index]); break;
                case "relocate":
                    var source = FavoriteDirectoryRules.PathValue(oldPath); var destination = FavoriteDirectoryRules.PathValue(newPath);
                    current = FavoriteDirectoryRelocation.Apply(current, source, destination).ToList(); break;
                case "reorder":
                    var ordered=FavoriteDirectoryOrder.Apply(current,orderedIds,expectedIds);
                    if(current.SequenceEqual(ordered))return current;
                    current=ordered.ToList();break;
                default: throw new FavoriteConfigurationException("favorite-directory-invalid-operation");
            }
            await file.WriteAsync(current, token); return current;
        }
        finally { gate.Release(); }
    }
    private static int RequireId(List<FavoriteDirectory> items, string? id)
    {
        var index = FavoriteDirectoryRules.IsId(id) ? items.FindIndex(item => item.Id == id) : -1;
        if (index < 0) throw new FavoriteConfigurationException("favorite-directory-not-found"); return index;
    }
}
