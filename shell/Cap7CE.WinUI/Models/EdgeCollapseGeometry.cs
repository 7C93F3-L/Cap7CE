namespace Cap7CE.WinUI.Models;

internal enum DockEdge { Left, Top, Right }
internal readonly record struct EdgeRect(int Left,int Top,int Right,int Bottom)
{
    public int Width=>Right-Left;
    public int Height=>Bottom-Top;
    public bool Contains(int x,int y)=>x>=Left&&x<Right&&y>=Top&&y<Bottom;
    public EdgeRect Offset(int x,int y)=>new(Left+x,Top+y,Right+x,Bottom+y);
}
internal readonly record struct EdgeInsets(int Left,int Top,int Right,int Bottom);
internal readonly record struct EdgeScreen(EdgeRect Bounds,EdgeRect Work);

// Physical-pixel geometry only; neither the grid nor the query session participates.
internal static class EdgeCollapseGeometry
{
    public static EdgeRect Visible(EdgeRect outer,EdgeInsets inset)=>new(outer.Left+inset.Left,outer.Top+inset.Top,outer.Right-inset.Right,outer.Bottom-inset.Bottom);
    public static bool Exposed(EdgeRect window,EdgeRect screen,IEnumerable<EdgeRect> screens,DockEdge edge)
        =>!screens.Where(other=>other!=screen).Any(other=>edge switch {
            DockEdge.Left=>other.Right==screen.Left&&Math.Min(window.Bottom,other.Bottom)>Math.Max(window.Top,other.Top),
            DockEdge.Right=>other.Left==screen.Right&&Math.Min(window.Bottom,other.Bottom)>Math.Max(window.Top,other.Top),
            _=>other.Bottom==screen.Top&&Math.Min(window.Right,other.Right)>Math.Max(window.Left,other.Left)});
    public static DockEdge? Detect(EdgeRect outer,EdgeInsets inset,EdgeScreen screen,IEnumerable<EdgeRect> screens,DockEdge? preferred=null)
    {
        var visible=Visible(outer,inset);var candidates=new List<(DockEdge Edge,int Overflow)>();
        if(screen.Work.Left==screen.Bounds.Left)candidates.Add((DockEdge.Left,screen.Bounds.Left-visible.Left));
        if(screen.Work.Right==screen.Bounds.Right)candidates.Add((DockEdge.Right,visible.Right-screen.Bounds.Right));
        if(screen.Work.Top==screen.Bounds.Top)candidates.Add((DockEdge.Top,screen.Bounds.Top-visible.Top));
        return candidates.Where(item=>item.Overflow>=0&&Exposed(visible,screen.Bounds,screens,item.Edge))
            .OrderByDescending(item=>item.Overflow).ThenByDescending(item=>item.Edge==preferred).Select(item=>(DockEdge?)item.Edge).FirstOrDefault();
    }
    public static EdgeRect Clamp(EdgeRect outer,EdgeInsets inset,EdgeRect work)
    {
        var width=Math.Min(outer.Width,work.Width+inset.Left+inset.Right);var height=Math.Min(outer.Height,work.Height+inset.Top+inset.Bottom);
        var left=Math.Clamp(outer.Left,work.Left-inset.Left,work.Right+inset.Right-width);
        var top=Math.Clamp(outer.Top,work.Top-inset.Top,work.Bottom+inset.Bottom-height);
        return new(left,top,left+width,top+height);
    }
    public static EdgeRect Align(EdgeRect outer,EdgeInsets inset,EdgeScreen screen,DockEdge edge)
    {
        var result=Clamp(outer,inset,screen.Work);
        return edge switch {
            DockEdge.Left=>result.Offset(screen.Bounds.Left-inset.Left-result.Left,0),
            DockEdge.Right=>result.Offset(screen.Bounds.Right+inset.Right-result.Right,0),
            _=>result.Offset(0,screen.Bounds.Top-inset.Top-result.Top)};
    }
    public static EdgeRect Collapse(EdgeRect expanded,EdgeInsets inset,EdgeRect screen,DockEdge edge,int peek=3)
        =>edge switch {
            DockEdge.Left=>expanded.Offset(screen.Left+peek+inset.Right-expanded.Right,0),
            DockEdge.Right=>expanded.Offset(screen.Right-peek-inset.Left-expanded.Left,0),
            _=>expanded.Offset(0,screen.Top+peek+inset.Bottom-expanded.Bottom)};
    public static bool AtRevealEdge(int x,int y,EdgeRect screen,DockEdge edge)=>edge switch {
        DockEdge.Left=>x>=screen.Left&&x<screen.Left+4,
        DockEdge.Right=>x>=screen.Right-4&&x<screen.Right,
        _=>y>=screen.Top&&y<screen.Top+4};
}
