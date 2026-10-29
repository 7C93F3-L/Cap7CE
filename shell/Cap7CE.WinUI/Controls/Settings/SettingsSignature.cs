using Cap7CE.WinUI.Localization;
using System.Text.Json;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Markup;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Storage.Streams;

namespace Cap7CE.WinUI.Controls;

internal sealed class SettingsSignature : Grid
{
    private long lastClick;
    private int clicks;
    private bool loading;
    private BitmapImage? picture;
    private ContentDialog? dialog;
    internal Action<UiMessage>? Notice {get;set;}
    public SettingsSignature()
    {
        var geometry=JsonSerializer.Deserialize<string>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets/settings-signature.json")))!;
        var path=new Microsoft.UI.Xaml.Shapes.Path {Style=(Style)Application.Current.Resources["CapSettingsSignaturePath"],Data=(Geometry)XamlBindingHelper.ConvertValue(typeof(Geometry),"F1 "+geometry)};
        var canvas=new Canvas {Width=80,Height=30};canvas.Children.Add(path);
        var mark=new Viewbox {Width=74,Height=28,Child=canvas};
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(mark,"Cap7CE");
        var trigger=new HyperlinkButton {Content="Echo",FontSize=12,Padding=new(0),MinHeight=0,MinWidth=0,Style=(Style)Application.Current.Resources["CapSettingsSignatureTrigger"]};
        trigger.Click+=EchoClicked;
        var name=Ui.Text("7C93F3-L &");name.FontSize=12;name.VerticalAlignment=VerticalAlignment.Center;
        var credits=Ui.Row(name,trigger);credits.Spacing=3;credits.HorizontalAlignment=HorizontalAlignment.Center;
        var column=Ui.Column(mark,credits);column.Spacing=8;column.HorizontalAlignment=HorizontalAlignment.Center;Children.Add(column);
        Unloaded+=(_,_)=>{clicks=0;dialog?.Hide();};
    }
    private async void EchoClicked(object sender,RoutedEventArgs e)
    {
        var now=Environment.TickCount64;clicks=now-lastClick<=850?clicks+1:1;lastClick=now;
        if(clicks<7)return;clicks=0;
        if(loading||dialog is not null)return;loading=true;
        try {
            if(picture is null) {
                var encoded=await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory,"Assets/phase7.dat"));
                var bytes=await Task.Run(()=>SettingsOriginAsset.Decode(encoded));
                if(!IsLoaded)return;
                var bitmap=new BitmapImage();
                using var stream=new InMemoryRandomAccessStream();
                using(var writer=new DataWriter(stream)){writer.WriteBytes(bytes);await writer.StoreAsync();writer.DetachStream();}
                stream.Seek(0);await bitmap.SetSourceAsync(stream);picture=bitmap;
            }
            if(!IsLoaded||XamlRoot is null)return;
            var image=new Image {Source=picture,Stretch=Stretch.Uniform,MaxHeight=Math.Max(100,Math.Min(520,XamlRoot.Size.Height-230))};
            PreviewViewportStyle.Apply(image);
            var caption=LanguageUi.Text("ui.signature.primary");caption.TextAlignment=TextAlignment.Center;
            var translation=LanguageUi.Text("ui.signature.secondary",true);translation.TextAlignment=TextAlignment.Center;translation.FontSize=12;
            var body=Ui.Column(image,caption,translation);
            var scroll=new ScrollViewer {Content=body,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled};IdleScrollBars.Attach(scroll);
            var openedDialog=new ContentDialog {XamlRoot=XamlRoot,Content=scroll,DefaultButton=ContentDialogButton.Close};
            Themes.DialogAccentResources.Apply(openedDialog);
            LanguageUi.Bind(openedDialog,ContentDialog.CloseButtonTextProperty,"ui.signature.close");dialog=openedDialog;
            await openedDialog.ShowAsync();
        }catch(Exception error){NativeDiagnostics.VisualFailure(error);if(IsLoaded)Notice?.Invoke(UiMessage.Key("ui.signature.openFailed"));}
        finally{dialog=null;loading=false;}
    }
}
