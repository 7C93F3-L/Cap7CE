using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Localization;

internal static class LocationText
{
    // Capture the OS text before binding. Language callbacks do not call Shell APIs.
    public static UiMessage Computer=>ComputerFrom(SystemLocations.Current);
    public static UiMessage ComputerFrom(SystemLocationSnapshot snapshot)=>snapshot.Computer is {} location?UiMessage.Literal(location.Name):UiMessage.Key("main.home");
}
