using System.Runtime.InteropServices;
using Cap7CE.WinUI.Localization;
namespace Cap7CE.WinUI.DesktopActions;
// Owns keyboard injection and confirmation of native half-screen snapping only.
internal sealed class NativeSnapInput(int x,int y,int width,int height) : INativeSnapDriver
{
    public async Task SnapAsync(nint window,SnapSide side,CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if(!IsWindow(window))throw new UiFailure("ui.desktop.windowTimeout");
        if(!IsPlaced(window,side)){
            ShowWindowAsync(window,9);
            for(var i=0;i<30&&(IsIconic(window)||IsZoomed(window));i++)await Task.Delay(50,token);
            token.ThrowIfCancellationRequested();
            if(IsIconic(window)||IsZoomed(window))throw new UiFailure("ui.desktop.arrangeFailed");
            // Start from a restored window on the selected monitor, so repeated trials do not cycle monitors.
            if(!GetWindowRect(window,out var bounds))throw new UiFailure("ui.desktop.arrangeFailed");
            var w=Math.Min(Math.Max(300,bounds.Right-bounds.Left),width-40);var h=Math.Min(Math.Max(210,bounds.Bottom-bounds.Top),height-40);
            if(!SetWindowPos(window,0,x+20,y+20,w,h,0x4014))throw new UiFailure("ui.desktop.arrangeFailed");
            await Task.Delay(120,token);
        }
        SetForegroundWindow(window);
        for(var i=0;i<30&&GetForegroundWindow()!=window;i++)await Task.Delay(50,token);
        token.ThrowIfCancellationRequested();
        if(GetForegroundWindow()!=window)throw new UiFailure("ui.desktop.snapFocus");
        if(IsPlaced(window,side))return;
        for(var i=0;i<20&&HasHeldKeys();i++)await Task.Delay(50,token);
        token.ThrowIfCancellationRequested();
        if(HasHeldKeys()||GetForegroundWindow()!=window)throw new UiFailure("ui.desktop.snapFocus");
        var events=Shortcut(side);
        var sent=SendInput((uint)events.Length,events,Marshal.SizeOf<Input>());
        if(sent!=events.Length){
            if(sent>0){var release=events.Where(e=>e.Data.Keyboard.Flags==2).ToArray();SendInput((uint)release.Length,release,Marshal.SizeOf<Input>());}
            throw new UiFailure("ui.desktop.snapInput");
        }
        for(var i=0;i<40;i++){await Task.Delay(50,token);if(IsPlaced(window,side))return;}
        throw new UiFailure("ui.desktop.snapUnconfirmed");
    }
    public bool IsPlaced(nint window,SnapSide side)
    {
        if(!IsWindow(window)||!IsWindowArranged(window)||!GetWindowRect(window,out var r))return false;
        return MatchesHalf(side,r.Left,r.Top,r.Right,r.Bottom);
    }
    internal bool MatchesHalf(SnapSide side,int left,int top,int right,int bottom)
    {
        var vertical=side is SnapSide.Top or SnapSide.Bottom;
        var second=side is SnapSide.Right or SnapSide.Bottom;
        var l=x+(!vertical&&second?width/2:0);var t=y+(vertical&&second?height/2:0);
        var r=x+(!vertical&&!second?width/2:width);var b=y+(vertical&&!second?height/2:height);
        return Math.Abs(left-l)<=24&&Math.Abs(right-r)<=24&&Math.Abs(top-t)<=24&&Math.Abs(bottom-b)<=24;
    }
    internal static Input[] Shortcut(SnapSide side)
    {
        var arrow=(ushort)(side switch{SnapSide.Left=>0x25,SnapSide.Right=>0x27,SnapSide.Top=>0x26,SnapSide.Bottom=>0x28,_=>throw new ArgumentOutOfRangeException(nameof(side))});
        return side is SnapSide.Top or SnapSide.Bottom
            ?[Key(0x5b,false),Key(0x12,false),Key(arrow,false),Key(arrow,true),Key(0x12,true),Key(0x5b,true)]
            :[Key(0x5b,false),Key(arrow,false),Key(arrow,true),Key(0x5b,true)];
    }
    private static bool HasHeldKeys()=>new[]{0x01,0x02,0x10,0x11,0x12,0x5b,0x5c}.Any(key=>(GetAsyncKeyState(key)&0x8000)!=0);
    internal static Input Key(ushort code,bool up)=>new(){Type=1,Data=new(){Keyboard=new(){Code=code,Flags=up?2u:0u}}};
    [StructLayout(LayoutKind.Sequential)] internal struct Input {public uint Type;public InputUnion Data;}
    [StructLayout(LayoutKind.Explicit,Size=32)] internal struct InputUnion {[FieldOffset(0)] public KeyboardInput Keyboard;}
    [StructLayout(LayoutKind.Sequential)] internal struct KeyboardInput {public ushort Code,Scan;public uint Flags,Time;public nuint Extra;}
    [StructLayout(LayoutKind.Sequential)] private struct Rect {public int Left,Top,Right,Bottom;}
    [DllImport("user32.dll")] private static extern bool IsWindow(nint handle);
    [DllImport("user32.dll")] private static extern bool IsWindowArranged(nint handle);
    [DllImport("user32.dll")] private static extern bool IsIconic(nint handle);
    [DllImport("user32.dll")] private static extern bool IsZoomed(nint handle);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(nint handle,out Rect bounds);
    [DllImport("user32.dll")] private static extern bool ShowWindowAsync(nint handle,int command);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint handle);
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll",SetLastError=true)] private static extern bool SetWindowPos(nint handle,nint after,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll",SetLastError=true)] private static extern uint SendInput(uint count,Input[] input,int size);
}
