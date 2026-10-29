using Cap7CE.WinUI.Controllers;
using Cap7CE.WinUI.Models;
await TrayChecks.RunAsync();
await QuickCommandChecks.RunAsync();
await DiagnosticsArchiveChecks.RunAsync();

if(args is ["--shortcut-tests"]) {await ShortcutChecks.RunAsync();return;}
await ShortcutChecks.RunAsync();

if(args is ["--task-notification-tests"]) {TaskNotificationChecks.Run();return;}
TaskNotificationChecks.Run();

if(args is ["--notification-tests"]) {await NotificationChecks.RunAsync();return;}
await NotificationChecks.RunAsync();

if(args is ["--edge-collapse-tests"]) {await EdgeCollapseChecks.RunAsync();return;}
await EdgeCollapseChecks.RunAsync();

if(args is ["--system-location-tests"]) {NativeSystemLocationChecks.Run();return;}
if(args is ["--language-tests"]) {LanguageChecks.Run();await LanguagePreferenceChecks.RunAsync();return;}
LanguageChecks.Run();
await LanguagePreferenceChecks.RunAsync();

if(args is ["--settings-origin-tests"]) {await SettingsOriginChecks.RunAsync();return;}
if(args is ["--core-exit-fixture"]) {Console.ReadLine();Console.Error.WriteLine("controlled-core-failure");Environment.ExitCode=7;return;}
if(args is ["--catalog-refresh-tests"]) {CatalogRefreshChecks.Run();await CoreProcessChecks.RunAsync();await CoreRequestSenderChecks.RunAsync();return;}
if(args is ["--metadata-task-tests"]) {await MetadataTaskChecks.RunAsync();MetadataPanelChecks.Run();await MetadataExclusionChecks.RunAsync();return;}
await MetadataTaskChecks.RunAsync();
MetadataPanelChecks.Run();
await MetadataExclusionChecks.RunAsync();
var checks = 0;
await KeywordBatchChecks.RunAsync();
KeywordDraftChecks.Run();
await AutoKeywordChecks.RunAsync();
PreviewSelectionChecks.Run();
await RpcLifetimeChecks.RunAsync();
CatalogRefreshChecks.Run();
WorkspacePreferenceChecks.Run();
void CheckReveal(double top,double height,double offset,double viewport,double maximum,double expected)
{
    if(Math.Abs(GalleryGeometry.RevealOffset(new(0,0,top,100,height),offset,viewport,maximum)-expected)>.001)
        throw new Exception("Gallery keyboard navigation must scroll only enough to reveal its target");
}
CheckReveal(300,100,0,600,2000,0); // Third visible row stays in place.
CheckReveal(320,100,200,600,2000,200); // Same-row navigation preserves a scrolled viewport.
CheckReveal(100,100,200,600,2000,100); // Above the viewport.
CheckReveal(750,100,200,600,2000,250); // Only reveal the bottom edge.
CheckReveal(200,100,200,600,2000,200); // Exactly at the top.
CheckReveal(700,100,200,600,2000,200); // Exactly at the bottom.
CheckReveal(100,900,200,600,2000,200); // Oversized item spanning the viewport.
CheckReveal(900,900,200,600,2000,900); // Oversized item below the viewport.
CheckReveal(2100,100,200,600,1500,1500); // Clamp to the content end.
await AnimationSourceChecks.RunAsync();
TextPreviewChecks.Run();
FontPreviewChecks.Run();
PreviewSpaceKeyChecks.Run();
var policy = new WorkspaceLayoutPolicy();
WorkspaceLayoutSnapshot Size(double width, double height, double left = 156, double right = 280, bool filters = true, bool details = true)
    => policy.Update(width, height, left, right, filters, details);
void Require(bool value, string message) { checks++; if (!value) throw new Exception(message); }

