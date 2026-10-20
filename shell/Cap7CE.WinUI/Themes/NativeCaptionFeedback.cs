using System.Runtime.InteropServices;

namespace Cap7CE.WinUI.Themes;

internal static class NativeCaptionFeedback
{
    public static bool IsActive(nint window) => window != 0 && GetForegroundWindow() == window;
    [DllImport("user32.dll", ExactSpelling = true)]
    private static extern nint GetForegroundWindow();

    // DWM must see WM_NCMOUSELEAVE when moving into the XAML passthrough island.
    // https://learn.microsoft.com/windows/win32/api/dwmapi/nf-dwmapi-dwmdefwindowproc
    public static void ClearHover(nint window)
    {
        if (window == 0) return;
        DwmDefWindowProc(window, 0x02A2, 0, 0, out _);
        // AppWindow's extended caption also needs its regular message pipeline notified.
        // Post instead of reentering WinUI input synchronously from PointerEntered.
        PostMessageW(window, 0x02A2, 0, 0);
        // The XAML island can suppress the native non-client transition. Also
        // notify AppWindow of the current HTCLIENT position without moving the cursor.
        if (GetCursorPos(out var point))
        {
            var position = unchecked((nint)(((uint)point.X & 0xffff) | (((uint)point.Y & 0xffff) << 16)));
            PostMessageW(window, 0x00A0, 1, position);
        }
    }

    [DllImport("dwmapi.dll", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DwmDefWindowProc(nint window, uint message, nuint wParam, nint lParam, out nint result);

    [DllImport("user32.dll", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool PostMessageW(nint window, uint message, nuint wParam, nint lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct Point { public int X, Y; }
    [DllImport("user32.dll", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetCursorPos(out Point point);
}
