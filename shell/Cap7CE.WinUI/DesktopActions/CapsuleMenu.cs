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
        var body=Ui.Column();body.Width=300;
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
        Content=new ScrollViewer{Content=body,MaxHeight=520,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled};
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
        for(var i=0;i<4;i++){
            var layout=i;var graphic=new Grid{Width=34,Height=22,IsHitTestVisible=false};var right=i%2==1;var vertical=i>=2;var fraction=.5;
            if(vertical){graphic.RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});graphic.RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});}
            else{graphic.ColumnDefinitions.Add(new(){Width=new(right?1-fraction:fraction,GridUnitType.Star)});graphic.ColumnDefinitions.Add(new(){Width=new(right?fraction:1-fraction,GridUnitType.Star)});}
            for(var side=0;side<2;side++){var shape=new Border{BorderThickness=new(1),CornerRadius=new(2),Margin=new(1),BorderBrush=(Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["TextFillColorSecondaryBrush"]};
                if(side==(right?1:0))shape.Background=(Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["CapAccentBrush"];if(vertical)Grid.SetRow(shape,side);else Grid.SetColumn(shape,side);graphic.Children.Add(shape);}
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
