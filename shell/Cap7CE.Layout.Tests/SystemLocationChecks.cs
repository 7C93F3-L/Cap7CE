using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;

internal static class SystemLocationChecks
{
    public static void Run(LanguageCatalog catalog)
    {
        var source=new List<SystemLocation>{new("computer","我的电脑 {count}",null),new("home-下载","收到的文件",@"E:\Moved\Incoming"),
            new("home-文档","工作文件",@"D:\Cloud\资料")};
        var snapshot=new SystemLocationSnapshot(source);source.Clear();
        if(snapshot.Locations.Count!=3||snapshot.Folders.Count()!=2)throw new Exception("Location snapshots must own their collection, without inventing a path for Computer.");
        if(snapshot.NameForPath(@"e:\moved\incoming\")!="收到的文件"||snapshot.NameForPath(@"D:\Cloud\资料")!="工作文件")throw new Exception("Known locations must follow their actual redirected paths.");
        if(snapshot.NameForPath(@"C:\Users\someone\Downloads") is not null||snapshot.NameForPath(@"E:\Moved\Incoming\child") is not null)throw new Exception("Ordinary folders must not be classified by names or path prefixes.");
        var crumbs=WorkspacePathRules.Crumbs(@"E:\Moved\Incoming\child",snapshot.Computer!.Name,snapshot.NameForPath);
        if(crumbs[0].Label!="我的电脑 {count}"||crumbs[^2].Label!="收到的文件"||crumbs[^2].Path!=@"E:\Moved\Incoming"||crumbs[^1].Label!="child")throw new Exception("Breadcrumb labels must preserve system names without changing navigation paths.");
        var language=new LanguageSession(catalog);var message=LocationText.ComputerFrom(snapshot);
        foreach(var locale in new[]{"zh-CN","en-US","zh-CN"}) {
            language.Select(locale,"zh-CN");
            if(message.Render(language)!="我的电脑 {count}")throw new Exception("System names must not be translated or interpreted as parameters.");
        }
        var fallback=LocationText.ComputerFrom(new([]));
        language.Select("en-US","zh-CN");if(fallback.Render(language)!="This PC")throw new Exception("Computer has a resource fallback only if Shell lookup failed.");
        Console.WriteLine("System location snapshots passed: redirected paths, renamed labels, stable identity, exact path matching, breadcrumb routing and language independence.");
    }
}
