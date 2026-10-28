using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Localization;
using L=Cap7CE.WinUI.Localization.LanguageUi;
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
            var button=FilterSection.Option(FactTextKeys.Type(type.Id),()=>apply(ThreeDFilterRules.Toggle(read(),type.Id)),icon,localized:true);
            ((StackPanel)button.Content).Children.Clear();
            var caption=L.Text(FactTextKeys.Type(type.Id));caption.TextWrapping=TextWrapping.NoWrap;caption.FontSize=11;caption.HorizontalAlignment=HorizontalAlignment.Center;var column=Ui.Column(icon,caption);
            column.Spacing=2;button.Content=column;button.Height=56;button.Padding=new(3,0,3,0);options.Add((type.Id,button));
        }
        Content=new FilterSection("ui.facts.threeDTypes",FilterSection.Options(options.Select(pair=>(UIElement)pair.Button).ToArray(),3,56),localized:true);
    }
    public void Restore(){foreach(var (id,button) in options)button.IsChecked=read().ThreeDTypes.Contains(id);}
}
