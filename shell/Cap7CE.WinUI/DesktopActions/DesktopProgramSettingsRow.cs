using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Localization;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
namespace Cap7CE.WinUI.DesktopActions;
// A single application row: icon, name, remove action and drag affordance.
internal sealed class DesktopProgramSettingsRow : Grid
{
    public DesktopProgram Program {get;}
    public DesktopProgramSettingsRow(DesktopProgram program,Action<DesktopProgramSettingsRow> remove)
    {
        Program=program;ColumnSpacing=12;MinHeight=48;Padding=new(0,4,0,4);
        ColumnDefinitions.Add(new(){Width=new(32)});ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        ColumnDefinitions.Add(new(){Width=GridLength.Auto});ColumnDefinitions.Add(new(){Width=new(24)});
        var icon=Ui.Tool("\uE8A5",program.Name,()=>{});icon.Width=32;icon.Height=32;icon.Padding=new(2);icon.IsTabStop=false;icon.IsHitTestVisible=false;
        icon.Loaded+=async(_,_)=>await DesktopProgramIcon.LoadAsync(icon,program.Path);
        var name=new TextBlock{Text=program.Name,TextTrimming=TextTrimming.CharacterEllipsis,VerticalAlignment=VerticalAlignment.Center};ToolTipService.SetToolTip(name,program.Path);
        var delete=LanguageUi.Button("ui.desktop.remove",()=>remove(this));delete.VerticalAlignment=VerticalAlignment.Center;
        LanguageUi.Label(delete,"ui.desktop.removeApp",()=>new Dictionary<string,object?>{{"name",program.Name}});
        var handle=new FontIcon{Glyph="\uE700",FontSize=14,VerticalAlignment=VerticalAlignment.Center,HorizontalAlignment=HorizontalAlignment.Center,
            Foreground=(Brush)Application.Current.Resources["TextFillColorSecondaryBrush"]};LanguageUi.Label(handle,"ui.desktop.reorder");
        Children.Add(icon);Grid.SetColumn(name,1);Children.Add(name);Grid.SetColumn(delete,2);Children.Add(delete);Grid.SetColumn(handle,3);Children.Add(handle);
    }
}
