namespace Cap7CE.WinUI.Models;

internal static class PreviewSpaceKeyPolicy
{
    // 0: leave alone, 1: consume, 2: consume and close on a fresh press.
    public static int Action(uint message,nuint key,nint flags,bool previewTarget,bool removed)
    {
        if(!previewTarget||!removed||key!=0x20)return 0;
        if(message is 0x100 or 0x104)return ((long)flags&(1L<<30))==0?2:1;
        return message is 0x101 or 0x105 or 0x102 or 0x106?1:0;
    }
}
