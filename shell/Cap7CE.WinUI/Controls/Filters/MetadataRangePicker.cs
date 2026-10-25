using Microsoft.UI.Xaml;
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
        Add("仅当前目录","包含子目录",hasDirectory);
        Add("推荐的范围","排除系统及软件目录");
        Add("全部已索引磁盘","不应用目录排除");
        Add("自定义…","前往元数据设置");
        options.SelectedIndex=hasDirectory?0:1;
        options.SelectionChanged+=(_,_)=>{if(Choice==MetadataRangeChoice.Custom)CustomRequested?.Invoke();};
    }

    private void Add(string label,string hint,bool enabled=true)
    {
        var item=new ListViewItem {Content=label,IsEnabled=enabled,MinHeight=40};
        ToolTipService.SetToolTip(item,hint);options.Items.Add(item);
    }
}
