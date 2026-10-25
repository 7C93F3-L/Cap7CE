using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Services;

namespace Cap7CE.WinUI.Views;

internal sealed record SettingsEntry(string Category,string Section,string Title,string Description,Func<UIElement> Create,bool Expanded=false);

internal sealed class SettingsPages
{
    private readonly SettingsCatalog catalog;
    public SettingsPages(ShellServices services,Window owner,Action<string> notice)
        =>catalog=new SettingsCatalog(services,owner,new SettingsActions(notice),notice);
    public void FocusMetadata()=>catalog.FocusMetadata();
    public UIElement Build(string category)
    {
        catalog.BeginRender();var column=Ui.Column();column.Spacing=20;
        var matches=catalog.Entries.Where(e=>e.Category==category).ToArray();
        foreach(var categoryGroup in matches.GroupBy(e=>e.Category))
        {
            column.Children.Add(Ui.Heading(categoryGroup.Key));
            foreach(var group in categoryGroup.GroupBy(e=>e.Section))
            {
                var section=Ui.Column();section.Spacing=5;
                section.Children.Add(Ui.Text(group.Key,true));
                foreach(var row in group)section.Children.Add(row.Title.Length==0?row.Create():new SettingsCard(row.Title,row.Description,row.Create(),row.Expanded));
                column.Children.Add(section);
            }
        }
        if(category=="关于") {
            var footer=Ui.Column(Ui.Heading("Cap7CE"),Ui.Text("7C93F3-L & Echo",true));
            footer.Margin=new(0,16,0,8);column.Children.Add(footer);
        }
        return column;
    }
}
