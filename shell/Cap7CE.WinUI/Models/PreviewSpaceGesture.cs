namespace Cap7CE.WinUI.Models;

// The opening stroke belongs to this preview only; timestamps use the Win32 input clock.
internal sealed class PreviewSpaceGesture
{
    public const uint HoldMilliseconds=350;
    private uint? pressedAt;
    public bool Opening=>pressedAt.HasValue;
    public void Begin(uint? time)=>pressedAt=time;
    public void Cancel()=>pressedAt=null;
    public int Action(uint message,nuint key,nint flags,uint time,bool previewTarget,bool openingTarget,bool removed)
    {
        if(!removed||key!=0x20||(!previewTarget&&!(Opening&&openingTarget)))return 0;
        if(message is 0x101 or 0x105) {
            var start=pressedAt;Cancel();
            return start is {} down&&unchecked(time-down)>=HoldMilliseconds?2:1;
        }
        var action=PreviewSpaceKeyPolicy.Action(message,key,flags,true,true);
        if(action==2)Cancel();
        return action;
    }
}
