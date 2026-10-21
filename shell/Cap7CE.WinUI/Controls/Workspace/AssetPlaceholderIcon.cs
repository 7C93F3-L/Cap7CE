using System.Xml.Linq;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Markup;
using Microsoft.UI.Xaml.Media;
using Path = Microsoft.UI.Xaml.Shapes.Path;

namespace Cap7CE.WinUI.Controls;

// Existing location and format paths use the page's shared accent gradient.
internal sealed class AssetPlaceholderIcon : Grid
{
    private static readonly Dictionary<string,string> paths=[];
    private string? current;
    private readonly Viewbox viewbox=new(){Stretch=Stretch.Uniform};
    public AssetPlaceholderIcon(){Children.Add(viewbox);}
    internal void SetIcon(string name)
    {
        if(current==name)return;
        current=name;
        if(!paths.TryGetValue(name,out var data)) {
            var svg=XDocument.Load(System.IO.Path.Combine(AppContext.BaseDirectory,"Assets","Icons",name+".svg"));
            data=string.Join(" ",svg.Descendants().Where(element=>element.Name.LocalName=="path").Select(element=>(string)element.Attribute("d")!));
            paths.Add(name,data);
        }
        var canvas=new Canvas {Width=30,Height=30};
        canvas.Children.Add(new Path {Data=(Geometry)XamlBindingHelper.ConvertValue(typeof(Geometry),"F1 "+data),
            Fill=(Brush)Application.Current.Resources["CapAccentGradient"]});
        viewbox.Child=canvas;
    }
}
