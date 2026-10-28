using Cap7CE.WinUI.Models;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Storage.Pickers;

namespace Cap7CE.WinUI.Controls;

internal sealed class MetadataExclusionsView : UserControl
{
    private readonly ShellServices services;
    private readonly Window owner;
    private readonly StackPanel rows=Ui.Column();
    private readonly List<(MetadataExclusion Choice,CheckBox Check)> choices=[];
    private bool blocked,saving;
    public bool Busy=>saving;
    public Button AddButton {get;}
    public event Action? Changed;
    public event Action<string>? Failure;
    public MetadataExclusionsView(ShellServices services,Window owner)
    {
        this.services=services;this.owner=owner;rows.Spacing=4;
        AddButton=L.Button("ui.exclusions.add",()=>Run(AddAsync));
        Margin=new(0,8,0,12);Content=rows;Render();
    }
    public MetadataExclusion[] Snapshot()=>choices.Select(item=>item.Choice with{Enabled=item.Check.IsChecked==true}).ToArray();
    public void SetBusy(bool value){blocked=value;IsEnabled=AddButton.IsEnabled=!blocked&&!saving;}
    private void Render()
    {
        rows.Children.Clear();choices.Clear();var prefs=services.Preferences.Current;
        var items=MetadataExclusions.Defaults(prefs.MetadataExclusionChoices).Concat(prefs.MetadataCustomExclusions.Select(path=>
            new MetadataExclusion(MetadataExclusions.CustomKey(path),Path.GetFileName(path.TrimEnd('\\','/')) is {Length:>0} name?name:path,path,
                !prefs.MetadataExclusionChoices.TryGetValue(MetadataExclusions.CustomKey(path),out var enabled)||enabled,false)));
        foreach(var item in items) {
            var check=new CheckBox {IsChecked=item.Enabled,HorizontalAlignment=HorizontalAlignment.Stretch,HorizontalContentAlignment=HorizontalAlignment.Stretch,MinWidth=0,
                Content=new TextBlock {Text=item.Label,TextTrimming=TextTrimming.CharacterEllipsis,VerticalAlignment=VerticalAlignment.Center}};
            if(item.BuiltIn)L.Bind((TextBlock)check.Content,TextBlock.TextProperty,"ui.exclusions.builtIn."+item.Key);
            ToolTipService.SetToolTip(check,item.Path);choices.Add((item,check));
            check.Click+=(_,_)=>Run(()=>services.Preferences.UpdateAsync(value=>value with{
                MetadataExclusionChoices=new(value.MetadataExclusionChoices){[item.Key]=check.IsChecked==true}}));
            var row=new Grid {ColumnSpacing=20,Padding=new(0,4,0,4)};
            row.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});row.ColumnDefinitions.Add(new(){Width=new(2,GridUnitType.Star)});row.ColumnDefinitions.Add(new(){Width=GridLength.Auto});row.Children.Add(check);
            var pathText=Ui.Text(item.Path,true);pathText.TextWrapping=TextWrapping.NoWrap;pathText.TextTrimming=TextTrimming.CharacterEllipsis;pathText.VerticalAlignment=VerticalAlignment.Center;
            ToolTipService.SetToolTip(pathText,item.Path);Grid.SetColumn(pathText,1);row.Children.Add(pathText);
            if(!item.BuiltIn) {
                var remove=L.Button("ui.exclusions.remove",()=>Run(async()=>{
                    await services.Preferences.UpdateAsync(value=>{
                        var selected=new Dictionary<string,bool>(value.MetadataExclusionChoices);selected.Remove(item.Key);
                        return value with{MetadataCustomExclusions=value.MetadataCustomExclusions.Where(path=>MetadataExclusions.CustomKey(path)!=item.Key).ToArray(),MetadataExclusionChoices=selected};
                    });Render();
                }));Grid.SetColumn(remove,2);row.Children.Add(remove);
            }
            rows.Children.Add(row);
        }
    }
    private async void Run(Func<Task> action)
    {
        if(saving||blocked)return;saving=true;IsEnabled=AddButton.IsEnabled=false;Changed?.Invoke();
        try{await action();}catch(Exception error){Render();Failure?.Invoke(error.Message);}
        finally{saving=false;IsEnabled=AddButton.IsEnabled=!blocked;Changed?.Invoke();}
    }
    private async Task AddAsync()
    {
        var picker=new FolderPicker();picker.FileTypeFilter.Add("*");WinRT.Interop.InitializeWithWindow.Initialize(picker,WinRT.Interop.WindowNative.GetWindowHandle(owner));
        if(await picker.PickSingleFolderAsync() is not {} folder)return;
        var path=Path.GetFullPath(folder.Path);var key=MetadataExclusions.CustomKey(path);FileAccessGuard.RejectLinks(path);
        if(choices.Any(item=>!string.IsNullOrEmpty(item.Choice.Path)&&MetadataExclusions.CustomKey(item.Choice.Path)==key))return;
        if(services.Preferences.Current.MetadataCustomExclusions.Length>=32)throw new IOException("metadata-exclusions-limit");
        await services.Preferences.UpdateAsync(value=>value with{MetadataCustomExclusions=[..value.MetadataCustomExclusions,path],MetadataExclusionChoices=new(value.MetadataExclusionChoices){[key]=true}});Render();
    }
}
