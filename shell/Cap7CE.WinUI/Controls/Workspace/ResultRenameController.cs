using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.System;
using L=Cap7CE.WinUI.Localization.LanguageUi;

namespace Cap7CE.WinUI.Controls;

// One bounded overlay over a realized name; never changes virtualized item dimensions.
internal sealed class ResultRenameController : IDisposable
{
    private readonly ResultsView owner;
    private readonly FileCommands commands;
    private Popup? popup;
    private FrameworkElement? anchor;
    private AssetItem[] targets=[];
    private bool submitting;
    private readonly PointerEventHandler wheel;
    public ResultRenameController(ResultsView owner,FileCommands commands)
    {
        this.owner=owner;this.commands=commands;wheel=(_,_)=>Close();
        commands.RenameRequested+=Begin;owner.Unloaded+=Unloaded;owner.SizeChanged+=Resized;
        owner.SelectionChanged+=SelectionChanged;owner.AddHandler(UIElement.PointerWheelChangedEvent,wheel,true);
    }
    private void Begin(IReadOnlyList<AssetItem> items)
    {
        var snapshot=items.ToArray();
        owner.DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low,()=>{
            if(owner.IsLoaded&&snapshot.Length==owner.Selection.Count&&snapshot.All(owner.Selection.Contains))Open(snapshot);
        });
    }
    private void Open(AssetItem[] items)
    {
        Close();if(!commands.CanRename(items)||owner.XamlRoot is not {} root)return;
        owner.UpdateLayout();
        var target=items.Select(item=>(Item:item,Anchor:Find(owner,item))).FirstOrDefault(pair=>pair.Anchor is not null);
        if(target.Anchor is not {} label){commands.Run(()=>Task.FromException(new UiFailure("ui.rename.notVisible")));return;}
        targets=items;anchor=label;anchor.Unloaded+=AnchorUnloaded;anchor.DataContextChanged+=AnchorChanged;
        var bounds=label.TransformToVisual(root.Content).TransformBounds(new(0,0,label.ActualWidth,label.ActualHeight));
        var editor=new TextBox{Text=items.Length>1&&!target.Item.Entry.IsDirectory?Path.GetFileNameWithoutExtension(target.Item.FullPath):Path.GetFileName(target.Item.FullPath),
            AcceptsReturn=false,TextWrapping=TextWrapping.Wrap,MaxHeight=86,MinHeight=28,IsSpellCheckEnabled=false};
        L.Label(editor,"menu.rename");
        var hint=L.Text(items.Length>1?"ui.rename.batchHint":"ui.rename.hint",true);hint.FontSize=12;
        var error=Ui.Text("",true);error.FontSize=12;error.Visibility=Visibility.Collapsed;
        var panel=Ui.Column(editor,hint,error);panel.Spacing=4;
        var border=new Border{Child=panel,Style=(Style)Application.Current.Resources["CapDetailsCard"],Padding=new(4),
            RequestedTheme=owner.ActualTheme,Width=Math.Min(Math.Max(160,label.ActualWidth+8),Math.Max(160,root.Size.Width-16))};
        var current=new Popup{XamlRoot=root,Child=border,IsLightDismissEnabled=true,ShouldConstrainToRootBounds=true,
            HorizontalOffset=Math.Clamp(bounds.X-4,0,Math.Max(0,root.Size.Width-border.Width)),
            VerticalOffset=Math.Clamp(bounds.Y-4,0,Math.Max(0,root.Size.Height-132))};
        popup=current;label.Opacity=0;
        current.Closed+=(_,_)=>{if(ReferenceEquals(popup,current))Close();};
        editor.PreviewKeyDown+=async(_,e)=>{
            if(e.Key==VirtualKey.Escape){e.Handled=true;if(!submitting)Close();return;}
            if(e.Key!=VirtualKey.Enter)return;e.Handled=true;if(submitting)return;
            var name=editor.Text;var selected=targets;
            if(selected.Length==0)return;
            submitting=true;editor.IsEnabled=false;error.Visibility=Visibility.Collapsed;
            try{await commands.RenameAsync(selected,name);if(ReferenceEquals(popup,current))Close();}
            catch(Exception failure){
                if(ReferenceEquals(popup,current)){L.Message(error,TextBlock.TextProperty,FailureText.From(failure));error.Visibility=Visibility.Visible;}
                else commands.Run(()=>Task.FromException(failure));
            }finally{if(ReferenceEquals(popup,current)){submitting=false;editor.IsEnabled=true;editor.Focus(FocusState.Programmatic);}}
        };
        editor.Loaded+=(_,_)=>{editor.Focus(FocusState.Programmatic);editor.Select(0,items.Length>1||target.Item.Entry.IsDirectory?editor.Text.Length:Path.GetFileNameWithoutExtension(editor.Text).Length);};
        current.IsOpen=true;
    }
    private static FrameworkElement? Find(DependencyObject node,AssetItem item)
    {
        if(node is FrameworkElement {Visibility:Visibility.Collapsed})return null;
        if(node is AssetTile tile&&ReferenceEquals(tile.DataContext,item)&&tile.RenameAnchor.Visibility==Visibility.Visible&&tile.RenameAnchor.ActualWidth>0)return tile.RenameAnchor;
        if(node is TextBlock {Name:"RenameName",ActualWidth:>0} text&&ReferenceEquals(text.DataContext,item))return text;
        for(var i=0;i<VisualTreeHelper.GetChildrenCount(node);i++)if(Find(VisualTreeHelper.GetChild(node,i),item) is {} found)return found;
        return null;
    }
    private void SelectionChanged(IReadOnlyList<AssetItem> items){if(popup is not null&&(items.Count!=targets.Length||!targets.All(items.Contains)))Close();}
    private void Unloaded(object sender,RoutedEventArgs args)=>Close();
    private void AnchorUnloaded(object sender,RoutedEventArgs args)=>Close();
    private void AnchorChanged(FrameworkElement sender,DataContextChangedEventArgs args)=>Close();
    private void Resized(object sender,SizeChangedEventArgs args)=>Close();
    private void Close()
    {
        var previous=popup;popup=null;targets=[];submitting=false;
        if(anchor is {} label){label.Opacity=1;label.Unloaded-=AnchorUnloaded;label.DataContextChanged-=AnchorChanged;anchor=null;}
        if(previous is not null){previous.IsOpen=false;previous.Child=null;}
    }
    public void Dispose(){Close();commands.RenameRequested-=Begin;owner.Unloaded-=Unloaded;owner.SizeChanged-=Resized;owner.SelectionChanged-=SelectionChanged;owner.RemoveHandler(UIElement.PointerWheelChangedEvent,wheel);}
}
