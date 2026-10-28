using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;
using Windows.Graphics;
using Microsoft.UI.Dispatching;
using ShapePath = Microsoft.UI.Xaml.Shapes.Path;

namespace Cap7CE.WinUI.Themes;

internal sealed class WindowTitleBar : Grid
{
    private readonly Grid dragRegion = new() { Height = 48, Background = new SolidColorBrush(Colors.Transparent) };
    private readonly ColumnDefinition captionSpace = new() { Width = new(0) };
    private ToggleButton? pin;
    private Action<bool>? pinChanged;
    private ShapePath? pinCenter;
    private Grid? pinGlyph;
    private Window? owner;
    private AppWindow? appWindow;
    private bool updateQueued, updatingRegion, regionFailureLogged;

    private WindowTitleBar(FrameworkElement content)
    {
        RowDefinitions.Add(new() { Height = GridLength.Auto });
        RowDefinitions.Add(new() { Height = new(1, GridUnitType.Star) });
        Children.Add(dragRegion);
        SetRow(content, 1);
        Children.Add(content);
    }

    public static void ConfigurePin(Window window, bool enabled, Action<bool> changed)
    {
        if (window.Content is not WindowTitleBar frame) return;
        frame.pinChanged = changed;
        if (window.AppWindow.Presenter is OverlappedPresenter presenter && presenter.IsAlwaysOnTop != enabled) presenter.IsAlwaysOnTop = enabled;
        if (frame.pin is null) frame.AddPin(window);
        frame.pin!.IsChecked = enabled;
        frame.pinCenter!.Visibility = enabled ? Visibility.Visible : Visibility.Collapsed;
        Localization.LanguageUi.Label(frame.pin,enabled?"main.unpin":"main.pin");
    }

