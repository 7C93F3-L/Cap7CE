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
    // 1 consumes release; 2/3 navigate before a focused control can consume arrows.
    public static int NavigationAction(uint message,nuint key,bool previewTarget,bool removed,bool modified)
    {
        if(!previewTarget||!removed||modified||key is not (0x25 or 0x27))return 0;
        if(message==0x100)return key==0x25?2:3;
        return message==0x101?1:0;
    }
}
