using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Localization;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
namespace Cap7CE.WinUI.DesktopActions;
internal sealed class CapsuleMenu : UserControl
{
    public CapsuleMenu(DesktopActionOptions options,Action<DesktopSearch> replay,Action<DesktopProgram,int> run)
    {
        var body=Ui.Column();body.Width=260;body.Margin=new(12);
        if(options.RecordHistory){
            body.Children.Add(Ui.Text(AppLanguage.Text("ui.desktop.recent"),true));
            foreach(var item in options.History.Take(options.HistoryCount)){
                var text=new TextBlock{Text=item.Query,TextTrimming=TextTrimming.CharacterEllipsis};
                var button=new Button{Content=text,HorizontalAlignment=HorizontalAlignment.Stretch,HorizontalContentAlignment=HorizontalAlignment.Stretch};
                ToolTipService.SetToolTip(button,item.Query);button.Click+=(_,_)=>replay(item);body.Children.Add(button);
            }
            if(options.History.Length==0)body.Children.Add(Description("ui.desktop.historyEmpty"));
            body.Children.Add(new Border{Height=1,Background=(Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["DividerStrokeColorDefaultBrush"],Margin=new(0,6,0,6)});
        }
        body.Children.Add(Ui.Text(AppLanguage.Text("ui.desktop.apps"),true));
        foreach(var app in options.Programs)body.Children.Add(ProgramRow(app,run));
        if(options.Programs.Length==0)body.Children.Add(Description("ui.desktop.appsEmpty"));
        var scroll=new ScrollViewer{Content=body,Width=284,MaxHeight=544,VerticalScrollBarVisibility=ScrollBarVisibility.Auto,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled};
        IdleScrollBars.Attach(scroll);Content=scroll;
    }
    private static TextBlock Description(string key)
    {
        var text=Ui.Text(AppLanguage.Text(key),true);
        text.Foreground=(Brush)Application.Current.Resources["TextFillColorTertiaryBrush"];
        return text;
    }
    private static Grid ProgramRow(DesktopProgram app,Action<DesktopProgram,int> run)
    {
        var row=new Grid{ColumnSpacing=8,Height=44,Background=new SolidColorBrush(Microsoft.UI.Colors.Transparent)};row.ColumnDefinitions.Add(new(){Width=new(44)});row.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        var icon=new Button{Width=42,Height=42,Padding=new(6),Content=new FontIcon{Glyph="\uE8A5"}};
        ToolTipService.SetToolTip(icon,app.Name);Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(icon,app.Name);icon.Click+=(_,_)=>run(app,-1);
        icon.Loaded+=async(_,_)=>await DesktopProgramIcon.LoadAsync(icon,app.Path);
        var name=new TextBlock{Text=app.Name,VerticalAlignment=VerticalAlignment.Center,TextTrimming=TextTrimming.CharacterEllipsis,IsHitTestVisible=false};
        var layouts=Ui.Row();layouts.Visibility=Visibility.Collapsed;
        string[] labels=["ui.desktop.nativeLeft","ui.desktop.nativeRight","ui.desktop.nativeTop","ui.desktop.nativeBottom"];
        // Lucide panel SVG geometry; originals and license are in resources/icons/lucide-*.
        const string frame="M5 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3Z";
        string[] dividers=["M9 3V21","M15 3V21","M3 9H21","M3 15H21"];
        for(var i=0;i<4;i++){
            var layout=i;var graphic=new SidebarIcon{Width=24,Height=24,OutlinePath=frame+dividers[i]};
            var button=Ui.Button("",()=>run(app,layout));button.Content=graphic;button.Padding=new(4);button.MinWidth=0;
            ToolTipService.SetToolTip(button,AppLanguage.Text(labels[i]));Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(button,AppLanguage.Text(labels[i]));layouts.Children.Add(button);
        }
        row.Children.Add(icon);Grid.SetColumn(name,1);Grid.SetColumn(layouts,1);row.Children.Add(name);row.Children.Add(layouts);
        void Reveal(bool show){name.Visibility=show?Visibility.Collapsed:Visibility.Visible;layouts.Visibility=show?Visibility.Visible:Visibility.Collapsed;}
        var pointerInside=false;
        bool KeyboardFocusInside(){
            if(row.XamlRoot is null)return false;
            var focused=FocusManager.GetFocusedElement(row.XamlRoot) as Control;
            if(focused?.FocusState is not (FocusState.Keyboard or FocusState.Programmatic))return false;
            for(DependencyObject? node=focused;node is not null;node=VisualTreeHelper.GetParent(node))if(ReferenceEquals(node,row))return true;
            return false;
        }
        row.PointerEntered+=(_,_)=>{pointerInside=true;Reveal(true);};
        row.PointerExited+=(_,e)=>{
            var point=e.GetCurrentPoint(row).Position;
            if(point.X>=0&&point.Y>=0&&point.X<row.ActualWidth&&point.Y<row.ActualHeight)return;
            pointerInside=false;Reveal(KeyboardFocusInside());
        };
        row.GotFocus+=(_,_)=>Reveal(pointerInside||KeyboardFocusInside());
        row.LostFocus+=(_,_)=>row.DispatcherQueue.TryEnqueue(()=>Reveal(pointerInside||KeyboardFocusInside()));
        return row;
    }
}
