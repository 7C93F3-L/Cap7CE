namespace Cap7CE.WinUI.DesktopActions;
internal enum SnapSide { Left, Right, Top, Bottom }
// Testable sequence only; no Windows input or mutable application state here.
internal interface INativeSnapDriver
{
    Task SnapAsync(nint window,SnapSide side,CancellationToken token);
    bool IsPlaced(nint window,SnapSide side);
}
internal static class NativeSnapSequence
{
    public static SnapSide Opposite(SnapSide side)=>side switch{
        SnapSide.Left=>SnapSide.Right,SnapSide.Right=>SnapSide.Left,SnapSide.Top=>SnapSide.Bottom,SnapSide.Bottom=>SnapSide.Top,
        _=>throw new ArgumentOutOfRangeException(nameof(side))};
    public static async Task PairAsync(INativeSnapDriver driver,nint main,nint application,SnapSide mainSide,CancellationToken token)
    {
        if(main==0||application==0||main==application)throw new ArgumentException("Two distinct windows are required.");
        _=Opposite(mainSide);token.ThrowIfCancellationRequested();await driver.SnapAsync(main,mainSide,token);
        token.ThrowIfCancellationRequested();await driver.SnapAsync(application,Opposite(mainSide),token);
        token.ThrowIfCancellationRequested();
        if(!driver.IsPlaced(main,mainSide)||!driver.IsPlaced(application,Opposite(mainSide)))throw new InvalidOperationException("Native snap pair was not retained.");
    }
}
