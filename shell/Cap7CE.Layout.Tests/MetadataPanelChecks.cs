using System.Text.Json;
using Cap7CE.WinUI.Models;

internal static class MetadataPanelChecks
{
    public static void Run()
    {
        void Require(bool value,string message){if(!value)throw new Exception(message);}
        MetadataPanelState State(string phase,int pending=0,bool policy=false)=>MetadataPanelState.Read(JsonSerializer.SerializeToElement(new{
            progress=new{phase,processed=0,discovered=0,total=(long?)null,failed=0,unsupported=0},
            directoryTask=pending>0?new{path="E:\\assets",pending}:null,
            policy=policy?new{includes=new[]{new{volumeId="v"}}}:null
        }));
        var idle=State("idle");Require(!idle.CanPause&&!idle.CanResume&&!idle.CanCancel&&!idle.ShowProgress&&!idle.ShowCounts,"Idle offers no task controls or empty progress");
        foreach(var phase in new[]{"preparing","discovering","waiting","extracting"}) {
            var running=State(phase,2);Require(running.CanPause&&!running.CanResume&&running.CanCancel&&running.ShowProgress&&running.ControlText=="暂停","Running phases offer pause and cancellation");
        }
        var paused=State("paused",1);Require(!paused.CanPause&&paused.CanResume&&paused.CanCancel&&paused.ControlText=="继续","Paused directory can resume or cancel");
        var global=State("paused",policy:true);Require(global.CanResume&&!global.CanCancel,"Paused global policy can resume but cannot cancel a nonexistent directory queue");
        var emptyPause=State("paused");Require(!emptyPause.CanResume&&!emptyPause.CanCancel&&!emptyPause.ShowProgress&&emptyPause.Title.Contains("暂无"),"Empty paused owner is not a resumable task");
        var pausing=State("pausing",1);Require(!pausing.CanPause&&!pausing.CanResume,"Pausing cannot issue another pause or resume");
        var failed=State("failed",1);Require(failed.CanResume&&failed.CanCancel&&failed.ControlText=="重试","Failed directory queue supports explicit retry");
        var globalFailed=State("failed",policy:true);Require(!globalFailed.CanResume&&!globalFailed.CanCancel,"Failed global owner cannot call the paused-only resume operation");
        var completed=State("completed");Require(!completed.CanPause&&!completed.CanResume&&!completed.CanCancel&&!completed.ShowProgress,"Completed state disables controls and animation");
        Require(!idle.ShowTaskArea&&!emptyPause.ShowTaskArea&&!completed.ShowTaskArea,"No-task states collapse the entire task area");
        Require(paused.ShowTaskArea&&failed.ShowTaskArea&&pausing.ShowTaskArea&&globalFailed.ShowTaskArea,"Paused, failed and active work keep task management visible");
        Require(MetadataPanelState.DescribeError("metadata-directory-unavailable").Contains("索引"),"Unavailable directory explains the prerequisite");
        Console.WriteLine("Metadata panel checks passed: idle, active phases, paused directory/global policy, empty pause, failure retry and completion.");
    }
}
