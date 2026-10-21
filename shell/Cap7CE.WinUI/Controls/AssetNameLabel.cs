using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Windows.Foundation;

namespace Cap7CE.WinUI.Controls;

// Measures only on name/font/available-width changes, never on hover or selection.
internal sealed class AssetNameLabel
{
    internal TextBlock Text {get;}=new(){TextWrapping=TextWrapping.NoWrap,TextTrimming=TextTrimming.CharacterEllipsis,MaxLines=1,HorizontalTextAlignment=TextAlignment.Center};
    private readonly TextBlock measure=new(){TextWrapping=TextWrapping.NoWrap};
    private string name="";
    private bool isFile;
    private double availableWidth;
    private (string Name,bool File,double Width,double FontSize)? previous;

    internal AssetNameLabel()
    {
        Text.RegisterPropertyChangedCallback(TextBlock.FontSizeProperty,(_,_)=>Update());
    }

    internal void SetAvailableWidth(double value)
    {
        availableWidth=Math.Max(0,value);Update();
    }

    internal void SetName(string value,bool file)
    {
        name=value;isFile=file;AutomationProperties.SetName(Text,value);Update();
    }

    private void Update()
    {
        // Empty text can have zero ActualWidth: use the owning card's layout slot.
        // Preserve the name until that slot has been arranged for the first time.
        if(availableWidth<=0){Text.Text=name;previous=null;return;}
        var width=availableWidth;
        var state=(name,isFile,width,Text.FontSize);
        if(previous==state)return;
        previous=state;
        measure.FontSize=Text.FontSize;measure.FontFamily=Text.FontFamily;measure.FontWeight=Text.FontWeight;
        measure.FontStyle=Text.FontStyle;measure.CharacterSpacing=Text.CharacterSpacing;measure.FlowDirection=Text.FlowDirection;
        var widths=new Dictionary<string,double>();
        double Measure(string value)
        {
            if(widths.TryGetValue(value,out var result))return result;
            measure.Text=value;measure.Measure(new Size(double.PositiveInfinity,double.PositiveInfinity));
            return widths[value]=measure.DesiredSize.Width;
        }
        Text.Text=CatalogNameLabel.Format(name,width,isFile,Measure);
    }
}
