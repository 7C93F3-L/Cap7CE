using Microsoft.UI.Xaml;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls.Filters;

internal enum MetadataRangeChoice { Current,Recommended,All,Custom }

internal sealed class MetadataRangePicker : Grid
{
    private readonly ListView options=new() {SelectionMode=ListViewSelectionMode.Single,IsItemClickEnabled=false};
    public event Action? CustomRequested;
    public MetadataRangeChoice Choice => (MetadataRangeChoice)Math.Max(0,options.SelectedIndex);

    public MetadataRangePicker(bool hasDirectory)
    {
        MinWidth=0;
        HorizontalAlignment=HorizontalAlignment.Stretch;
        Children.Add(options);
        Add("ui.metadataRange.current","ui.metadataRange.currentHint",hasDirectory);
        Add("ui.metadataRange.recommended","ui.metadataRange.recommendedHint");
        Add("ui.metadataRange.all","ui.metadataRange.allHint");
        Add("ui.metadataRange.custom","ui.metadataRange.customHint");
        options.SelectedIndex=hasDirectory?0:1;
        options.SelectionChanged+=(_,_)=>{if(Choice==MetadataRangeChoice.Custom)CustomRequested?.Invoke();};
    }

    private void Add(string label,string hint,bool enabled=true)
    {
        var item=new ListViewItem {IsEnabled=enabled,MinHeight=40};
        L.Bind(item,ListViewItem.ContentProperty,label);L.Bind(item,ToolTipService.ToolTipProperty,hint);options.Items.Add(item);
    }
}
