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
        Console.WriteLine("Preview Space checks passed (fresh/repeat, key-up/character, other windows, queue peeks).");
    }
}
