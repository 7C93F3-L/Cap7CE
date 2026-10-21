namespace Cap7CE.Core.Configuration;

// Reorder identities only; names and paths always come from the latest configuration.
public static class FavoriteDirectoryOrder
{
    public static IReadOnlyList<FavoriteDirectory> Apply(IReadOnlyList<FavoriteDirectory> current,
        IReadOnlyList<string>? orderedIds,IReadOnlyList<string>? expectedIds)
    {
        if(orderedIds is null||expectedIds is null||orderedIds.Count!=current.Count
            ||orderedIds.Any(id=>!FavoriteDirectoryRules.IsId(id))||orderedIds.Distinct().Count()!=current.Count
            ||!orderedIds.ToHashSet().SetEquals(current.Select(item=>item.Id)))
            throw new FavoriteConfigurationException("favorite-directory-invalid-order");
        if(!expectedIds.SequenceEqual(current.Select(item=>item.Id)))
            throw new FavoriteConfigurationException("favorite-directories-order-changed");
        var byId=current.ToDictionary(item=>item.Id);
        return orderedIds.Select(id=>byId[id]).ToArray();
    }
}
