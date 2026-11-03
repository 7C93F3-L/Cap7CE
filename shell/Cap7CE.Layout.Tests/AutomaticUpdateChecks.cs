using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
internal static class AutomaticUpdateChecks
{
    public static async Task RunAsync()
    {
        var now=new DateTimeOffset(2026,11,3,0,0,0,TimeSpan.Zero);var checks=0;
        void Check(bool value,string message){checks++;if(!value)throw new Exception(message);}
        Check(AutomaticUpdateCheck.Due(new(),now),"First startup is eligible.");
        Check(!AutomaticUpdateCheck.Due(new(){AutomaticUpdateChecks=false},now),"Disabled checks never start.");
        Check(!AutomaticUpdateCheck.Due(new(){LastAutomaticUpdateCheckUtc=now.AddDays(-7).AddTicks(1)},now),"Wait for the full interval.");
        Check(AutomaticUpdateCheck.Due(new(){LastAutomaticUpdateCheckUtc=now.AddDays(-7)},now),"Exact interval is eligible.");
        Check(AutomaticUpdateCheck.Due(new(){LastAutomaticUpdateCheckUtc=now.AddDays(1)},now),"Clock rollback cannot suppress checks forever.");
        var prefs=new ShellPreferences();var calls=0;var notifications=0;var saves=0;
        Task Save(Func<ShellPreferences,ShellPreferences> update){saves++;prefs=update(prefs);return Task.CompletedTask;}
        AutomaticUpdateCheck Owner(AutomaticUpdateResult result,bool delivered=true)=>new(()=>prefs,Save,
            _=>{calls++;return Task.FromResult(result);},_=>{notifications++;return delivered;},()=>now);
        await using(var owner=Owner(new(true,"2.0.1"))){await owner.RunAsync();await owner.RunAsync();}
        Check(calls==1&&notifications==1&&prefs.LastAutomaticUpdateCheckUtc==now&&prefs.NotifiedUpdateVersion=="2.0.1","One startup request and one version notification, durably recorded.");
        prefs=prefs with{LastAutomaticUpdateCheckUtc=now.AddDays(-8)};
        await using(var owner=Owner(new(true,"2.0.1")))await owner.RunAsync();
        Check(calls==2&&notifications==1,"A previously notified version stays quiet after another interval.");
        prefs=prefs with{LastAutomaticUpdateCheckUtc=now.AddDays(-8)};
        await using(var owner=Owner(new(true,"2.0.2")))await owner.RunAsync();
        Check(notifications==2&&prefs.NotifiedUpdateVersion=="2.0.2","A newer release can notify.");
        prefs=new(){Notifications=false};await using(var owner=Owner(new(true,"2.0.3")))await owner.RunAsync();
        Check(notifications==2&&prefs.NotifiedUpdateVersion is null,"Master notification switch is respected.");
        prefs=new();await using(var owner=Owner(new(true,"2.0.3"),false))await owner.RunAsync();
        Check(prefs.NotifiedUpdateVersion is null,"Blocked notifications are not recorded as delivered.");
        prefs=new();var before=saves;await using(var owner=Owner(new(false)))await owner.RunAsync();
        Check(saves==before&&prefs.LastAutomaticUpdateCheckUtc is null,"Failure remains quiet and allows a later startup to try again.");
        await using(var owner=Owner(new(true)))await owner.RunAsync();
        Check(prefs.LastAutomaticUpdateCheckUtc==now&&prefs.NotifiedUpdateVersion is null,"Up-to-date success only records check time.");
        prefs=new(){AutomaticUpdateChecks=false};before=calls;await using(var owner=Owner(new(true,"3.0.0")))await owner.RunAsync();
        Check(calls==before,"Disabled startup does no network work.");
        prefs=new();var wait=new TaskCompletionSource<AutomaticUpdateResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        await using(var owner=new AutomaticUpdateCheck(()=>prefs,Save,token=>wait.Task.WaitAsync(token),_=>throw new Exception("Unexpected notice"),()=>now)){
            var work=owner.RunAsync();prefs=prefs with{AutomaticUpdateChecks=false};before=saves;wait.SetResult(new(true,"3.0.0"));await work;
            Check(saves==before,"Disabling while checking prevents persistence and notification.");
        }
        prefs=new();wait=new(TaskCreationOptions.RunContinuationsAsynchronously);
        var pending=new AutomaticUpdateCheck(()=>prefs,Save,token=>wait.Task.WaitAsync(token),_=>throw new Exception("Unexpected notice"),()=>now);
        var pendingWork=pending.RunAsync();await pending.DisposeAsync();await pendingWork;
        Check(prefs.LastAutomaticUpdateCheckUtc is null,"Exit cancels the optional check before publishing state.");
        prefs=new();await using(var owner=new AutomaticUpdateCheck(()=>prefs,_=>throw new IOException("save failed"),_=>Task.FromResult(new AutomaticUpdateResult(true,"3.0.0")),_=>throw new Exception("Unexpected notice"),()=>now))await owner.RunAsync();
        Check(prefs.NotifiedUpdateVersion is null,"Save failure leaves notification state unchanged and does not escape.");
        var directory=Path.Combine(Path.GetTempPath(),"Cap7CE-update-preferences-"+Guid.NewGuid().ToString("N"));
        try {
            var file=Path.Combine(directory,"preferences.json");var store=new PreferenceStore(file,null);await store.LoadAsync();
            await store.UpdateAsync(value=>value with{AutomaticUpdateChecks=false,LastAutomaticUpdateCheckUtc=now,NotifiedUpdateVersion="2.0.2"});
            var reload=new PreferenceStore(file,null);await reload.LoadAsync();
            Check(!reload.Current.AutomaticUpdateChecks&&reload.Current.LastAutomaticUpdateCheckUtc==now&&reload.Current.NotifiedUpdateVersion=="2.0.2","Check time, notified version and opt-out survive a real preference reload.");
        }finally{if(Directory.Exists(directory))Directory.Delete(directory,true);}
        Console.WriteLine($"Automatic update startup checks: {checks} passed; injected replies, no network or system notifications.");
    }
}
