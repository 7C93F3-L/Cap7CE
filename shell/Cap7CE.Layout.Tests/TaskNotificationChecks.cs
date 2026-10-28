using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Localization;

internal static class TaskNotificationChecks
{
    public static void Run()
    {
        var clock=TimeSpan.Zero;var messages=new List<UiMessage>();var observed=false;var checks=0;
        var notices=new TaskNotifications(messages.Add,()=>clock){IsObserved=_=>observed};
        void Check(bool condition,string message){checks++;if(!condition)throw new Exception(message);}
        void Begin(string id)=>notices.Begin("ai",id);
        Begin("fast");clock+=TimeSpan.FromSeconds(9);notices.Finish("ai","fast","completed",3);
        Check(messages.Count==0,"Short successful tasks should stay in the app.");
        Begin("long");notices.Begin("ai","long");clock+=TimeSpan.FromSeconds(10);notices.Finish("ai","long","completed",10,0,2);
        notices.Finish("ai","long","completed",10);Check(messages.Count==1,"Boundary-duration completion must send exactly once.");
        var language=new LanguageSession(new LanguageCatalog(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets/languages.json"))));
        var chinese=messages[0].Render(language);language.Select("en-US","en-US");var english=messages[0].Render(language);
        Check(chinese.Contains("10")&&english.Contains("10")&&chinese!=english,"Summary must preserve count snapshots and render in the current UI language.");
        observed=true;Begin("visible");clock+=TimeSpan.FromSeconds(30);notices.Finish("ai","visible","completed",4);
        observed=false;notices.Finish("ai","visible","completed",4);Check(messages.Count==1,"Foreground suppression must consume the terminal event, not queue a stale toast.");
        Begin("failed");notices.Finish("ai","failed","failed",2,1);Check(messages.Count==2,"Background whole-task failure should not wait for duration threshold.");
        Begin("partial");notices.Finish("ai","partial","completed",3,1,1);Check(messages.Count==3,"Partial failures need one summary even in a short background batch.");
        Begin("cancelled");clock+=TimeSpan.FromSeconds(30);notices.Finish("ai","cancelled","cancelled",7);Check(messages.Count==3,"User cancellation should not notify.");
        Begin("paused");notices.Forget("ai","paused");notices.Finish("ai","paused","completed",1);Check(messages.Count==3,"Pausing or abandoning a task must discard its notification session.");
        notices.Begin("index","job");clock+=TimeSpan.FromSeconds(20);
        notices.IndexStatus([("job","queued")]);Check(messages.Count==3,"Queued is not a terminal task state.");
        notices.IndexStatus([("job","completed"),("historic","failed")]);
        notices.IndexStatus([("job","completed")]);Check(messages.Count==4,"Index snapshots must deliver accepted tasks once without a settings page, ignoring historic jobs.");
        notices.Begin("index","stale");notices.ForgetKind("index");notices.IndexStatus([("stale","failed")]);
        Check(messages.Count==4,"Reconnect must not report stale Core task outcomes.");
        Begin("close");notices.Clear();notices.Finish("ai","close","failed",0);Check(messages.Count==4,"App shutdown must discard pending notices.");
        Console.WriteLine($"Task notification summary policy: {checks} checks passed.");
    }
}
