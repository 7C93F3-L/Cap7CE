using System.Globalization;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace Cap7CE.WinUI.Controls;

// Native spectrum/value slider with Hex input; no native RGB/HSV selector or side preview.
internal sealed class SettingsColorEditor : UserControl
{
    private readonly ColorPicker picker;
    private readonly TextBox hex=new(){MaxLength=7};
    private readonly Border preview=new(){Width=32,Height=32,CornerRadius=new(5),BorderThickness=new(1)};
    private bool syncing,valid=true;
    public SettingsColorEditor(Color initial)
    {
        Width=256;
        picker=new ColorPicker {Color=initial,Width=256,IsAlphaEnabled=false,IsAlphaSliderVisible=false,
            IsAlphaTextInputVisible=false,IsColorPreviewVisible=false,IsHexInputVisible=false,
            IsColorChannelTextInputVisible=false,IsMoreButtonVisible=false};
        AutomationProperties.SetName(picker,"色谱与亮度");
        hex.MinWidth=0;hex.PlaceholderText="#RRGGBB";AutomationProperties.SetName(hex,"十六进制颜色");
        var hexRow=new Grid {ColumnSpacing=12};hexRow.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        hexRow.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        preview.VerticalAlignment=VerticalAlignment.Bottom;
        preview.Style=(Style)Application.Current.Resources["CapSettingsColorPreview"];
        hexRow.Children.Add(hex);Grid.SetColumn(preview,1);hexRow.Children.Add(preview);
        var column=Ui.Column(picker,hexRow);column.Spacing=0;Content=column;
        hex.TextChanged+=(_,_)=>ReadHex();
        picker.ColorChanged+=(_,_)=>{if(!syncing)Refresh();};
        Refresh();
    }
    public bool TryRead(out Color color){color=picker.Color;return valid;}
    private void ReadHex()
    {
        if(syncing)return;
        var text=hex.Text.Trim();if(text.StartsWith('#'))text=text[1..];
        if(text.Length!=6||!uint.TryParse(text,NumberStyles.AllowHexSpecifier,CultureInfo.InvariantCulture,out var value)){valid=false;return;}
        SetColor(Color.FromArgb(255,(byte)(value>>16),(byte)(value>>8),(byte)value),hex);
    }
    private void SetColor(Color color,TextBox source)
    {
        syncing=true;
        try{picker.Color=color;}finally{syncing=false;}
        Refresh(source);
    }
    private void Refresh(TextBox? source=null)
    {
        syncing=true;
        try {
            var color=picker.Color;
            var text=$"#{color.R:X2}{color.G:X2}{color.B:X2}";if(hex!=source&&hex.Text!=text)hex.Text=text;
            preview.Background=new SolidColorBrush(color);AutomationProperties.SetName(preview,"当前颜色 "+text);valid=true;
        }finally{syncing=false;}
    }
}
