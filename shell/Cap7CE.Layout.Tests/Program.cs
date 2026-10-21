using Cap7CE.WinUI.Controllers;
using Cap7CE.WinUI.Models;

var checks = 0;
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
Require(ResultGridGeometry.FillWidth(1303,240).Columns<ResultGridGeometry.FillWidth(1303,120).Columns,"Preferred size controls column count while rows still fill");
var fitted=GalleryGeometry.Create(5,320,_=>1,100);
Require(fitted.Boxes.Count==5&&Math.Abs(fitted.Boxes[2].Left+fitted.Boxes[2].Width-320)<.0001,"Completed gallery row fills the viewport");
Require(fitted.Boxes[3].Width==100&&fitted.Boxes[4].Left==105,"Incomplete final row retains natural width");
var large=GalleryGeometry.Create(50000,930,i=>i%3==0?4:i%3==1?.1:1.5,160);
Require(large.Boxes.Count==50000&&large.Boxes.All(b=>b.Width>0&&b.Height>28&&b.Left>=0&&b.Left+b.Width<=930.001),"Fifty thousand mixed-ratio items stay inside the viewport");
Require(large.Visible(2000,2600).Count()<50&&large.Visible(2000,2600).All(b=>b.Top+b.Height>=2000&&b.Top<=2600),"Realization uses tile bottoms and stays bounded to the viewport");
var edge=GalleryGeometry.Create(3,10,_=>double.NaN,100);
Require(edge.Boxes.All(b=>double.IsFinite(b.Left)&&b.Width>0)&&GalleryGeometry.Create(0,10,_=>1,100).Height==0,"Unknown ratios and empty content stay valid");
var path=WorkspacePathRules.Crumbs(@"C:\Design Assets\中文");
Require(path.Count==4&&path[1].Path==@"C:\"&&path[^1].Path==@"C:\Design Assets\中文","Breadcrumbs preserve drive root, spaces and Unicode");
var unc=WorkspacePathRules.Crumbs(@"\\server\share\folder");
Require(unc.Count==3&&unc[1].Path==@"\\server\share\"&&unc[^1].Path==@"\\server\share\folder","UNC share is one indivisible root breadcrumb");
Require(WorkspacePathRules.Crumbs("").Single().Path=="","Home breadcrumb carries the existing home action");
var selection=new WorkspaceSelection<string>();string[] entries=["a","b","c","d"];
selection.Pick(entries,1,false,false);selection.Pick(entries,3,false,true);
Require(selection.Ordered(entries).SequenceEqual(new[]{"b","c","d"}),"Shift selects an anchored range");
selection.Pick(entries,2,true,false);Require(selection.Ordered(entries).SequenceEqual(new[]{"b","d"}),"Control toggles one item while preserving others");
selection.Clear();selection.Pick(entries,0,false,true);Require(selection.Ordered(entries).SequenceEqual(new[]{"a"}),"Clearing selection also clears the range anchor");
Console.WriteLine($"passed: {checks} WinUI layout and interaction-state checks; no UI or user data");
