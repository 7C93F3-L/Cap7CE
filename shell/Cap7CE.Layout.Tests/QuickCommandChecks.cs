using System.Text.Json;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Commands;
using Cap7CE.WinUI.Controls;

internal static class QuickCommandChecks
{
    public static async Task RunAsync()
    {
        var count=0;void Check(bool value,string message){count++;if(!value)throw new Exception(message);}
        using var catalog=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets/settings-help.json")));
        foreach(var group in catalog.RootElement.EnumerateArray())foreach(var entry in group.GetProperty("items").EnumerateArray()){
            var raw=entry.GetProperty("command").GetString()!.Replace("#RRGGBB","#112233");
            Check(QuickCommandParser.IsCandidate(raw)&&QuickCommandParser.Parse(raw) is not null,"Documented command must parse: "+raw);
        }
        foreach(var raw in new[]{"key:global on","cmd:on","ui:acrylic","dir:rename old new","dir:refresh","line:on","ui:main #bad","app:quit extra","see:sort junk","dir:add \"unfinished"})
            Check(QuickCommandParser.Parse(raw) is null,"Reject retired or malformed input: "+raw);
        foreach(var raw in new[]{"photos","http://example.org","C:\\photos","notes:today"})Check(!QuickCommandParser.IsCandidate(raw),"Ordinary searches and paths cannot execute: "+raw);
        var path=QuickCommandParser.Parse("dir:add \"C:\\My Photos\"");Check(path?.Args.Single()=="C:\\My Photos","Quoted Windows paths must retain spaces and backslashes.");
        var toolbar=new WorkspaceToolbar();var notice=new WorkspaceNotice();var actions=new QuickCommandActions();
        using var input=new QuickCommandInput(toolbar,notice,actions);
        var language=new Cap7CE.WinUI.Localization.LanguageSession(new Cap7CE.WinUI.Localization.LanguageCatalog(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets/languages.json"))));
        foreach(var (raw,zh,en) in new[]{("app:quit","退出 Cap7CE","Exit Cap7CE"),("cache:clear","保留源文件","Source files"),("llama:stop","停止本地 AI 服务","Stop the local AI service"),("dir:remove \"Photos\"","不会删除磁盘目录","will not be deleted")}){
            toolbar.Submit(raw);
            language.Select("zh-CN","zh-CN");Check(notice.Confirmation!.Render(language).Contains(zh),"Chinese confirmation must explain the action: "+raw);
            language.Select("en-US","en-US");Check(notice.Confirmation!.Render(language).Contains(en),"English confirmation must explain the action: "+raw);
            toolbar.Cancel();
        }
        Check(toolbar.Submit("flowers")==false&&actions.Executed.Count==0,"Plain search must pass through.");
        Check(toolbar.Submit("cache:clear")&&actions.Executed.Count==0&&notice.Confirmation is not null,"Confirmation cannot execute early.");
        toolbar.Submit("maybe");Check(actions.Executed.Count==0&&notice.Confirmation is not null,"Invalid answer keeps confirmation pending.");
        toolbar.Submit("n");Check(actions.Executed.Count==0&&notice.Confirmation is null,"No cancels without side effects.");
        toolbar.Submit("app:quit");toolbar.Cancel();Check(actions.Executed.Count==0&&notice.Confirmation is null,"Escape/navigation cancels pending work.");
        toolbar.Submit("cache:clear");notice.Close();Check(actions.Executed.Count==0&&notice.Confirmation is null,"Closing the strip cancels pending work.");
        var completion=new TaskCompletionSource();actions.Work=()=>completion.Task;
        toolbar.Submit("cache:clear");toolbar.Submit("Y");toolbar.Submit("y");Check(actions.Executed.Count==1&&toolbar.Busy,"Repeated Enter must not execute twice.");
        completion.SetResult();for(var i=0;i<100&&toolbar.Busy;i++)await Task.Delay(1);
        Check(!toolbar.Busy&&notice.Confirmation is null,"Completion restores input and clears the confirmation.");
        toolbar.Submit("app:quit");input.Dispose();Check(notice.Confirmation is null&&actions.Executed.Count==1,"Dispose cancels a pending confirmation without execution.");
        Check(toolbar.CommandSubmitted is null,"Dispose must detach the input hook.");
        Console.WriteLine($"Quick command catalog, parser and real input-controller lifecycle: {count} checks passed (fixture UI/actions; no user data).");
    }
}
namespace Cap7CE.WinUI.Controls
{
    internal sealed class WorkspaceToolbar
    {
        public Func<string,bool>? CommandSubmitted {get;set;}public event Action? CommandCancelled;public bool Busy;
        public bool Submit(string text)=>CommandSubmitted?.Invoke(text)==true;public void Cancel()=>CommandCancelled?.Invoke();
        public void CommandInput(string? text,bool busy=false)=>Busy=busy;
    }
    internal sealed class WorkspaceNotice
    {
        public event Action? ConfirmationCancelled;public Cap7CE.WinUI.Localization.UiMessage? Confirmation;
        public void SetCommandConfirmation(Cap7CE.WinUI.Localization.UiMessage? text,bool cancellable=true)=>Confirmation=text;
        public void ShowMessage(Cap7CE.WinUI.Localization.UiMessage text){}
        public void Close()=>ConfirmationCancelled?.Invoke();
    }
}
namespace Cap7CE.WinUI.Commands
{
    internal sealed class QuickCommandActions
    {
        public List<QuickCommand> Executed=[];public Func<Task> Work=()=>Task.CompletedTask;
        public QuickCommand Prepare(QuickCommand command)=>command;
        public Task ExecuteAsync(QuickCommand command){Executed.Add(command);return Work();}
    }
}
