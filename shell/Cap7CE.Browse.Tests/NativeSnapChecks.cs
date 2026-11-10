using System.Runtime.InteropServices;
using Cap7CE.WinUI.DesktopActions;
internal static class NativeSnapChecks
{
    private sealed class Driver : INativeSnapDriver
    {
        public readonly List<(nint Window,SnapSide Side)> Calls=[];
        public bool Confirm=true,FailFirst;
        public CancellationTokenSource? CancelAfterFirst;
        public Task SnapAsync(nint window,SnapSide side,CancellationToken token){
            Calls.Add((window,side));if(FailFirst)throw new IOException("Fixture input rejected");
            if(Calls.Count==1)CancelAfterFirst?.Cancel();return Task.CompletedTask;
        }
        public bool IsPlaced(nint window,SnapSide side)=>Confirm&&Calls.Contains((window,side));
    }
    public static async Task RunAsync()
    {
        void Check(bool value,string message){if(!value)throw new Exception(message);}
        var left=new Driver();await NativeSnapSequence.PairAsync(left,1,2,SnapSide.Left,default);
        Check(left.Calls.SequenceEqual(new[]{((nint)1,SnapSide.Left),((nint)2,SnapSide.Right)}),"Cap7CE left must place the selected app on the right");
        var right=new Driver();await NativeSnapSequence.PairAsync(right,1,2,SnapSide.Right,default);
        Check(right.Calls.SequenceEqual(new[]{((nint)1,SnapSide.Right),((nint)2,SnapSide.Left)}),"Cap7CE right must reverse both targets");
        foreach(var side in new[]{SnapSide.Top,SnapSide.Bottom}){
            var driver=new Driver();await NativeSnapSequence.PairAsync(driver,1,2,side,default);
            Check(driver.Calls.SequenceEqual(new[]{((nint)1,side),((nint)2,NativeSnapSequence.Opposite(side))}),"Vertical halves must pair in opposite directions");
        }
        var geometry=new NativeSnapInput(-1920,40,1920,1040);
        Check(geometry.MatchesHalf(SnapSide.Top,-1920,40,0,560)&&geometry.MatchesHalf(SnapSide.Bottom,-1920,560,0,1080),"Vertical placement must use the monitor working area, including negative origins");
        Check(!geometry.MatchesHalf(SnapSide.Top,-1920,40,-960,1080),"Left half must not pass top-half confirmation");
        foreach(var side in Enum.GetValues<SnapSide>()){
            var events=NativeSnapInput.Shortcut(side);var downKeys=events.Where(e=>e.Data.Keyboard.Flags==0).Select(e=>e.Data.Keyboard.Code).ToArray();
            var upKeys=events.Where(e=>e.Data.Keyboard.Flags==2).Select(e=>e.Data.Keyboard.Code).ToArray();
            Check(downKeys.Reverse().SequenceEqual(upKeys),"Injected keys must be released in reverse order");
            Check(downKeys.Contains((ushort)0x12)==(side is SnapSide.Top or SnapSide.Bottom),"Only vertical snapping must include Alt");
            var expected=(ushort)(side switch{SnapSide.Left=>0x25,SnapSide.Right=>0x27,SnapSide.Top=>0x26,_=>0x28});
            Check(downKeys.Last()==expected,"Each snap direction must use the matching arrow");
        }
        using var cancel=new CancellationTokenSource();var interrupted=new Driver{CancelAfterFirst=cancel};
        try{await NativeSnapSequence.PairAsync(interrupted,1,2,SnapSide.Left,cancel.Token);throw new Exception("Expected cancellation");}catch(OperationCanceledException){}
        Check(interrupted.Calls.Count==1,"Cancellation must prevent sending keys to the second app");
        var failed=new Driver{FailFirst=true};try{await NativeSnapSequence.PairAsync(failed,1,2,SnapSide.Left,default);throw new Exception("Expected input failure");}catch(IOException){}
        Check(failed.Calls.Count==1,"Input failure must stop the pair");
        var unconfirmed=new Driver{Confirm=false};try{await NativeSnapSequence.PairAsync(unconfirmed,1,2,SnapSide.Left,default);throw new Exception("Expected verification failure");}catch(InvalidOperationException){}
        try{await NativeSnapSequence.PairAsync(new Driver(),1,1,SnapSide.Left,default);throw new Exception("Expected invalid pair");}catch(ArgumentException){}
        Check(Marshal.SizeOf<NativeSnapInput.Input>()==40,"SendInput ABI must match x64 INPUT size");
        var down=NativeSnapInput.Key(0x5b,false);var up=NativeSnapInput.Key(0x5b,true);
        Check(down.Type==1&&down.Data.Keyboard.Code==0x5b&&down.Data.Keyboard.Flags==0&&up.Data.Keyboard.Flags==2,"Native keyboard packets must preserve VK codes and explicit key releases");
        Console.WriteLine("Native snap pairing, cancellation, rejected input, result confirmation and x64 packets passed. No real keyboard input sent.");
    }
}