    private void AddPin(Window window)
    {
        owner = window;appWindow = window.AppWindow;
        dragRegion.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star) });
        dragRegion.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        dragRegion.ColumnDefinitions.Add(captionSpace);
        var glyph = pinGlyph = new Grid { Width = 10, Height = 10, IsHitTestVisible = false, RenderTransform = new TranslateTransform() };
        // Both paths occupy the same 10-DIP box; independently centering a
        // 3-DIP element in a 10-DIP box rounds its 3.5-DIP offset asymmetrically.
        var ring = new ShapePath { Width = 10, Height = 10, Stretch = Stretch.None, StrokeThickness = 1,
            Data = new EllipseGeometry { Center = new(5,5), RadiusX = 4.5, RadiusY = 4.5 } };
        pinCenter = new ShapePath { Width = 10, Height = 10, Stretch = Stretch.None,
            Data = new EllipseGeometry { Center = new(5,5), RadiusX = 1.5, RadiusY = 1.5 } };
        pin = new ToggleButton { Content = glyph, Style = (Style)Application.Current.Resources["CapTitleBarPin"] };
        ring.SetBinding(Shape.StrokeProperty, new Microsoft.UI.Xaml.Data.Binding { Source = pin, Path = new("Foreground") });
        pinCenter.SetBinding(Shape.FillProperty, new Microsoft.UI.Xaml.Data.Binding { Source = pin, Path = new("Foreground") });
        glyph.Children.Add(ring);glyph.Children.Add(pinCenter);
        SetColumn(pin, 1);dragRegion.Children.Add(pin);
        pin.Click += (_, _) => pinChanged?.Invoke(pin.IsChecked == true);
        pin.PointerEntered += (_, _) => {
            if (owner is not null) NativeCaptionFeedback.ClearHover(WinRT.Interop.WindowNative.GetWindowHandle(owner));
        };
        dragRegion.Loaded += (_, _) => QueuePinRegionUpdate();
        dragRegion.SizeChanged += (_, _) => QueuePinRegionUpdate();
        pin.SizeChanged += (_, _) => QueuePinRegionUpdate();
        pin.Loaded += (_, _) => SynchronizeActivation();
        pin.ActualThemeChanged += (_, _) => QueuePinRegionUpdate();
        appWindow.Changed += OnWindowChanged;
        appWindow.Destroying += OnDestroying;
        window.Activated += OnActivated;
        window.Closed += OnClosed;
        SynchronizeActivation();
        QueuePinRegionUpdate();
    }

    private void QueuePinRegionUpdate()
    {
        if (owner is null || updateQueued || updatingRegion) return;
        updateQueued = DispatcherQueue.TryEnqueue(DispatcherQueuePriority.Low, () => {
            updateQueued = false;
            if (owner is null) return;
            updatingRegion = true;
            try { UpdatePinRegion(); }
            catch (Exception error) when (error is ArgumentException || error is System.Runtime.InteropServices.COMException)
            {
                // A transient native layout must not fail the AppWindow event dispatcher.
                previousRegion = null;
                System.Diagnostics.Trace.WriteLine($"Title bar region update deferred: {error}");
                if (!regionFailureLogged)
                {
                    regionFailureLogged = true;
                    try
                    {
                        var folder = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cap7CE-PhaseF");
                        System.IO.Directory.CreateDirectory(folder);
                        System.IO.File.WriteAllText(System.IO.Path.Combine(folder, "last-titlebar-region-error.log"), $"{DateTimeOffset.Now:O}\n{error}");
                    }
                    catch { }
                }
            }
            finally { updatingRegion = false; }
        });
    }

    private RectInt32? previousRegion;
    private void UpdatePinRegion()
    {
        if (appWindow is null || pin is null || !pin.IsLoaded || pin.XamlRoot is null || !appWindow.IsVisible
            || appWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Minimized }) return;
        var scale = pin.XamlRoot.RasterizationScale;
        // Only the painted surfaces reserve one device pixel at the bottom.
        // The 48-DIP hit target and centered glyph retain their full layout bounds.
        var surfaceInset = new Thickness(0, 0, 0, 1 / scale);
        if (!pin.BorderThickness.Equals(surfaceInset)) pin.BorderThickness = surfaceInset;
        // Native caption glyphs in the supplied screenshot sit one pixel higher.
        if (pinGlyph?.RenderTransform is TranslateTransform glyphOffset) glyphOffset.Y = -1 / scale;
        var inset = appWindow.TitleBar.RightInset / scale;
        var width = inset > 0 ? inset / 3 : 46;
        if (captionSpace.Width.Value != inset || pin.Width != width)
        {
            captionSpace.Width = new(inset);pin.Width = width;
            // Wait for XAML to arrange the new caption reservation before hit testing.
            DispatcherQueue.TryEnqueue(DispatcherQueuePriority.Low, QueuePinRegionUpdate);
            return;
        }
        // The three native caption buttons occupy the inset; match their average width.
        var bounds = pin.TransformToVisual(this).TransformBounds(new(0, 0, pin.ActualWidth, pin.ActualHeight));
        if (!double.IsFinite(bounds.X + bounds.Y + bounds.Width + bounds.Height) || bounds.Width <= 0 || bounds.Height <= 0
            || bounds.X < 0 || bounds.Y < 0 || bounds.Right > ActualWidth + 1 || bounds.Bottom > dragRegion.ActualHeight + 1) return;
        var rect = new RectInt32((int)Math.Round(bounds.X * scale), (int)Math.Round(bounds.Y * scale),
            (int)Math.Round(bounds.Width * scale), (int)Math.Round(bounds.Height * scale));
        if (previousRegion is { } prior && prior.X == rect.X && prior.Y == rect.Y && prior.Width == rect.Width && prior.Height == rect.Height) return;
        InputNonClientPointerSource.GetForWindowId(appWindow.Id).SetRegionRects(NonClientRegionKind.Passthrough, [rect]);
        previousRegion = rect;
    }

    private void OnWindowChanged(AppWindow sender, AppWindowChangedEventArgs args)
    { if (args.DidSizeChange || args.DidPositionChange || args.DidPresenterChange || args.DidVisibilityChange) QueuePinRegionUpdate(); }
    private void OnDestroying(AppWindow sender, object args) => Detach();
    private void OnActivated(object sender, WindowActivatedEventArgs args)
    { SetGlyphActivation(args.WindowActivationState != WindowActivationState.Deactivated); }
    private void SynchronizeActivation()
    {
        if (owner is not null) SetGlyphActivation(NativeCaptionFeedback.IsActive(WinRT.Interop.WindowNative.GetWindowHandle(owner)));
    }
    private void SetGlyphActivation(bool active)
    {
        // The pin is added after the first activation during preference loading.
        // Initialize the glyph as well as reacting to later focus transitions.
        if (pinGlyph is not null) pinGlyph.Opacity = active ? 1 : 0.4;
    }
    private void OnClosed(object sender, WindowEventArgs args)
        => Detach();
    private void Detach()
    {
        if (owner is null) return;
        var window = owner;owner = null;
        if (appWindow is not null) { appWindow.Changed -= OnWindowChanged;appWindow.Destroying -= OnDestroying;appWindow = null; }
        window.Activated -= OnActivated;window.Closed -= OnClosed;
    }

    public static void Apply(Window window, ElementTheme theme)
    {
        if (window.Content is not WindowTitleBar frame)
        {
            var content = (FrameworkElement)window.Content;
            window.Content = null;
            frame = new(content);
            window.Content = frame;
            window.ExtendsContentIntoTitleBar = true;
            window.AppWindow.TitleBar.PreferredHeightOption = TitleBarHeightOption.Tall;
            window.SetTitleBar(frame.dragRegion);
        }
        frame.RequestedTheme = theme;
        window.AppWindow.TitleBar.ButtonBackgroundColor = Colors.Transparent;
        window.AppWindow.TitleBar.ButtonInactiveBackgroundColor = Colors.Transparent;
    }
}
