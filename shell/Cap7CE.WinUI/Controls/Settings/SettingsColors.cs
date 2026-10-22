using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;

namespace Cap7CE.WinUI.Controls;

internal sealed class SettingsColors : UserControl
{
    private readonly Func<ShellPreferences> read;
    private readonly Func<ShellPreferences,Task> save;
    private readonly Action<string> notice;
    private readonly Ellipse first=new(){Width=18,Height=18},second=new(){Width=18,Height=18};
    private readonly Button firstButton,secondButton,reset;
    public SettingsColors(Func<ShellPreferences> read,Func<ShellPreferences,Task> save,Action<string> notice)
    {
        this.read=read;this.save=save;this.notice=notice;
        firstButton=ColorButton("颜色1",first,true);secondButton=ColorButton("颜色2",second,false);
        reset=Ui.Button("恢复默认",()=>{});
        reset.Click+=async(_,_)=>{
            reset.IsEnabled=false;
            try {var defaults=new ShellPreferences();await save(read() with{Color1=defaults.Color1,Color2=defaults.Color2});Refresh();}
            catch(Exception error){notice(error.Message);}finally{reset.IsEnabled=true;}
        };
        var panel=new StackPanel {Spacing=6,Orientation=Orientation.Horizontal};
        panel.Children.Add(firstButton);panel.Children.Add(secondButton);panel.Children.Add(reset);Content=panel;
        SizeChanged+=(_,_)=>panel.Orientation=ActualWidth<310?Orientation.Vertical:Orientation.Horizontal;
        Refresh();
    }
    private Button ColorButton(string label,Ellipse swatch,bool primary)
    {
        var button=new Button {Content=Ui.Row(swatch,Ui.Text(label))};
        AutomationProperties.SetName(button,label);ToolTipService.SetToolTip(button,label);
        button.Click+=(_,_)=>Open(button,primary);return button;
    }
    private void Refresh()
    {
        first.Fill=new SolidColorBrush(ThemeService.Parse(read().Color1));second.Fill=new SolidColorBrush(ThemeService.Parse(read().Color2));
    }
    private void Open(Button anchor,bool primary)
    {
        var picker=new ColorPicker {Color=ThemeService.Parse(primary?read().Color1:read().Color2),IsAlphaEnabled=false,
            IsAlphaSliderVisible=false,IsAlphaTextInputVisible=false,IsHexInputVisible=true,IsColorPreviewVisible=true,Width=280};
        AutomationProperties.SetName(picker,primary?"颜色1":"颜色2");
        var actions=Ui.Row();actions.HorizontalAlignment=HorizontalAlignment.Right;
        var flyout=ThemeService.Flyout(Ui.Column(picker,actions));
        var apply=Ui.Button("应用",()=>{});
        apply.Click+=async(_,_)=>{
            apply.IsEnabled=false;
            try {
                var color=picker.Color;var hex=$"#{color.R:X2}{color.G:X2}{color.B:X2}";
                await save(primary?read() with{Color1=hex}:read() with{Color2=hex});Refresh();flyout.Hide();
            } catch(Exception error){notice(error.Message);}finally{apply.IsEnabled=true;}
        };
        actions.Children.Add(Ui.Button("取消",()=>flyout.Hide()));actions.Children.Add(apply);flyout.ShowAt(anchor);
    }
}