Require(Size(1100,800).DetailsVisible, "wide startup shows details");
Require(!Size(899,800).DetailsVisible, "width below 900 hides details");
Require(!Size(930,800).DetailsVisible, "width recovery interval remains closed");
Require(Size(960,800).DetailsVisible, "960 restores details");
Require(Size(900,800).DetailsVisible, "900 remains open when shrinking");
Require(!Size(1100,519).FiltersVisible && !Size(1100,519).DetailsVisible, "low height hides both panels");
Require(!Size(1100,540).FiltersVisible && !Size(1100,540).DetailsVisible, "height recovery interval remains closed");
Require(Size(1100,560).FiltersVisible && Size(1100,560).DetailsVisible, "560 restores both panels");
Require(!Size(1100,800,details:false).DetailsVisible, "manual close remains closed");
Size(700,400,details:false); Require(!Size(1100,800,details:false).DetailsVisible, "automatic recovery cannot undo manual close");
Require(!Size(1100,800,filters:false).FiltersVisible, "manual filter close remains closed");
Require(!Size(899,400).DetailsVisible, "combined constraints");
Require(!Size(930,800).DetailsVisible && Size(930,800).FiltersVisible, "height recovery cannot bypass width recovery");
Require(Size(960,800).DetailsVisible, "width recovery after height recovery");

policy = new();
Require(Size(400,800,188).SidebarWidth == 140, "narrow width reduces rendered sidebar only");
Require(Size(300,800,188).SidebarWidth == 40 && Size(300,800,188).SidebarCompact, "minimum sidebar becomes icon rail");
Require(Size(1100,800,188).SidebarWidth == 188, "wide view restores chosen sidebar width");
Require(Size(1100,800,89).SidebarCompact && !Size(1100,800,90).SidebarCompact, "icon threshold is 90");
Require(!Size(1100,800,95).BrandVisible && Size(1100,800,96).BrandVisible, "brand threshold is 95");
Require(!Size(1100,359).SidebarVisible && Size(1100,360).SidebarVisible, "short window releases sidebar column");
foreach(var recursive in new[]{false,true}) {
    Require(BrowseScopeRules.DirectoryScope("",recursive,true)=="directory-descendants", "filters search descendants regardless of browsing preference");
    Require(BrowseScopeRules.DirectoryScope("image",recursive,false)=="directory-descendants", "keywords search descendants regardless of browsing preference");
    Require(BrowseScopeRules.DirectoryScope("",recursive,false)==(recursive?"directory-descendants":"direct-children"), "clearing retrieval restores browsing preference");
    Require(BrowseScopeRules.EntryType("image",recursive,false)=="file", "keyword search excludes folders regardless of browsing preference");
    Require(BrowseScopeRules.EntryType("",recursive,false)==(recursive?"file":"any"), "clearing keywords restores normal flat or hierarchical browsing");
    Require(BrowseScopeRules.EntryType("",recursive,true)=="file", "clearing keywords retains existing file filters");
}
Require(BrowseScopeRules.DirectoryScope("  ",false,false)=="direct-children", "whitespace is not a search condition");
Require(!BrowseScopeRules.UsesCatalogResults(false,"","  ",false,false), "plain home must not reload on Catalog notifications");
Require(!BrowseScopeRules.UsesCatalogResults(true,"C:\\work","",false,false), "filesystem directory must retain its grid on Catalog notifications");
Require(BrowseScopeRules.UsesCatalogResults(false,"","report",false,false), "home search still follows Catalog notifications");
Require(BrowseScopeRules.UsesCatalogResults(false,"","",true,false), "home filters still follow Catalog notifications");
Require(BrowseScopeRules.UsesCatalogResults(false,"","",false,true), "random results still follow Catalog notifications");
Require(BrowseScopeRules.UsesCatalogResults(false,"C:\\work","report",false,false), "indexed directory search still follows Catalog notifications");
Require(Size(960,800,320,420).DetailsWidth == 308, "details leaves 300 DIP for main content plus spacing");
Require(Size(1600,800,320,420).DetailsWidth == 420, "details restores preferred width after growing");
Require(WorkspaceLayoutPolicy.ClampSidebar(900,1600) == 320 && WorkspaceLayoutPolicy.ClampSidebar(-100,1600) == 40, "sidebar drag bounds");
Require(WorkspaceLayoutPolicy.ClampDetails(900,1600,156) == 420 && WorkspaceLayoutPolicy.ClampDetails(1,1600,156) == 220, "details drag bounds");
Require(WorkspaceLayoutPolicy.PreferredSidebar(double.NaN) == 156 && WorkspaceLayoutPolicy.PreferredDetails(double.PositiveInfinity) == 280, "invalid widths recover defaults");

