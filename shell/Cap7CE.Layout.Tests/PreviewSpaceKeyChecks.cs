using Cap7CE.WinUI.Models;

internal static class PreviewSpaceKeyChecks
{
    public static void Run()
    {
        void Require(bool value,string message){if(!value)throw new Exception(message);}
        Require(PreviewSpaceKeyPolicy.Action(0x100,0x20,0,true,true)==2,"Fresh preview Space closes before controls receive it");
        Require(PreviewSpaceKeyPolicy.Action(0x104,0x20,0,true,true)==2,"System Space messages use the same close action");
        Require(PreviewSpaceKeyPolicy.Action(0x100,0x20,(nint)(1L<<30),true,true)==1,"Opening press repeats are swallowed without closing newly opened preview");
        foreach(var message in new uint[]{0x101,0x105,0x102,0x106})Require(PreviewSpaceKeyPolicy.Action(message,0x20,0,true,true)==1,"Release and character messages cannot activate controls");
        Require(PreviewSpaceKeyPolicy.Action(0x100,0x20,0,false,true)==0,"Other windows keep Space");
        Require(PreviewSpaceKeyPolicy.Action(0x100,0x20,0,true,false)==0,"Queue peeks cannot close windows");
        Require(PreviewSpaceKeyPolicy.Action(0x100,0x41,0,true,true)==0,"Other keys remain unchanged");
        Require(PreviewSpaceKeyPolicy.NavigationAction(0x100,0x25,true,true,false)==2,"Left navigates before focused controls");
        Require(PreviewSpaceKeyPolicy.NavigationAction(0x100,0x27,true,true,false)==3,"Right navigates before focused controls");
        foreach(var key in new nuint[]{0x25,0x27}) {
            Require(PreviewSpaceKeyPolicy.NavigationAction(0x101,key,true,true,false)==1,"Arrow release is consumed");
            Require(PreviewSpaceKeyPolicy.NavigationAction(0x100,key,false,true,false)==0,"Other windows keep arrows");
            Require(PreviewSpaceKeyPolicy.NavigationAction(0x100,key,true,false,false)==0,"Queue peek cannot navigate");
            Require(PreviewSpaceKeyPolicy.NavigationAction(0x100,key,true,true,true)==0,"Modified arrows stay with controls");
        }
        Require(PreviewSpaceKeyPolicy.NavigationAction(0x100,0x28,true,true,false)==0,"Vertical scrolling stays with controls");
        var gesture=new PreviewSpaceGesture();
        int Release(uint time,bool preview=true,bool opener=false,bool removed=true,uint message=0x101)
            =>gesture.Action(message,0x20,0,time,preview,opener,removed);
        gesture.Begin(1000);
        Require(Release(1349)==1&&!gesture.Opening,"Short opening press preserves the preview");
        Require(gesture.Action(0x100,0x20,0,1500,true,false,true)==2,"A second fresh press still closes a latched preview");
        gesture.Begin(1000);
        Require(gesture.Action(0x100,0x20,(nint)(1L<<30),1350,true,false,true)==1&&gesture.Opening,"Long press repeats must not close early");
        Require(Release(1350)==2&&!gesture.Opening,"Release at the hold threshold closes exactly once");
        Require(Release(1400)==1,"A duplicate release cannot close a new preview");
        gesture.Begin(1000);
        Require(Release(2000,false,true)==2,"Opening key-up queued to the original window closes the held preview");
        gesture.Begin(1000);
        Require(Release(2000,false,false)==0&&gesture.Opening,"Other windows cannot complete the opening stroke");
        Require(Release(2000,true,false,false)==0&&gesture.Opening,"A queue peek cannot complete the opening stroke");
        gesture.Cancel();
        Require(Release(2200)==1,"Focus loss cancels temporary mode without affecting later Space releases");
        gesture.Begin(null);
        Require(Release(2000)==1&&Release(2100,false,true)==0,"Mouse-opened previews ignore the opener release");
        gesture.Begin(uint.MaxValue-100);
        Require(Release(249,message:0x105)==2,"System key-up and wrapping input timestamps retain the threshold");
        gesture.Begin(1000);
        Require(Release(1100)==1,"Delayed file loading must use key-up time, not the processing time");
        gesture.Begin(1000);
        Require(gesture.Action(0x102,0x20,0,1600,true,false,true)==1&&gesture.Opening,"Space character input cannot activate focused controls");
        Console.WriteLine("Preview Space checks passed (fresh/repeat, key-up/character, other windows, queue peeks).");
    }
}
