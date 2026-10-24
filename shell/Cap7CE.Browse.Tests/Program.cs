using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Controllers;
using Cap7CE.WinUI.Services;

Environment.SetEnvironmentVariable("CAP7CE_BROWSE_TIMING",null);
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
Require(BrowseTiming.ErrorText(capacity).Contains("实时递归"),"filesystem capacity error preserves a useful user message");
Console.WriteLine("BrowseSession routing checks passed: direct/recursive, indexed/unindexed, startup/offline, count-free paging, search scope and navigation cancellation.");
