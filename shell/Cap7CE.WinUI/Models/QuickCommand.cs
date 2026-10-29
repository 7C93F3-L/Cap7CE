namespace Cap7CE.WinUI.Models;

internal sealed record QuickCommand(string Id,string[] Args,bool Confirm=false,string? TargetId=null);
internal static class QuickCommandParser
{
    private static readonly HashSet<string> Domains=["set","see","win","dir","ui","app","key","cmd","lang","llama","model","cache","line"];
    private static readonly HashSet<string> Empty=["set:","see:root","see:refresh","win:max","win:reset","ui:light","ui:dark","ui:auto","ui:mica","ui:mica-alt","ui:reset","key:reset","lang:auto","lang:cn","lang:en","llama:start","llama:refresh","model:refresh","app:quit","llama:stop","cache:clear"];
    private static readonly HashSet<string> Parameter=["see:dir","dir:add","dir:remove","llama:use","model:use","ui:main","ui:accent"];
    public static bool IsCandidate(string text){var colon=text.IndexOf(':');return colon>=0&&Domains.Contains(text[..colon].ToLowerInvariant());}
    public static QuickCommand? Parse(string text)
    {
        var tokens=new List<string>();var token=new System.Text.StringBuilder();var quoted=false;var started=false;
        foreach(var ch in text.Trim()){
            if(ch=='"'){quoted=!quoted;started=true;}
            else if(char.IsWhiteSpace(ch)&&!quoted){if(started){tokens.Add(token.ToString());token.Clear();started=false;}}
            else{token.Append(ch);started=true;}
        }
        if(quoted)return null;if(started)tokens.Add(token.ToString());if(tokens.Count==0)return null;
        var id=tokens[0].ToLowerInvariant();var args=tokens.Skip(1).ToArray();
        var valid=Empty.Contains(id)&&args.Length==0||Parameter.Contains(id)&&args.Length==1&&args[0].Length>0;
        if(args.Length==1){
            if(id is "see:hidden" or "see:subfolders" or "win:top" or "app:startup" or "app:notify" or "win:edge")valid=args[0].ToLowerInvariant() is "on" or "off";
            if(id=="see:sort")valid=args[0].ToLowerInvariant() is "asc" or "desc" or "name" or "time";
            if(id=="see:view")valid=args[0].ToLowerInvariant() is "square" or "gallery" or "list";
            if(id is "ui:main" or "ui:accent")valid=System.Text.RegularExpressions.Regex.IsMatch(args[0],"^#[0-9a-fA-F]{6}$");
        }
        return valid?new(id,args,id is "dir:remove" or "app:quit" or "llama:stop" or "cache:clear"):null;
    }
}
internal sealed class CommandConfirmation
{
    public QuickCommand? Pending {get;private set;}
    public void Begin(QuickCommand command)=>Pending=command;
    public void Cancel()=>Pending=null;
    public QuickCommand? Answer(string answer){if(!answer.Trim().Equals("y",StringComparison.OrdinalIgnoreCase))return null;var value=Pending;Pending=null;return value;}
}
