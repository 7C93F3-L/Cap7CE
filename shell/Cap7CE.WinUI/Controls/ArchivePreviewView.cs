using System.Text.Json;
using Cap7CE.WinUI.Models;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Markup;

namespace Cap7CE.WinUI.Controls;

// Presentation of the existing bounded archive listing. No extraction or navigation.
internal sealed class ArchivePreviewView : Grid
{
    public ArchivePreviewView(JsonElement reply)
    {
        Padding=new(56,16,56,12);RowSpacing=12;
        RowDefinitions.Add(new(){Height=GridLength.Auto});RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});RowDefinitions.Add(new(){Height=GridLength.Auto});
        var entries=reply.GetProperty("entries").EnumerateArray().Select(entry=>new ArchivePreviewEntry(
            entry.GetProperty("path").GetString()??"",entry.GetProperty("directory").GetBoolean(),
            DetailsCard.Bytes(entry.TryGetProperty("size",out var size)&&size.TryGetInt64(out var bytes)?bytes:null))).ToArray();
        var count=reply.GetProperty("entryCount").GetInt32();var sizeLabel=DetailsCard.Bytes(reply.GetProperty("totalUncompressedSize").GetDecimal());
        var summary=L.Text("ui.preview.archiveSummary",true,()=>new Dictionary<string,object?>{{"count",count},{"size",sizeLabel}});
        summary.FontSize=12;summary.Margin=new(8,0,8,0);Children.Add(summary);
        var list=new ListView {SelectionMode=ListViewSelectionMode.None,IsItemClickEnabled=false,
            HorizontalContentAlignment=HorizontalAlignment.Stretch,ItemsSource=entries,Background=null};
        var itemStyle=new Style(typeof(ListViewItem));
        itemStyle.Setters.Add(new Setter(Control.HorizontalContentAlignmentProperty,HorizontalAlignment.Stretch));
        itemStyle.Setters.Add(new Setter(Control.PaddingProperty,new Thickness(8,7,8,7)));
        itemStyle.Setters.Add(new Setter(Control.MinHeightProperty,56d));list.ItemContainerStyle=itemStyle;
        list.ItemTemplate=(DataTemplate)XamlReader.Load("""
            <DataTemplate xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:language="using:Cap7CE.WinUI.Localization">
              <Grid ColumnSpacing="12" ToolTipService.ToolTip="{Binding FullPath}">
                <Grid.ColumnDefinitions><ColumnDefinition Width="24"/><ColumnDefinition Width="*"/><ColumnDefinition Width="84"/></Grid.ColumnDefinitions>
                <FontIcon Glyph="{Binding Glyph}" FontSize="20" VerticalAlignment="Center"/>
                <StackPanel Grid.Column="1" Spacing="3" VerticalAlignment="Center">
                  <TextBlock Text="{Binding Name}" FontSize="14" TextTrimming="CharacterEllipsis"/>
                  <TextBlock language:LanguageText.Literal="{Binding Location}" language:LanguageText.Key="{Binding LocationResourceKey}" FontSize="12" Foreground="{ThemeResource TextFillColorSecondaryBrush}" TextTrimming="CharacterEllipsis"/>
                </StackPanel>
                <TextBlock Grid.Column="2" language:LanguageText.Literal="{Binding SizeLabel}" language:LanguageText.Key="{Binding SizeResourceKey}" FontSize="12" Foreground="{ThemeResource TextFillColorSecondaryBrush}" HorizontalAlignment="Right" VerticalAlignment="Center"/>
              </Grid>
            </DataTemplate>
            """);
        ScrollViewer.SetHorizontalScrollBarVisibility(list,ScrollBarVisibility.Disabled);
        ScrollViewer.SetVerticalScrollBarVisibility(list,ScrollBarVisibility.Auto);IdleScrollBars.Attach(list);
        Grid.SetRow(list,1);Children.Add(list);
        var hint=Ui.Text("",true);
        if(entries.Length==0||reply.GetProperty("truncated").GetBoolean())L.Bind(hint,TextBlock.TextProperty,entries.Length==0?"ui.preview.archiveEmpty":"ui.preview.archiveTruncated",()=>new Dictionary<string,object?>{{"count",entries.Length}});
        hint.FontSize=12;hint.Margin=new(8,0,8,0);hint.Visibility=hint.Text.Length==0?Visibility.Collapsed:Visibility.Visible;Grid.SetRow(hint,2);Children.Add(hint);
    }
}
