namespace Cap7CE.WinUI.Views;
internal sealed class SettingsActions(Action<string> notice)
{
    public async void Run(Func<Task> work){try{await work();}catch(Exception error){notice(error.Message);}}
}
