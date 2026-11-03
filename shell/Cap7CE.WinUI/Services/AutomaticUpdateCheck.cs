using Cap7CE.WinUI.Models;
namespace Cap7CE.WinUI.Services;

internal sealed record AutomaticUpdateResult(bool Succeeded,string? Version=null);
// One startup attempt, no timer, task scheduling, download or installer ownership.
internal sealed class AutomaticUpdateCheck(Func<ShellPreferences> read,
    Func<Func<ShellPreferences,ShellPreferences>,Task> save,
    Func<CancellationToken,Task<AutomaticUpdateResult>> check,Func<string,bool> notify,
    Func<DateTimeOffset>? clock=null) : IAsyncDisposable
{
    private readonly CancellationTokenSource lifetime=new();
    private Task? running;
    private bool closed;
    internal static bool Due(ShellPreferences value,DateTimeOffset now)=>value.AutomaticUpdateChecks
        &&(value.LastAutomaticUpdateCheckUtc is not {} last||last>now||now-last>=TimeSpan.FromDays(7));
    public Task RunAsync()=>closed?Task.CompletedTask:running??=RunCoreAsync();
    private async Task RunCoreAsync()
    {
        try {
            var now=(clock??(()=>DateTimeOffset.UtcNow))();
            if(!Due(read(),now))return;
            var result=await check(lifetime.Token);
            lifetime.Token.ThrowIfCancellationRequested();
            if(!result.Succeeded||!read().AutomaticUpdateChecks)return;
            await save(value=>value with{LastAutomaticUpdateCheckUtc=now});
            lifetime.Token.ThrowIfCancellationRequested();
            var current=read();
            if(!current.AutomaticUpdateChecks||!current.Notifications||string.IsNullOrWhiteSpace(result.Version)
                ||current.NotifiedUpdateVersion==result.Version)return;
            if(notify(result.Version))await save(value=>value with{NotifiedUpdateVersion=result.Version});
        }catch(Exception) { /* Startup checking is optional; a later launch may try again. */ }
    }
    public async ValueTask DisposeAsync()
    {
        closed=true;lifetime.Cancel();if(running is not null)await running;lifetime.Dispose();
    }
}
