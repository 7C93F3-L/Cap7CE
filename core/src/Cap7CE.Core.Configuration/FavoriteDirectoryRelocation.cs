namespace Cap7CE.Core.Configuration;

public static class FavoriteDirectoryRelocation
{
    public static IReadOnlyList<FavoriteDirectory> Apply(IReadOnlyList<FavoriteDirectory> items, string oldPath, string newPath)
    {
        var next = items.Select(item => {
            var moved = FavoriteDirectoryRules.Relocate(item.Path, oldPath, newPath);
            return moved == item.Path ? item : item with { Path = moved, Name = FavoriteDirectoryRules.DefaultName(moved) };
        }).ToArray();
        FavoriteDirectoryRules.Validate(next); return next;
    }
}
