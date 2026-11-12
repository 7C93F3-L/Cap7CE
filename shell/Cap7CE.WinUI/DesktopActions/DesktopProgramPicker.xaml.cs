using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Localization;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Storage.Pickers;
namespace Cap7CE.WinUI.DesktopActions;
public sealed partial class DesktopProgramPicker : UserControl
{
    private readonly CancellationTokenSource lifetime=new();
    private readonly IReadOnlyList<DesktopProgram> existing;
    private readonly ContentDialog dialog;
    private DesktopProgram[] programs=[];
    private bool ready;
    private DesktopProgramPicker(XamlRoot root,IReadOnlyList<DesktopProgram> existing)
    {
        this.existing=existing;InitializeComponent();
        L.Bind(Search,TextBox.PlaceholderTextProperty,"ui.desktop.searchApps");
        dialog=L.Dialog(root,"ui.desktop.chooseApp",null,"ui.desktop.add",ContentDialogButton.Primary);
        L.Bind(dialog,ContentDialog.SecondaryButtonTextProperty,"ui.desktop.browseFile");
        dialog.Content=this;dialog.IsPrimaryButtonEnabled=false;
        var width=Math.Clamp(root.Size.Width-32,0,360);
        dialog.Resources["ContentDialogMinWidth"]=width;dialog.Resources["ContentDialogMaxWidth"]=width;
        dialog.Opened+=async(_,_)=>await LoadAsync();dialog.Closed+=(_,_)=>lifetime.Cancel();
        L.Bind(Status,TextBlock.TextProperty,"common.loading");IdleScrollBars.Attach(Apps);
    }
    internal static async Task<DesktopProgram?> PickAsync(Window owner,IReadOnlyList<DesktopProgram> existing)
    {
        var view=new DesktopProgramPicker(owner.Content.XamlRoot,existing);
        try {
            var result=await view.dialog.ShowAsync();
            if(result==ContentDialogResult.Primary)return view.Apps.SelectedItem as DesktopProgram;
            if(result!=ContentDialogResult.Secondary)return null;
            var picker=new FileOpenPicker();picker.FileTypeFilter.Add(".exe");picker.FileTypeFilter.Add(".lnk");
            WinRT.Interop.InitializeWithWindow.Initialize(picker,WinRT.Interop.WindowNative.GetWindowHandle(owner));
            return await picker.PickSingleFileAsync() is {} file?await DesktopApplicationCatalog.FromFileAsync(file.Path):null;
        }finally{view.lifetime.Cancel();view.lifetime.Dispose();}
    }
    private async Task LoadAsync()
    {
        try {
            var loaded=await DesktopApplicationCatalog.ReadAsync(lifetime.Token);
            if(lifetime.IsCancellationRequested)return;
            programs=loaded.Where(p=>!existing.Any(p.SameEntry)).ToArray();ready=true;Filter();
        }catch(OperationCanceledException){}catch(Exception error){
            if(!lifetime.IsCancellationRequested)L.Bind(Status,TextBlock.TextProperty,"ui.desktop.appsUnavailable");
            Services.SessionDiagnostics.Record("desktop.apps.failed",new{type=error.GetType().Name,hresult=$"0x{error.HResult:X8}"});
        }
    }
    private void SearchChanged(object sender,TextChangedEventArgs e){if(ready)Filter();}
    private void Filter()
    {
        var words=Search.Text.Split(' ',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries);
        var matches=programs.Where(p=>words.All(word=>p.Name.Contains(word,StringComparison.CurrentCultureIgnoreCase))).ToArray();
        Apps.ItemsSource=matches;Status.Visibility=matches.Length==0?Visibility.Visible:Visibility.Collapsed;
        L.Bind(Status,TextBlock.TextProperty,"ui.desktop.noApps");dialog.IsPrimaryButtonEnabled=false;
    }
    private void SelectionChanged(object sender,SelectionChangedEventArgs e){if(dialog is not null)dialog.IsPrimaryButtonEnabled=Apps.SelectedItem is DesktopProgram;}
    private void IconLoaded(object sender,RoutedEventArgs e)=>LoadIcon((Button)sender);
    private void IconContextChanged(FrameworkElement sender,DataContextChangedEventArgs e)=>LoadIcon((Button)sender);
    private void LoadIcon(Button button)
    {
        if(button.Tag is CancellationTokenSource previous)previous.Cancel();button.Tag=null;button.Content=new FontIcon{Glyph="\uE8A5",FontSize=20};
        if(button.IsLoaded&&!lifetime.IsCancellationRequested&&button.DataContext is DesktopProgram program)_=DesktopProgramIcon.LoadAsync(button,program.Path,lifetime.Token);
    }
}
