namespace Cap7CE.WinUI.Models;
internal readonly record struct GalleryBox(int Index,double Left,double Top,double Width,double Height);
internal sealed record GalleryGeometry(IReadOnlyList<GalleryBox> Boxes,double Height)
{
    public static double RevealOffset(GalleryBox target,double offset,double viewport,double maximum)
    {
        if(viewport<=0)return offset;
        var bottom=target.Top+target.Height;
        // An oversized item already spanning the viewport needs no movement.
        if(target.Top<offset&&bottom<offset+viewport)offset=target.Top;
        else if(bottom>offset+viewport&&target.Top>offset)
            offset=target.Height>viewport?target.Top:bottom-viewport;
        return Math.Clamp(offset,0,Math.Max(0,maximum));
    }
    // Active catalogJustifiedRows fitting: 5 DIP gaps, 28 DIP captions and natural last row.
    public static GalleryGeometry Create(int count,double width,Func<int,double> ratio,double target)
    {
        width=Math.Max(1,width);target=Math.Max(1,target);var boxes=new List<GalleryBox>(count);var index=0;double top=0;
        var minimumRowItems=width<300+ResultGridGeometry.Gap?2:1;
        double Ratio(int i){var r=ratio(i);return double.IsFinite(r)&&r>0?Math.Clamp(r,.45,2.4):1;}
        while(index<count) {
            var first=index;double sum=0;do{sum+=Ratio(index++);}while(index<count&&(index-first<minimumRowItems||target*sum+ResultGridGeometry.Gap*(index-first-1)<width));
            var length=index-first;
            if(length>minimumRowItems&&target*sum+ResultGridGeometry.Gap*(length-1)>=width) {
                var previous=sum-Ratio(index-1);var without=(width-ResultGridGeometry.Gap*(length-2))/previous;var with=(width-ResultGridGeometry.Gap*(length-1))/sum;
                if(Math.Abs(without-target)<Math.Abs(with-target)){index--;sum=previous;}
            }
            var fitted=Math.Max(1,(width-ResultGridGeometry.Gap*(index-first-1))/sum);var height=index==count?Math.Min(target,fitted):fitted;double left=0;
            for(var i=first;i<index;i++){var w=Ratio(i)*height;boxes.Add(new(i,left,top,w,height+28));left+=w+ResultGridGeometry.Gap;}
            top+=height+28+ResultGridGeometry.Gap;
        }
        return new(boxes,count>0?top-ResultGridGeometry.Gap:0);
    }
    public IEnumerable<GalleryBox> Visible(double top,double bottom)
    {
        var low=0;var high=Boxes.Count;
        while(low<high){var mid=(low+high)/2;if(Boxes[mid].Top+Boxes[mid].Height<top)low=mid+1;else high=mid;}
        for(var i=low;i<Boxes.Count&&Boxes[i].Top<=bottom;i++)yield return Boxes[i];
    }
}
