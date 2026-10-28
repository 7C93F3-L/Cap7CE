using Cap7CE.WinUI.Localization;
namespace Cap7CE.WinUI.Views;
internal sealed class SettingsActions(Action<UiMessage> notice)
{
    public async void Run(Func<Task> work){try{await work();}catch(Exception error){notice(FailureText.From(error));}}
}