policy = new();
Size(720,377); policy.ForceOpen(false);
Require(Size(720,377).DetailsVisible && !Size(720,377).FiltersVisible, "small display override opens requested panel only");
policy.ForceOpen(true); Require(Size(720,377).FiltersVisible, "explicit filter override");
Require(!Size(720,360).DetailsVisible && !Size(720,360).FiltersVisible, "shrinking clears both overrides");
policy.ForceOpen(true); Size(720,360); Require(Size(700,360).FiltersVisible, "width-only shrink preserves filter override");
policy.ClearForce(true); Require(!Size(700,360).FiltersVisible, "manual close clears override");
Require(WorkspaceLayoutPolicy.DefaultSidebarWidth == 156 && WorkspaceLayoutPolicy.DefaultDetailsWidth == 280, "double-click reset targets");
policy = new();
var shortWindow = Size(1600,359);
Require(shortWindow.HorizontalGrid && !shortWindow.SidebarVisible && !shortWindow.FiltersVisible && !shortWindow.DetailsVisible,
    "short wide window hides three panels and uses horizontal grid");
Require(Size(300,210).HorizontalGrid, "minimum window keeps horizontal grid");
var tallerWindow = Size(1600,360);
Require(!tallerWindow.HorizontalGrid && tallerWindow.SidebarVisible && !tallerWindow.FiltersVisible && !tallerWindow.DetailsVisible,
    "grid returns at 360 while top/right retain independent recovery hysteresis");
Require(!Size(300,800).HorizontalGrid, "width-only shrink never switches grid direction");
Require(ResultGridGeometry.CompactCell(500,160)==138, "normal compact row caps at 138");
Require(ResultGridGeometry.CompactCell(60,160)==60, "short row shrinks cards to remaining height");
Require(ResultGridGeometry.CompactCell(0,160)==1, "layout transition with zero extent stays valid");
Require(ResultGridGeometry.CompactCell(500,240)==207, "compact row respects preferred tile scale");
foreach(var width in new[]{130d,329,330,1000,1303,1920}) {
    var fill=ResultGridGeometry.FillWidth(width,160);
    Require(fill.Columns>=1&&fill.Cell>0&&Math.Abs(fill.Columns*(fill.Cell+5)-width)<.00001,"Square grid fills every available row width including gaps");
}
foreach(var preferred in new[]{120d,160,240})
    Require(ResultGridGeometry.FillWidth(210,preferred).Columns==2,"Narrow square grid keeps two columns regardless of preferred tile size");
