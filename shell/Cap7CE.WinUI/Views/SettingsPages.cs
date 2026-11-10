using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Localization;

namespace Cap7CE.WinUI.Views;

internal sealed record SettingsEntry(string Category,string Section,string Title,string Description,Func<UIElement> Create,bool Expanded=false);

internal sealed class SettingsPages
{
    private readonly SettingsCatalog catalog;
    public event Action<string,Func<UIElement>>? SubpageRequested;
    public SettingsPages(ShellServices services,Window owner,Action<UiMessage> notice)
        =>catalog=new SettingsCatalog(services,owner,new SettingsActions(notice),notice,(title,create)=>SubpageRequested?.Invoke(title,create));
    public void FocusMetadata()=>catalog.FocusMetadata();
    public void FocusCapsule()=>catalog.FocusCapsule();
    public void FocusUpdates()=>catalog.FocusUpdates();
    public void FocusIndex()=>catalog.FocusIndex();
    public UIElement Build(string category)
    {
        catalog.BeginRender();var column=Ui.Column();column.Spacing=24;
        var matches=catalog.Entries.Where(e=>e.Category==category).ToArray();
        foreach(var categoryGroup in matches.GroupBy(e=>e.Category))
        {
            var heading=LanguageUi.Text(LanguageUi.CategoryKey(categoryGroup.Key));heading.Style=(Style)Application.Current.Resources["CapSettingsPageTitle"];column.Children.Add(heading);
            foreach(var group in categoryGroup.GroupBy(e=>e.Section))
            {
                var section=Ui.Column();section.Spacing=6;
                var title=LanguageUi.Text(group.Key);title.Style=(Style)Application.Current.Resources["CapSettingsSectionTitle"];title.Margin=new(0,0,0,4);section.Children.Add(title);
                foreach(var row in group)section.Children.Add(row.Title.Length==0?row.Create():new SettingsCard(row.Title,row.Description,row.Create(),row.Expanded,localized:true));
                column.Children.Add(section);
            }
        }
        return column;
    }
}
