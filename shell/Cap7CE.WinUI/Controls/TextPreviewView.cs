using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Localization;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Media;

namespace Cap7CE.WinUI.Controls;

internal sealed class TextPreviewView : Grid
{
    private readonly TextBox text=new(){IsReadOnly=true,AcceptsReturn=true,TextWrapping=TextWrapping.Wrap,
        BorderThickness=new(0),Background=new SolidColorBrush(Microsoft.UI.Colors.Transparent),Padding=new(24),
        IsSpellCheckEnabled=false,IsTextPredictionEnabled=false,FontSize=16};
    private readonly ContentControl body=new(){HorizontalContentAlignment=HorizontalAlignment.Stretch,VerticalContentAlignment=VerticalAlignment.Stretch};
    private readonly TextBlock size=Ui.Text("16");
    private readonly TextBlock notice=Ui.Text("",true);
    private readonly StackPanel tools;
    private readonly CheckBox source=new(){MinWidth=0};
    private readonly CheckBox wrap=new(){IsChecked=true,MinWidth=0};
    private readonly CancellationToken lifetime;
    private CancellationTokenSource? rendering;
    private TextDocumentWebView? web;
    private string value="",extension="";
    private int fontSize=16;
    public TextPreviewView(Action openExternal,CancellationToken token)
    {
        lifetime=token;Padding=new(56,8,56,8);RowSpacing=6;
        L.Bind(source,CheckBox.ContentProperty,"ui.preview.source");L.Bind(wrap,CheckBox.ContentProperty,"ui.preview.wrap");
        RowDefinitions.Add(new(){Height=GridLength.Auto});RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});RowDefinitions.Add(new(){Height=GridLength.Auto});
        // Override every native TextBox state locally, including hover and focus.
        foreach(var key in new[]{"TextControlBackground","TextControlBackgroundPointerOver","TextControlBackgroundFocused","TextControlBackgroundDisabled",
            "TextControlBorderBrush","TextControlBorderBrushPointerOver","TextControlBorderBrushFocused","TextControlBorderBrushDisabled"})
            text.Resources[key]=new SolidColorBrush(Microsoft.UI.Colors.Transparent);
        ScrollViewer.SetVerticalScrollBarVisibility(text,ScrollBarVisibility.Auto);
        ScrollViewer.SetHorizontalScrollBarVisibility(text,ScrollBarVisibility.Auto);
        tools=Ui.Row(L.Tool("\uE738","ui.preview.smallerText",()=>Resize(-2)),size,L.Tool("\uE710","ui.preview.largerText",()=>Resize(2)),wrap,source,L.Tool("\uE8A7","ui.preview.openDefault",openExternal));
        tools.Spacing=12;notice.FontSize=12;
        tools.VerticalAlignment=VerticalAlignment.Center;size.VerticalAlignment=VerticalAlignment.Center;
        Children.Add(new ScrollViewer {Content=tools,HorizontalScrollBarVisibility=ScrollBarVisibility.Auto,VerticalScrollBarVisibility=ScrollBarVisibility.Disabled});
        Grid.SetRow(body,1);Children.Add(body);Grid.SetRow(notice,2);Children.Add(notice);
        source.Click+=(_,_)=>Refresh();wrap.Click+=(_,_)=>{text.TextWrapping=wrap.IsChecked==true?TextWrapping.Wrap:TextWrapping.NoWrap;};
        Unloaded+=(_,_)=>{rendering?.Cancel();rendering?.Dispose();rendering=null;web?.Dispose();};
        ActualThemeChanged+=(_,_)=>{if(IsLoaded&&web is not null)Refresh();};
    }
    public void SetText(string content,string fileExtension,UiMessage? information=null)
    {
        value=content;extension=fileExtension.ToLowerInvariant();L.Message(notice,TextBlock.TextProperty,information??UiMessage.Literal(""));
        source.Visibility=TextPreviewDocument.CanRender(extension)?Visibility.Visible:Visibility.Collapsed;
        text.FontFamily=new(extension is ".txt" or ".md" or ".epub" or ".mobi"?"Segoe UI":"Consolas");
        Refresh();
    }
    public void SetBookText(IReadOnlyList<string> chapters)
    {
        SetText(TextPreviewDocument.BookText(chapters),".epub",UiMessage.Key(chapters.Count==0?"ui.preview.noText":"ui.preview.bookText"));
    }
    private void Resize(int delta){fontSize=Math.Clamp(fontSize+delta,12,28);size.Text=fontSize.ToString();Refresh();}
    private async void Refresh()
    {
        rendering?.Cancel();rendering?.Dispose();rendering=CancellationTokenSource.CreateLinkedTokenSource(lifetime);
        var token=rendering.Token;web?.Dispose();web=null;body.Content=null;
        var rendered=TextPreviewDocument.CanRender(extension)&&source.IsChecked!=true;
        wrap.Visibility=rendered?Visibility.Collapsed:Visibility.Visible;
        if(!rendered){text.Text=value;text.FontSize=fontSize;body.Content=text;return;}
        try {
            var content=value;var format=extension;var dark=ActualTheme==ElementTheme.Dark;var font=fontSize;
            var html=await Task.Run(()=>TextPreviewDocument.Render(content,format,dark,font),token);
            token.ThrowIfCancellationRequested();
            var view=new TextDocumentWebView();web=view;body.Content=view;await view.LoadAsync(html,token);
        }
        catch(OperationCanceledException){}
        catch(Exception error){if(!token.IsCancellationRequested){web?.Dispose();web=null;text.Text=value;text.FontSize=fontSize;body.Content=text;
            L.Message(notice,TextBlock.TextProperty,UiMessage.Key("ui.preview.formatFailed",new Dictionary<string,object?>{{"error",FailureText.From(error)}}));}}
    }
}
