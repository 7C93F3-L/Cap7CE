using Microsoft.UI.Xaml.Controls;
using Windows.Foundation;

namespace Cap7CE.WinUI.Controls;

// Small bounded keyword collection; no data access or scrolling owner.
internal sealed class KeywordWrapPanel:Panel
{
    private const double Gap=4;
    protected override Size MeasureOverride(Size availableSize)
    {
        foreach(var child in Children)child.Measure(new(availableSize.Width,double.PositiveInfinity));
        return Layout(availableSize.Width,false);
    }
    protected override Size ArrangeOverride(Size finalSize){Layout(finalSize.Width,true);return finalSize;}
    private Size Layout(double available,bool arrange)
    {
        double x=0,y=0,rowHeight=0,width=0;
        foreach(var child in Children) {
            var size=child.DesiredSize;
            if(x>0&&x+size.Width>available){x=0;y+=rowHeight+Gap;rowHeight=0;}
            if(arrange)child.Arrange(new Rect(x,y,Math.Min(size.Width,available),size.Height));
            width=Math.Max(width,x+size.Width);x+=size.Width+Gap;rowHeight=Math.Max(rowHeight,size.Height);
        }
        return new(double.IsFinite(available)?Math.Min(width,available):width,y+rowHeight);
    }
}
