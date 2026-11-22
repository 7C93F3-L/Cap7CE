namespace Cap7CE.WinUI.DesktopActions;

// Pure click arbitration. The window owns input capture, the one-shot timer and actions.
internal sealed class CapsuleClickGesture
{
    private bool pending,second;
    private long downAt,deadline;
    private int x,y;
    private uint interval;
    public void Press(long now,int screenX,int screenY,uint doubleClickTime,int doubleClickWidth,int doubleClickHeight)
    {
        second=pending&&now>=downAt&&now<=deadline
            &&Math.Abs((long)screenX-x)*2<=doubleClickWidth&&Math.Abs((long)screenY-y)*2<=doubleClickHeight;
        pending=false;downAt=now;x=screenX;y=screenY;interval=Math.Clamp(doubleClickTime,1u,300u);
    }
    // True means the second click completed without becoming a drag.
    public bool Release()
    {
        if(second){Cancel();return true;}
        pending=true;deadline=downAt+interval;return false;
    }
    public long Remaining(long now)=>pending?Math.Max(1,deadline-now):0;
    public bool TakeMenu(long now)
    {
        if(!pending||now<deadline)return false;
        Cancel();return true;
    }
    public void Cancel(){pending=false;second=false;}
}
