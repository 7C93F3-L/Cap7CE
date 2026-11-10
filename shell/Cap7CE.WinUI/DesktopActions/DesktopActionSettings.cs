using System.Collections.ObjectModel;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Storage.Pickers;
namespace Cap7CE.WinUI.DesktopActions;
internal sealed class DesktopActionSettings : StackPanel
{
    private readonly DesktopActionStore store;
    private readonly Window owner;
    private readonly Action<UiMessage> notice;
    private readonly ListView list=new(){CanDragItems=true,CanReorderItems=true,AllowDrop=true,SelectionMode=ListViewSelectionMode.None,MaxHeight=400};
    private readonly ObservableCollection<DesktopProgramSettingsRow> programs=new();
    private DesktopProgramSettingsRow[]? dragging;
    public DesktopActionSettings(DesktopActionStore store,Window owner,Action<UiMessage> notice)
    {
        this.store=store;this.owner=owner;this.notice=notice;Spacing=12;
        var enabled=LanguageUi.Toggle();enabled.IsOn=store.Current.Enabled;
        enabled.Toggled+=(_,_)=>Run(()=>store.UpdateAsync(v=>v with{Enabled=enabled.IsOn}));Children.Add(Row("ui.desktop.show",enabled));
        var size=new Slider{Minimum=24,Maximum=48,StepFrequency=2,Value=store.Current.Size,MinWidth=160};
        size.ValueChanged+=(_,_)=>pendingSize=size.Value;
        size.PointerCaptureLost+=(_,_)=>SaveSize();size.KeyUp+=(_,_)=>SaveSize();
        var reset=LanguageUi.Button("ui.desktop.reset",()=>Run(async()=>{await store.ResetCapsuleAsync();size.Value=store.Current.Size;pendingSize=0;}));
        ToolTipService.SetToolTip(reset,AppLanguage.Text("ui.desktop.resetCapsuleHint"));
        Children.Add(Row("ui.desktop.size",size));Children.Add(Row("ui.desktop.resetCapsule",reset));
        Children.Add(new Border{Height=1,Margin=new(0,4,0,4),Background=(Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["DividerStrokeColorDefaultBrush"]});
        Children.Add(Row("ui.desktop.apps",LanguageUi.Button("ui.desktop.add",Add)));
        RestoreRows();list.ItemsSource=programs;
        var itemStyle=new Style(typeof(ListViewItem)){BasedOn=(Style)Application.Current.Resources["DefaultListViewItemStyle"]};
        itemStyle.Setters.Add(new Setter(Control.HorizontalContentAlignmentProperty,HorizontalAlignment.Stretch));itemStyle.Setters.Add(new Setter(PaddingProperty,new Thickness(0)));list.ItemContainerStyle=itemStyle;
        list.DragItemsStarting+=(_,e)=>{if(e.Items.Count!=1){e.Cancel=true;return;}dragging=programs.ToArray();e.Data.RequestedOperation=Windows.ApplicationModel.DataTransfer.DataPackageOperation.Move;};
        list.DragItemsCompleted+=(_,e)=>{
            var before=dragging;dragging=null;if(before is null)return;
            if(e.DropResult!=Windows.ApplicationModel.DataTransfer.DataPackageOperation.Move){programs.Clear();foreach(var row in before)programs.Add(row);return;}
            Run(SaveOrderAsync);
        };
        Children.Add(list);
    }
    private void RestoreRows(){programs.Clear();foreach(var app in store.Current.Programs)programs.Add(new(app,Remove));}
    private double pendingSize;
    private void SaveSize(){if(pendingSize>=24)Run(()=>store.UpdateAsync(v=>v with{Size=pendingSize}));}
    private void Remove(DesktopProgramSettingsRow app){programs.Remove(app);Run(SaveOrderAsync);}
    private async Task SaveOrderAsync(){var items=programs.Select(row=>row.Program).ToArray();try{await store.UpdateAsync(v=>v with{Programs=items});}catch{RestoreRows();throw;}}
    private async void Add()
    {
        try{var picker=new FileOpenPicker();picker.FileTypeFilter.Add(".exe");WinRT.Interop.InitializeWithWindow.Initialize(picker,WinRT.Interop.WindowNative.GetWindowHandle(owner));
            if(await picker.PickSingleFileAsync() is not {} file)return;
            if(programs.Any(p=>string.Equals(p.Program.Path,file.Path,StringComparison.OrdinalIgnoreCase)))return;
            if(programs.Count>=30)throw new UiFailure("ui.desktop.appsLimit");
            programs.Add(new(new DesktopProgram(Path.GetFileNameWithoutExtension(file.Path),file.Path),Remove));await SaveOrderAsync();
        }catch(Exception error){notice(FailureText.From(error));}
    }
    private async void Run(Func<Task> action){try{await action();}catch(Exception error){notice(FailureText.From(error));}}
    internal static Grid Row(string key,FrameworkElement control)
    {
        var grid=new Grid{ColumnSpacing=20,MinHeight=44};grid.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});grid.ColumnDefinitions.Add(new(){Width=new(200)});
        grid.RowDefinitions.Add(new(){Height=GridLength.Auto});grid.RowDefinitions.Add(new(){Height=GridLength.Auto});
        var label=LanguageUi.Text(key);label.VerticalAlignment=VerticalAlignment.Center;grid.Children.Add(label);
        control.HorizontalAlignment=HorizontalAlignment.Right;control.VerticalAlignment=VerticalAlignment.Center;
        if(control is Slider)control.Width=200;
        var actions=new ContentControl{Content=control,HorizontalContentAlignment=HorizontalAlignment.Right,VerticalContentAlignment=VerticalAlignment.Center};
        Grid.SetColumn(actions,1);grid.Children.Add(actions);
        grid.SizeChanged+=(_,_)=>{var narrow=grid.ActualWidth<360;grid.ColumnDefinitions[1].Width=new(narrow?0:200);grid.RowSpacing=narrow?8:0;
            Grid.SetColumnSpan(label,narrow?2:1);Grid.SetRow(actions,narrow?1:0);Grid.SetColumn(actions,narrow?0:1);Grid.SetColumnSpan(actions,narrow?2:1);actions.MaxWidth=Math.Max(0,grid.ActualWidth);};
        return grid;
    }
}
internal sealed class DesktopHistorySettings : StackPanel
{
    public DesktopHistorySettings(DesktopActionStore store,Func<XamlRoot> root,Action<UiMessage> notice)
    {
        Spacing=12;var toggle=LanguageUi.Toggle();toggle.IsOn=store.Current.RecordHistory;
        async void Save(Func<DesktopActionOptions,DesktopActionOptions> update){try{await store.UpdateAsync(update);}catch(Exception error){notice(FailureText.From(error));}}
        toggle.Toggled+=(_,_)=>Save(v=>v with{RecordHistory=toggle.IsOn});Children.Add(DesktopActionSettings.Row("ui.desktop.record",toggle));
        int[] counts=[3,5,10,20];var count=Ui.Select(counts.Select(i=>i.ToString()),Array.IndexOf(counts,store.Current.HistoryCount),i=>Save(v=>v with{HistoryCount=counts[i]}));
        Children.Add(DesktopActionSettings.Row("ui.desktop.count",count));
        var clear=LanguageUi.Button("ui.desktop.clear",async()=>{try{
            var dialog=ThemeService.Dialog(root(),ContentDialogButton.Close);dialog.Title=AppLanguage.Text("ui.desktop.clear");dialog.Content=AppLanguage.Text("ui.desktop.clearConfirm");dialog.PrimaryButtonText=AppLanguage.Text("ui.desktop.clear");dialog.CloseButtonText=AppLanguage.Text("common.cancel");
            if(await dialog.ShowAsync()==ContentDialogResult.Primary)Save(v=>v with{History=[]});
            }catch(Exception error){notice(FailureText.From(error));}
        });Children.Add(DesktopActionSettings.Row("ui.desktop.clearHistory",clear));
    }
}