Require(ResultGridGeometry.FillWidth(1303,240).Columns<ResultGridGeometry.FillWidth(1303,120).Columns,"Preferred size controls column count while rows still fill");
var fitted=GalleryGeometry.Create(5,320,_=>1,100);
Require(fitted.Boxes.Count==5&&Math.Abs(fitted.Boxes[2].Left+fitted.Boxes[2].Width-320)<.0001,"Completed gallery row fills the viewport");
Require(fitted.Boxes[3].Width==100&&fitted.Boxes[4].Left==105,"Incomplete final row retains natural width");
foreach(var target in new[]{120d,160,240}) {
    var narrow=GalleryGeometry.Create(7,210,i=>i%2==0?2.4:.45,target);
    Require(narrow.Boxes[0].Top==narrow.Boxes[1].Top&&narrow.Boxes.All(b=>b.Left+b.Width<=210.001),"Narrow original-ratio grid keeps at least two items per complete row without clipping");
}
Require(GalleryGeometry.Create(1,210,_=>1,160).Boxes.Single().Width==160,"Single remaining gallery item keeps its natural size");
var large=GalleryGeometry.Create(50000,930,i=>i%3==0?4:i%3==1?.1:1.5,160);
Require(large.Boxes.Count==50000&&large.Boxes.All(b=>b.Width>0&&b.Height>28&&b.Left>=0&&b.Left+b.Width<=930.001),"Fifty thousand mixed-ratio items stay inside the viewport");
Require(large.Visible(2000,2600).Count()<50&&large.Visible(2000,2600).All(b=>b.Top+b.Height>=2000&&b.Top<=2600),"Realization uses tile bottoms and stays bounded to the viewport");
var edge=GalleryGeometry.Create(3,10,_=>double.NaN,100);
Require(edge.Boxes.All(b=>double.IsFinite(b.Left)&&b.Width>0)&&GalleryGeometry.Create(0,10,_=>1,100).Height==0,"Unknown ratios and empty content stay valid");
double NameWidth(string text)=>text.EnumerateRunes().Count();
Require(CatalogNameLabel.Format("短文件.png",20,true,NameWidth)=="短文件.png","Fitting names remain complete");
Require(CatalogNameLabel.Format("abcdefghijk.png",10,true,NameWidth)=="abcde….png","Long filenames preserve the extension and beginning");
Require(CatalogNameLabel.Format("abcdefghijk.png",3,true,NameWidth)=="…ng","Very narrow names retain the ending that fits");
Require(CatalogNameLabel.Format("abcdefghijk.png",10,false,NameWidth)=="abcdef…png","Directory dots do not reserve a file extension");
Require(CatalogNameLabel.Format("😀😀😀😀😀😀😀😀😀😀",6,false,NameWidth)=="😀😀😀…😀😀","Middle omission preserves Unicode scalar boundaries");
Require(CatalogNameLabel.Format("long.png",0,true,NameWidth)=="","Zero-width labels do not overflow");
string MenuIds(int count,bool home,bool folder)=>string.Join(",",ResultMenuRules.Create(count,home,folder).Select(action=>action.Id));
Require(MenuIds(1,true,true)=="preview,open,reveal,copyPaths,favorite,autoKeywords,metadata","Home single directory menu matches mainline order");
Require(MenuIds(2,true,true)=="preview,open,reveal,copyPaths","Home multi-selection omits single-directory actions");
Require(MenuIds(1,false,true)=="preview,open,reveal,copyPaths,delete,favorite,editKeywords,autoKeywords,metadata","Directory result menu matches mainline order");
Require(MenuIds(1,false,false)=="preview,open,reveal,copyPaths,delete,editKeywords,autoKeywords","File menu omits directory actions");
Require(MenuIds(2,false,true)=="preview,open,reveal,copyPaths,delete,editKeywords,autoKeywords","Multi-selection menu omits single-directory actions");
Require(ResultMenuRules.Create(1,false,true).Single(action=>action.NewGroup).Id=="editKeywords"&&ResultMenuRules.Create(0,false,false).Count==0,"Menu groups and empty selection stay valid");
var path=WorkspacePathRules.Crumbs(@"C:\Design Assets\中文","My PC");
Require(path.Count==4&&path[1].Path==@"C:\"&&path[^1].Path==@"C:\Design Assets\中文","Breadcrumbs preserve drive root, spaces and Unicode");
var unc=WorkspacePathRules.Crumbs(@"\\server\share\folder","My PC");
Require(unc.Count==3&&unc[1].Path==@"\\server\share\"&&unc[^1].Path==@"\\server\share\folder","UNC share is one indivisible root breadcrumb");
Require(WorkspacePathRules.Crumbs("","My PC").Single().Path=="","Home breadcrumb carries the existing home action");
var selection=new WorkspaceSelection<string>();string[] entries=["a","b","c","d"];
selection.Pick(entries,1,false,false);selection.Pick(entries,3,false,true);
Require(selection.Ordered(entries).SequenceEqual(new[]{"b","c","d"}),"Shift selects an anchored range");
selection.Pick(entries,2,true,false);Require(selection.Ordered(entries).SequenceEqual(new[]{"b","d"}),"Control toggles one item while preserving others");
selection.Clear();selection.Pick(entries,0,false,true);Require(selection.Ordered(entries).SequenceEqual(new[]{"a"}),"Clearing selection also clears the range anchor");
Console.WriteLine($"passed: {checks} WinUI layout and interaction-state checks; no UI or user data");
