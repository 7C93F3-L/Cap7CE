using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI.Services;

internal static class WindowActivation
{
    public static void Show(Window window)
    {
        if(window.AppWindow.Presenter is OverlappedPresenter {State:OverlappedPresenterState.Minimized} presenter)presenter.Restore();
        window.Activate();
    }
}
