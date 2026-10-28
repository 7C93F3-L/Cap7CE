using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Markup;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Input;
using Windows.System;

namespace Cap7CE.WinUI.Controls;

public sealed class PaneResizer : UserControl
{
    private double pendingDelta;
    private bool frameQueued;
    public event Action<double>? ResizeRequested;
    public event Action? ResizeCompleted;
    public event Action? ResetRequested;
    public event Action<double>? KeyResizeRequested;
    private void QueueResize(double delta)
    {
        pendingDelta+=delta;
        if(frameQueued)return;
        frameQueued=true;CompositionTarget.Rendering+=OnResizeFrame;
    }
    private void OnResizeFrame(object? sender,object args)=>FlushResize();
    private void FlushResize()
    {
        var delta=pendingDelta;CancelResize();
        if(delta!=0)ResizeRequested?.Invoke(delta);
    }
    private void CancelResize()
    {
        if(frameQueued)CompositionTarget.Rendering-=OnResizeFrame;
        frameQueued=false;pendingDelta=0;
    }
    public PaneResizer()
    {
        IsTabStop = true; MinWidth = 4;
        UseSystemFocusVisuals = true;
        var thumb = new Thumb { IsTabStop = false, Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent),
            HorizontalAlignment = HorizontalAlignment.Stretch, VerticalAlignment = VerticalAlignment.Stretch };
        thumb.Template = (ControlTemplate)XamlReader.Load("<ControlTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' TargetType='Thumb'><Border Background='{TemplateBinding Background}'/></ControlTemplate>");
        thumb.DragDelta += (_, e) => QueueResize(e.HorizontalChange);
        thumb.DragCompleted += (_, _) => {FlushResize();ResizeCompleted?.Invoke();};
        Unloaded+=(_,_)=>CancelResize();
        Content = thumb;
        HorizontalAlignment = HorizontalAlignment.Stretch; VerticalAlignment = VerticalAlignment.Stretch;
        ProtectedCursor = InputSystemCursor.Create(InputSystemCursorShape.SizeWestEast);
        Cap7CE.WinUI.Localization.LanguageUi.Bind(this,AutomationProperties.HelpTextProperty,"ui.accessibility.resizeHelp");
        AddHandler(DoubleTappedEvent, new DoubleTappedEventHandler((_, e) => { e.Handled = true; ResetRequested?.Invoke(); }), true);
        KeyDown += (_, e) => {
            if (e.Key is not (VirtualKey.Left or VirtualKey.Right)) return;
            e.Handled = true; KeyResizeRequested?.Invoke(e.Key == VirtualKey.Left ? -16 : 16);
        };
    }
}
