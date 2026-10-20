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
    public event Action<double>? ResizeRequested;
    public event Action? ResizeCompleted;
    public event Action? ResetRequested;
    public event Action<double>? KeyResizeRequested;
    public PaneResizer()
    {
        IsTabStop = true; MinWidth = 4;
        UseSystemFocusVisuals = true;
        var thumb = new Thumb { IsTabStop = false, Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent),
            HorizontalAlignment = HorizontalAlignment.Stretch, VerticalAlignment = VerticalAlignment.Stretch };
        thumb.Template = (ControlTemplate)XamlReader.Load("<ControlTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' TargetType='Thumb'><Border Background='{TemplateBinding Background}'/></ControlTemplate>");
        thumb.DragDelta += (_, e) => ResizeRequested?.Invoke(e.HorizontalChange);
        thumb.DragCompleted += (_, _) => ResizeCompleted?.Invoke();
        Content = thumb;
        HorizontalAlignment = HorizontalAlignment.Stretch; VerticalAlignment = VerticalAlignment.Stretch;
        ProtectedCursor = InputSystemCursor.Create(InputSystemCursorShape.SizeWestEast);
        AutomationProperties.SetHelpText(this, "拖动调整宽度；双击恢复默认；方向键每次调整 16 DIP");
        AddHandler(DoubleTappedEvent, new DoubleTappedEventHandler((_, e) => { e.Handled = true; ResetRequested?.Invoke(); }), true);
        KeyDown += (_, e) => {
            if (e.Key is not (VirtualKey.Left or VirtualKey.Right)) return;
            e.Handled = true; KeyResizeRequested?.Invoke(e.Key == VirtualKey.Left ? -16 : 16);
        };
    }
}
