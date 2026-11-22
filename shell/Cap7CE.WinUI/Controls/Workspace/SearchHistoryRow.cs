using Cap7CE.WinUI.Localization;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Cap7CE.WinUI.Controls;

internal sealed record SearchHistoryItem(string Text,Func<Task> Remove,Action<Exception> Failure);

// Sibling buttons keep removal out of the search command's event route.
internal sealed class SearchHistoryRow : Grid
{
    public string Text {get;}
    public SearchHistoryRow(SearchHistoryItem item,Action<string> choose,Action removed,bool flat=false)
    {
        Text=item.Text;MinHeight=32;
        var busy=false;var pointer=false;
        var label=new TextBlock{Text=Text,TextTrimming=TextTrimming.CharacterEllipsis,Margin=new(0,0,30,0)};
        var open=new Button{Content=label,HorizontalAlignment=HorizontalAlignment.Stretch,HorizontalContentAlignment=HorizontalAlignment.Stretch,MinWidth=0,MinHeight=32,IsTabStop=!flat};
        if(flat){open.Background=new SolidColorBrush(Microsoft.UI.Colors.Transparent);open.BorderBrush=open.Background;}
        ToolTipService.SetToolTip(open,Text);open.Click+=(_,_)=>{if(!busy)choose(Text);};
        var remove=new Button{
            Content=new FontIcon{Glyph="\uE711",FontSize=12},Width=26,Height=26,MinWidth=0,MinHeight=0,
            Padding=new(0),Margin=new(0,0,4,0),CornerRadius=new(13),IsTabStop=false,
            HorizontalAlignment=HorizontalAlignment.Right,VerticalAlignment=VerticalAlignment.Center,
            HorizontalContentAlignment=HorizontalAlignment.Center,VerticalContentAlignment=VerticalAlignment.Center
        };
        LanguageUi.Label(remove,"ui.desktop.remove");
        Children.Add(open);Children.Add(remove);
        void Reveal(){remove.Opacity=pointer?1:0;remove.IsHitTestVisible=pointer;}
        PointerEntered+=(_,_)=>{pointer=true;Reveal();};
        PointerExited+=(_,e)=>{var point=e.GetCurrentPoint(this).Position;if(point.X>=0&&point.Y>=0&&point.X<ActualWidth&&point.Y<ActualHeight)return;pointer=false;Reveal();};
        remove.Click+=async(_,_)=>{
            if(busy)return;busy=true;
            try{await item.Remove();removed();}catch(Exception error){item.Failure(error);}
            finally{busy=false;}
        };
        Reveal();
    }
}
