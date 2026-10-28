using Cap7CE.WinUI.Models;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Localization;
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
    private readonly Action<UiMessage> notice;
    private readonly Ellipse first=new(){Width=18,Height=18},second=new(){Width=18,Height=18};
    private readonly Button firstButton,secondButton,reset;
    public SettingsColors(Func<ShellPreferences> read,Func<ShellPreferences,Task> save,Action<UiMessage> notice)
    {
        this.read=read;this.save=save;this.notice=notice;
        firstButton=ColorButton("native.colors.first",first,true);secondButton=ColorButton("native.colors.second",second,false);
        reset=L.Button("common.restoreDefault",()=>{});
        reset.Click+=async(_,_)=>{
            reset.IsEnabled=false;
            try {var defaults=new ShellPreferences();await save(read() with{Color1=defaults.Color1,Color2=defaults.Color2});Refresh();}
            catch(Exception error){notice(error.Message);}finally{reset.IsEnabled=true;}
        };
        var panel=new Grid {ColumnSpacing=8};
        panel.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});panel.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        panel.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        panel.RowDefinitions.Add(new(){Height=GridLength.Auto});panel.RowDefinitions.Add(new(){Height=GridLength.Auto});
        firstButton.HorizontalAlignment=secondButton.HorizontalAlignment=HorizontalAlignment.Stretch;
        panel.Children.Add(firstButton);Grid.SetColumn(secondButton,1);panel.Children.Add(secondButton);panel.Children.Add(reset);Content=panel;
        void Arrange()
        {
            var wrap=ActualWidth<260;panel.RowSpacing=wrap?8:0;
            panel.ColumnDefinitions[2].Width=wrap?new(0):GridLength.Auto;
            Grid.SetRow(reset,wrap?1:0);Grid.SetColumn(reset,wrap?0:2);Grid.SetColumnSpan(reset,wrap?2:1);
            reset.HorizontalAlignment=wrap?HorizontalAlignment.Right:HorizontalAlignment.Stretch;
        }
        SizeChanged+=(_,_)=>Arrange();Arrange();
        Refresh();
    }
    private Button ColorButton(string label,Ellipse swatch,bool primary)
    {
        var button=new Button {Content=Ui.Row(swatch,L.Text(label))};
        L.Bind(button,AutomationProperties.NameProperty,label);L.Bind(button,ToolTipService.ToolTipProperty,label);
        button.Click+=(_,_)=>Open(button,primary);return button;
    }
    private void Refresh()
    {
        first.Fill=new SolidColorBrush(ThemeService.Parse(read().Color1));second.Fill=new SolidColorBrush(ThemeService.Parse(read().Color2));
    }
    private void Open(Button anchor,bool primary)
    {
        var picker=new SettingsColorEditor(ThemeService.Parse(primary?read().Color1:read().Color2));
        L.Bind(picker,AutomationProperties.NameProperty,primary?"native.colors.first":"native.colors.second");
        var actions=Ui.Row();actions.HorizontalAlignment=HorizontalAlignment.Center;
        var content=Ui.Column(picker,actions);content.Spacing=12;content.HorizontalAlignment=HorizontalAlignment.Center;
        var flyout=ThemeService.Flyout(content);
        flyout.FlyoutPresenterStyle=(Style)Application.Current.Resources["CapSettingsColorFlyout"];
        var apply=L.Button("common.apply",()=>{});
        apply.Click+=async(_,_)=>{
            apply.IsEnabled=false;
            try {
                if(!picker.TryRead(out var color)){notice(UiMessage.Key("native.colors.invalid"));return;}
                var hex=$"#{color.R:X2}{color.G:X2}{color.B:X2}";
                await save(primary?read() with{Color1=hex}:read() with{Color2=hex});Refresh();flyout.Hide();
            } catch(Exception error){notice(error.Message);}finally{apply.IsEnabled=true;}
        };
        actions.Children.Add(L.Button("common.cancel",()=>flyout.Hide()));actions.Children.Add(apply);flyout.ShowAt(anchor);
    }
}
