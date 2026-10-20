using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;

namespace Cap7CE.WinUI.Controls;
internal sealed class ThreeDTypeSection : UserControl
{
    private readonly Func<BrowseFilter> read;
    private readonly List<(string Id,ToggleButton Button)> options=[];
    public ThreeDTypeSection(Func<BrowseFilter> read,Action<BrowseFilter> apply)
    {
        this.read=read;
        foreach(var type in ThreeDFilterRules.Types) {
            var icon=FilterIcons.Create(type.Id=="polygon"?"threeD":type.Id);icon.Width=icon.Height=24;
            var button=FilterSection.Option(type.Label,()=>apply(ThreeDFilterRules.Toggle(read(),type.Id)),icon);
            ((StackPanel)button.Content).Children.Clear();
            var column=Ui.Column(icon,new TextBlock {Text=type.Label,FontSize=11,HorizontalAlignment=HorizontalAlignment.Center});
            column.Spacing=2;button.Content=column;button.Height=56;button.Padding=new(3,0,3,0);options.Add((type.Id,button));
        }
        Content=new FilterSection("三维类型",FilterSection.Options(options.Select(pair=>(UIElement)pair.Button).ToArray(),3,56));
    }
    public void Restore(){foreach(var (id,button) in options)button.IsChecked=read().ThreeDTypes.Contains(id);}
}
