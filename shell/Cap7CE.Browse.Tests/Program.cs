using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Controllers;
using Cap7CE.WinUI.Services;

Environment.SetEnvironmentVariable("CAP7CE_BROWSE_TIMING",null);
await RuntimePrerequisiteTests.RunAsync();
void Require(bool value,string message){if(!value)throw new Exception(message);}
ShellServices Setup(bool recursive=true)
{
    var services=new ShellServices{Core=new()};
    services.Preferences.Current=services.Preferences.Current with{ComputerWorkspace=new(){Recursive=recursive}};
    return services;
}
var direct=Setup(false);
using(var browse=new BrowseSession(direct)) {
    Require(await browse.NavigateAsync("E:\\"),"direct children open");
    Require(direct.Core!.Requests.Count==0&&direct.Connections==0&&direct.Visuals.Reads is [(_,false)],"direct children never wait for Core");
}
var indexed=Setup();
using(var browse=new BrowseSession(indexed)) {
    Require(await browse.NavigateAsync("E:\\"),"indexed disk opens recursively");
    Require(indexed.Visuals.Reads.Count==0&&!browse.FilesystemBrowsing&&browse.UsesCatalogResults,"indexed disk never enumerates its filesystem");
    var request=(SearchStartRequest)indexed.Core!.Requests.Single(r=>r.Operation==CoreOperations.SearchStart).Body;
    Require(request.Query==""&&request.Scope is {Kind:"directory-descendants",VolumeId:"v"}&&request.EntryType=="file","empty recursive browse uses scoped Catalog search");
    Require(!request.IncludeTotalCount&&request.PageSize==100&&request.Continuation=="live"&&request.ExcludeHidden,"first page skips exact count and retains bounded live paging and hidden policy");
    Require(browse.Items.Count==1&&browse.Items.TotalCount is null&&browse.Items.HasMoreItems,"partial results do not masquerade as an exact total");
    Require(await browse.Items.LoadPage!()==1&&!browse.Items.HasMoreItems,"existing Core continuation loads remaining page");
}
var unindexed=Setup();unindexed.Core!.Queryable=false;
var background=Setup();
using(var browse=new BrowseSession(background)) {
    Require(await browse.NavigateAsync("E:\\"),"initial result opens before background refresh");
    var items=browse.Items;background.Core!.Resolving=new();
    var refresh=browse.NavigateAsync("E:\\",false,true);
    Require(browse.Busy&&!browse.ForegroundBusy&&ReferenceEquals(items,browse.Items)&&browse.Items.HasMoreItems,"background refresh retains results, partial-count meaning and foreground loading state");
    background.Core.Resolving=null;
    Require(await browse.NavigateAsync("E:\\nested"),"user navigation can replace background refresh");
    Require(!await refresh&&!browse.Busy&&!browse.ForegroundBusy&&browse.PathValue=="E:\\nested","cancelled refresh cannot replace the user's navigation or loading state");
    background.Core.Resolving=new();var manual=browse.NavigateAsync("E:\\nested",false);
    Require(browse.Busy&&browse.ForegroundBusy,"manual refresh retains the normal loading state");
    background.Core.Resolving.SetResult();Require(await manual,"manual refresh completes");
}
using(var browse=new BrowseSession(unindexed)) {
    Require(await browse.NavigateAsync("E:\\new-folder"),"unindexed directory still opens");
    Require(unindexed.Visuals.Reads is [(_,true)]&&browse.FilesystemBrowsing&&!browse.UsesCatalogResults,"unindexed recursive browse retains filesystem fallback");
    Require(!unindexed.Core.Requests.Any(r=>r.Operation==CoreOperations.SearchStart),"unresolved scope never starts a broad Catalog query");
}
var startup=Setup();startup.Core=null;startup.Connecting=()=>{startup.Core=new();return Task.CompletedTask;};
using(var browse=new BrowseSession(startup)) {
    Require(await browse.NavigateAsync("E:\\")&&startup.Connections==1&&startup.Visuals.Reads.Count==0,"recursive browse waits for the existing connection action instead of racing into a disk scan");
}
var offline=Setup();offline.Core=null;offline.Connecting=()=>throw new IOException("unavailable");
using(var browse=new BrowseSession(offline)) {
    Require(await browse.NavigateAsync("E:\\small-folder")&&offline.Visuals.Reads.Count==1,"unavailable Core retains plain filesystem access");
}
var search=Setup();search.Core!.Queryable=false;
using(var browse=new BrowseSession(search){Query="needle"}) {
    Require(!await browse.NavigateAsync("E:\\")&&browse.Error is not null&&search.Visuals.Reads.Count==0,"search never silently falls back to an unfiltered filesystem listing");
}
var interrupted=Setup();interrupted.Core!.Resolving=new();
using(var browse=new BrowseSession(interrupted)) {
    var old=browse.NavigateAsync("E:\\");
    Require(await browse.NavigateAsync(""),"home can replace an outstanding recursive request");
    Require(!await old&&browse.PathValue==""&&interrupted.Visuals.Reads.Count==0,"cancelled scope resolution cannot rescan a disk or overwrite newer navigation");
}
var capacity=new IOException("core-cache-operation-failed");capacity.Data["CoreMessage"]="directory-browse-capacity-exceeded";
var language=new Cap7CE.WinUI.Localization.LanguageSession(new(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets/languages.json"))));
Require(Cap7CE.WinUI.Localization.FailureText.From(capacity).Render(language)==language.Text("ui.error.browseCapacity"),"filesystem capacity error preserves its localized recovery message");
var scoped=Setup(false);var saved=scoped.Preferences.Current;
using(var browse=new BrowseSession(scoped)) {
    Require(await browse.OpenLocationAsync("E:\\",true)&&browse.Recursive,"favorite entry uses its own recursive preference");
    Require(await browse.NavigateAsync("")&&browse.PreferenceScope==Cap7CE.WinUI.Models.WorkspacePreferenceScope.Favorites&&browse.Recursive&&browse.EntryPath=="E:\\","breadcrumb home retains the favorite entry and its profile");
    Require(await browse.NavigateAsync("F:\\")&&browse.EntryPath=="E:\\"&&browse.Recursive,"browsing outside the favorite root retains entry identity");
    Require(await browse.OpenLocationAsync("",false)&&!browse.Recursive&&browse.EntryPath=="","explicit Computer entry selects its own profile");
    Require(await browse.NavigateAsync("E:\\")&&!browse.Recursive&&browse.EntryPath=="","Computer drive entry keeps recursion disabled even when bookmarked");
    Require(scoped.Preferences.Current==saved,"navigation does not persist favorite state into Computer preferences");
    Require(await browse.OpenLocationAsync("",true)&&!browse.Recursive&&browse.PreferenceScope==Cap7CE.WinUI.Models.WorkspacePreferenceScope.Computer,"explicit home entry always uses Computer even with a stale favorite flag");
}
var rapid=Setup(false);rapid.Core!.Resolving=new();
using(var browse=new BrowseSession(rapid)) {
    var first=browse.OpenLocationAsync("E:\\",true);
    rapid.Core.Resolving=null;
    Require(await browse.OpenLocationAsync("E:\\nested",true),"second favorite navigation replaces an unfinished entry");
    Require(!await first,"superseded favorite navigation is cancelled");
    await browse.BackAsync();
    Require(browse.PathValue==""&&browse.PreferenceScope==Cap7CE.WinUI.Models.WorkspacePreferenceScope.Computer&&!browse.Recursive,"home history cannot restore a favorite profile captured during an unfinished entry");
    await browse.ForwardAsync();
    Require(browse.PathValue=="E:\\nested"&&browse.Recursive,"forward retains the completed favorite entry profile");
    await browse.BackAsync();
    Require(await browse.NavigateAsync("E:\\")&&!browse.Recursive,"entering a bookmarked drive from Computer cannot select the favorite profile");
}
var samePath=Setup(false);
using(var browse=new BrowseSession(samePath)) {
    Require(await browse.OpenLocationAsync("E:\\",false)&&!browse.Recursive,"Computer can open a bookmarked path independently");
    Require(await browse.OpenLocationAsync("E:\\",true)&&browse.Recursive,"sidebar favorite explicitly selects its profile at the same path");
    await browse.BackAsync();
    Require(browse.PathValue=="E:\\"&&browse.EntryPath==""&&!browse.Recursive,"back restores Computer identity at an identical path");
    await browse.ForwardAsync();
    Require(browse.PathValue=="E:\\"&&browse.EntryPath=="E:\\"&&browse.Recursive,"forward restores favorite identity at an identical path");
    Require(await browse.NavigateAsync("F:\\")&&await browse.OpenLocationAsync("F:\\",true),"another favorite can be entered at the current path");
    await browse.BackAsync();
    Require(browse.PathValue=="F:\\"&&browse.EntryPath=="E:\\","history distinguishes favorite entry anchors even with the same profile and path");
}
Console.WriteLine("BrowseSession routing checks passed: direct/recursive, indexed/unindexed, startup/offline, count-free paging, search scope and navigation cancellation.");
var single=Setup();
using(var browse=new BrowseSession(single)) {
    var closedPreviews=0;
    var preview=new PreviewSelectionController<Cap7CE.WinUI.Models.AssetItem>(item=>item.FullPath,item=>!item.Entry.IsDirectory,_=>{},_=>{},()=>closedPreviews++);
    browse.NavigationStarting+=preserve=>preview.NavigationStarting(browse,preserve);
    Require(await browse.OpenLocationAsync("E:\\",false),"single-page initial directory opens");
    preview.Open(browse,browse.Items,browse.Items[0]);
    Require(await browse.NavigateAsync(browse.PathValue,false,true)&&closedPreviews==0,"retained Catalog refresh keeps the single-page preview attached");
    browse.Query="needle";browse.Filter=new(){Count=1};browse.Random=true;
    Require(await browse.OpenLocationAsync("F:\\",false)&&browse.Query==""&&browse.Filter.Count==0&&!browse.Random,"opening a new directory reuses the page with the existing fresh-entry semantics");
    Require(closedPreviews==1&&browse.CanBack,"ordinary navigation closes the old preview once and retains history");
    await browse.BackAsync();Require(browse.PathValue=="E:\\"&&browse.CanForward,"single-page back history remains available");
    await browse.ForwardAsync();Require(browse.PathValue=="F:\\","single-page forward history remains available");
    single.DeletedPaths.Add(browse.Items[0].FullPath);browse.RemoveDeleted();
    Require(browse.Items.Count==0,"deletion still removes files from the current result collection");
}
Console.WriteLine("Single-page navigation regression passed: entry reset, preview lifetime, retained refresh, history and deletion.");
var delayedPreferences=Setup(false);
using(var browse=new BrowseSession(delayedPreferences)){
    delayedPreferences.Preferences.Current=delayedPreferences.Preferences.Current with{ComputerWorkspace=new(){Recursive=true,Sort="name-descending"}};
    Require(await browse.OpenLocationAsync("E:\\",false)&&browse.Recursive&&browse.Sort=="name-descending","a session created before preference loading must use loaded options on initial navigation");
}
Require(Cap7CE.WinUI.Localization.FailureText.ScopeKey("needsRebuild",true)=="ui.error.scopeRebuildRandom","random unavailable status exposes the existing recovery action");
Require(Cap7CE.WinUI.Localization.FailureText.ScopeKey("building",true)=="ui.error.scopeBuildingRandom","random build status preserves the explicit indexing state");
