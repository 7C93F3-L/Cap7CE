using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Localization;

namespace Cap7CE.WinUI.Commands;
internal sealed class QuickCommandInput : IDisposable
{
    private readonly WorkspaceToolbar toolbar;
    private readonly WorkspaceNotice notices;
    private readonly QuickCommandActions actions;
    private readonly CommandConfirmation confirmation=new();
    private bool busy,disposed;
    public QuickCommandInput(WorkspaceToolbar toolbar,WorkspaceNotice notices,QuickCommandActions actions)
    {
        this.toolbar=toolbar;this.notices=notices;this.actions=actions;
        toolbar.CommandSubmitted=Submit;toolbar.CommandCancelled+=Cancel;notices.ConfirmationCancelled+=Cancel;
    }
    private bool Submit(string raw)
    {
        if(disposed)return false;if(busy)return true;
        if(confirmation.Pending is not null){
            if(raw.Trim().Equals("n",StringComparison.OrdinalIgnoreCase)){Cancel();return true;}
            var accepted=confirmation.Answer(raw);
            if(accepted is null){Prompt();return true;}
            notices.SetCommandConfirmation(null);Run(accepted);return true;
        }
        if(!QuickCommandParser.IsCandidate(raw.Trim()))return false;
        var command=QuickCommandParser.Parse(raw);
        if(command is null){notices.ShowMessage(UiMessage.Key("ui.command.invalid"));return true;}
        if(command.Confirm){
            try{confirmation.Begin(actions.Prepare(command));toolbar.CommandInput("");Prompt();}
            catch(Exception error){notices.ShowMessage(FailureText.From(error));}
        }
        else Run(command);
        return true;
    }
    private void Prompt()
    {
        if(confirmation.Pending is not {} command)return;
        var key=command.Id switch {
            "app:quit"=>"ui.command.confirmQuit",
            "dir:remove"=>"ui.command.confirmRemove",
            "llama:stop"=>"ui.command.confirmStop",
            "cache:clear"=>"ui.command.confirmCache",
            _=>throw new InvalidOperationException("command-confirmation-unavailable")
        };
        var action=UiMessage.Key(key,command.Id=="dir:remove"?new Dictionary<string,object?>{{"name",command.Args[0]}}:null);
        notices.SetCommandConfirmation(UiMessage.Key("ui.command.confirm",new Dictionary<string,object?>{{"action",action}}));
    }
    private async void Run(QuickCommand command)
    {
        busy=true;toolbar.CommandInput("",true);notices.SetCommandConfirmation(UiMessage.Key("common.loading"),false);
        try{await actions.ExecuteAsync(command);if(!disposed)notices.ShowMessage(UiMessage.Key("ui.command.done"));}
        catch(Exception error){if(!disposed)notices.ShowMessage(FailureText.From(error));}
        finally{busy=false;if(!disposed){notices.SetCommandConfirmation(null);toolbar.CommandInput(null);}}
    }
    private void Cancel()
    {
        if(confirmation.Pending is null)return;confirmation.Cancel();notices.SetCommandConfirmation(null);toolbar.CommandInput(null);
        if(!disposed)notices.ShowMessage(UiMessage.Key("ui.command.cancelled"));
    }
    public void Dispose(){disposed=true;Cancel();toolbar.CommandSubmitted=null;toolbar.CommandCancelled-=Cancel;notices.ConfirmationCancelled-=Cancel;}
}
