using System.ComponentModel;
using System.Runtime.InteropServices;
using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI.Services;

// Thread-local filter: preview HWNDs, plus the opener during the opening Space stroke.
// Filtering before dispatch also covers native media controls and WebView2 input HWNDs.
internal sealed class PreviewSpaceKey : IDisposable
{
    private readonly nint window;
    private readonly nint openerWindow;
    private readonly Window owner;
    private readonly PreviewSpaceGesture gesture=new();
    private readonly Hook callback;
    private nint hook;
    private bool closing;
    public PreviewSpaceKey(Window owner,Window opener,Action close,Action<int> navigate)
    {
        this.owner=owner;
        window=WinRT.Interop.WindowNative.GetWindowHandle(owner);
        openerWindow=WinRT.Interop.WindowNative.GetWindowHandle(opener);
        callback=(code,remove,pointer)=>{
            if(code>=0&&pointer!=0) {
                var message=Marshal.PtrToStructure<Message>(pointer);
                var action=gesture.Action(message.Id,message.Key,message.Flags,message.Time,
                    message.Key==0x20&&Owns(message.Window),gesture.Opening&&Owns(message.Window,openerWindow),remove==1);
                var navigation=PreviewSpaceKeyPolicy.NavigationAction(message.Id,message.Key,
                    message.Key is 0x25 or 0x27&&Owns(message.Window),remove==1,
                    (GetKeyState(0x10)&0x8000)!=0||(GetKeyState(0x11)&0x8000)!=0||(GetKeyState(0x12)&0x8000)!=0);
                if(action!=0||navigation!=0) {
                    message.Id=0;message.Key=0;message.Flags=0;Marshal.StructureToPtr(message,pointer,false);
                    if(action==2&&!closing){closing=true;owner.DispatcherQueue.TryEnqueue(()=>close());}
                    else if(navigation>=2&&!closing)owner.DispatcherQueue.TryEnqueue(()=>{if(!closing)navigate(navigation==2?-1:1);});
                }
            }
            return CallNextHookEx(hook,code,remove,pointer);
        };
        hook=SetWindowsHookExW(3,callback,0,GetCurrentThreadId());
        if(hook==0)throw new Win32Exception(Marshal.GetLastWin32Error());
        owner.Activated+=Activated;
    }
    public static uint OpeningTime()=>unchecked((uint)GetMessageTime());
    public void BeginOpen(uint? time)=>gesture.Begin(time);
    private void Activated(object sender,WindowActivatedEventArgs args)
    {if(args.WindowActivationState==WindowActivationState.Deactivated)gesture.Cancel();}
    private bool Owns(nint target,nint scope=0)
    {
        if(scope==0)scope=window;
        var root=GetAncestor(target,2);
        for(var i=0;root!=0&&i<8;i++,root=GetWindow(root,4))if(root==scope)return true;
        return false;
    }
    public void Dispose(){owner.Activated-=Activated;gesture.Cancel();if(hook==0)return;UnhookWindowsHookEx(hook);hook=0;}
    private delegate nint Hook(int code,nuint remove,nint message);
    [StructLayout(LayoutKind.Sequential)] private struct Message
    {public nint Window;public uint Id;public nuint Key;public nint Flags;public uint Time;public int X,Y;public uint Private;}
    [DllImport("user32.dll",SetLastError=true)] private static extern nint SetWindowsHookExW(int type,Hook callback,nint module,uint thread);
    [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] private static extern bool UnhookWindowsHookEx(nint hook);
    [DllImport("user32.dll")] private static extern nint CallNextHookEx(nint hook,int code,nuint remove,nint message);
    [DllImport("user32.dll")] private static extern nint GetAncestor(nint window,uint flags);
    [DllImport("user32.dll")] private static extern nint GetWindow(nint window,uint command);
    [DllImport("user32.dll")] private static extern short GetKeyState(int key);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern int GetMessageTime();
}
