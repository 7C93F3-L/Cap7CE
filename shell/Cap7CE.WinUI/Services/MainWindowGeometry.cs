using System.Runtime.InteropServices;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Windows.Graphics;

namespace Cap7CE.WinUI.Services;

internal static class MainWindowGeometry
{
    public static void ApplyDefault(Window window)
    {
        var workArea = DisplayArea.GetFromWindowId(window.AppWindow.Id, DisplayAreaFallback.Nearest).WorkArea;
        var dpi = GetDpiForWindow(WinRT.Interop.WindowNative.GetWindowHandle(window));
        var scale = dpi == 0 ? 1 : dpi / 96d;
        ApplyMinimum(window, scale);
        window.AppWindow.MoveAndResize(ResolveDefaultBounds(workArea, scale));
        window.AppWindow.Changed += OnWindowChanged;
        window.Closed += (_, _) => window.AppWindow.Changed -= OnWindowChanged;

        void OnWindowChanged(AppWindow sender, AppWindowChangedEventArgs args)
        {
            if (!args.DidPositionChange && !args.DidSizeChange) return;
            var currentDpi = GetDpiForWindow(WinRT.Interop.WindowNative.GetWindowHandle(window));
            if (currentDpi == 0 || currentDpi == dpi) return;
            dpi = currentDpi;
            ApplyMinimum(window, dpi / 96d);
        }
    }

    private static void ApplyMinimum(Window window, double scale)
    {
        if (window.AppWindow.Presenter is not OverlappedPresenter presenter) return;
        presenter.PreferredMinimumWidth = Round(300 * scale);
        presenter.PreferredMinimumHeight = Round(210 * scale);
    }

    public static void RestoreDefault(Window window)
    {
        if (window.AppWindow.Presenter is OverlappedPresenter presenter && presenter.State != OverlappedPresenterState.Restored)
            presenter.Restore();
        var workArea = DisplayArea.GetFromWindowId(window.AppWindow.Id, DisplayAreaFallback.Nearest).WorkArea;
        var dpi = GetDpiForWindow(WinRT.Interop.WindowNative.GetWindowHandle(window));
        var bounds = ResolveDefaultBounds(workArea, dpi == 0 ? 1 : dpi / 96d);
        var position = window.AppWindow.Position;
        bounds.X = Math.Clamp(position.X, workArea.X, workArea.X + workArea.Width - bounds.Width);
        bounds.Y = Math.Clamp(position.Y, workArea.Y, workArea.Y + workArea.Height - bounds.Height);
        window.AppWindow.MoveAndResize(bounds);
    }

    internal static RectInt32 ResolveDefaultBounds(RectInt32 workArea, double scale)
    {
        var width = Size(workArea.Width, scale, 0.9, 300, 1760);
        var height = Size(workArea.Height, scale, 0.82, 210, 1000);
        return new(workArea.X + Round((workArea.Width - width) / 2d),
            workArea.Y + Round((workArea.Height - height) / 2d), width, height);
    }

    private static int Size(int available, double scale, double ratio, int minimum, int maximum)
    {
        var logical = Math.Max(1, Math.Min(available / scale,
            Math.Max(minimum, Math.Min(maximum, Round(available / scale * ratio)))));
        return Math.Clamp(Round(logical * scale), 1, Math.Max(1, available));
    }

    private static int Round(double value) => (int)Math.Round(value, MidpointRounding.AwayFromZero);

    [DllImport("user32.dll", ExactSpelling = true)]
    private static extern uint GetDpiForWindow(nint window);
}
