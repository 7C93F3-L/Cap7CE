using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI.Services;

internal static class WindowActivation
{
    internal static event Action<Window>? Showing;
    public static void Show(Window window)
    {
        Showing?.Invoke(window);
        if(window.AppWindow.Presenter is OverlappedPresenter {State:OverlappedPresenterState.Minimized} presenter)presenter.Restore();
        window.AppWindow.Show();window.Activate();
    }
}
