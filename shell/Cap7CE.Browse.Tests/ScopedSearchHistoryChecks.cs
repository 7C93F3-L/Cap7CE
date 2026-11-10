using Cap7CE.WinUI.DesktopActions;
using Cap7CE.WinUI.Models;
internal static class ScopedSearchHistoryChecks
{
    public static void Run()
    {
        static DesktopSearch Item(string term,string path,bool favorite=false,string entry="")=>new(term,path,favorite,entry,new BrowseFilter(),false);
        var options=new DesktopActionOptions{HistoryCount=3,History=[Item("Poster",@"D:\Assets"),Item("Other",@"E:\Assets"),Item("poster",@"D:\Assets"),Item("Photo",@"D:\Assets"),Item("Favorite",@"D:\Assets",true,@"D:\"),Item("Nested",@"D:\Assets",true,@"D:\Assets")]};
        static void Check(bool result,string message){if(!result)throw new Exception(message);}
        Check(ScopedSearchHistory.Select(options,@"d:\assets\",false,"","").SequenceEqual(new[]{"Poster","Photo"}),"History isolates the current directory, ignores path case/trailing separators and deduplicates recent terms");
        Check(ScopedSearchHistory.Select(options,@"D:\Assets",false,"","  PHO ").SequenceEqual(new[]{"Photo"}),"Typed history filtering is case-insensitive and trimmed");
        Check(ScopedSearchHistory.Select(options,@"D:\Assets",true,@"d:\","").SequenceEqual(new[]{"Favorite"}),"Favorites history is isolated by its entry scope as well as directory");
        Check(ScopedSearchHistory.Select(options with{RecordHistory=false},@"D:\Assets",false,"","").Length==0,"Disabling history hides suggestions");
        Check(ScopedSearchHistory.Select(options with{HistoryCount=1},@"D:\Assets",false,"","").SequenceEqual(new[]{"Poster"}),"The shared display count limits most-recent suggestions");
        Check(ScopedSearchHistory.Select(options,"",false,"","").Length==0,"Computer root does not inherit another directory's history");
        Console.WriteLine("Scoped search history: directory/favorite isolation, filtering, deduplication, display count and disable checks passed.");
    }
}
