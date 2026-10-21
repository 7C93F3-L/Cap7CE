using System.Text;

namespace Cap7CE.WinUI.Models;

// Same width and extension policy as the active Electron Catalog name label.
internal static class CatalogNameLabel
{
    internal static string Format(string name,double width,bool isFile,Func<string,double> measure)
    {
        if(measure(name)<=width)return name;
        const string ellipsis="…";
        if(measure(ellipsis)>width)return "";
        var chars=name.EnumerateRunes().Select(rune=>rune.ToString()).ToArray();
        string Head(int count)=>string.Concat(chars.Take(count));
        string Tail(int count)=>count==0?"":string.Concat(chars.TakeLast(count));
        var dot=name.LastIndexOf('.');
        var extension=isFile&&dot>0?name[dot..].EnumerateRunes().Count():0;
        var room=Math.Max(0,width-measure((chars.FirstOrDefault()??"")+ellipsis));
        var budget=Math.Min(room,Math.Max(width*.35,measure(Tail(extension))));
        var tail=Largest(Math.Max(0,chars.Length-1),count=>measure(Tail(count))<=budget);
        if(tail<Math.Max(1,extension))tail=Largest(Math.Max(0,chars.Length-1),count=>measure(ellipsis+Tail(count))<=width);
        var head=Largest(Math.Max(0,chars.Length-tail-1),count=>measure(Head(count)+ellipsis+Tail(tail))<=width);
        return Head(head)+ellipsis+Tail(tail);
    }

    private static int Largest(int maximum,Func<int,bool> fits)
    {
        var low=0;var high=maximum;
        while(low<high){var middle=(low+high+1)/2;if(fits(middle))low=middle;else high=middle-1;}
        return low;
    }
}
