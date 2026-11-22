using Cap7CE.WinUI.DesktopActions;

internal static class CapsuleClickChecks
{
    public static void Run()
    {
        void Check(bool value,string message){if(!value)throw new Exception(message);}
        CapsuleClickGesture First(long down=0,uint interval=500)
        {
            var click=new CapsuleClickGesture();click.Press(down,100,100,interval,8,8);
            Check(!click.Release(),"first click waits instead of opening the main window");return click;
        }
        var single=First();
        Check(!single.TakeMenu(299)&&single.TakeMenu(300)&&!single.TakeMenu(301),"single click opens exactly one menu after the capped interval");
        var pair=First();pair.Press(200,103,104,500,8,8);
        Check(!pair.TakeMenu(600)&&pair.Remaining(600)==0,"second press suppresses the first menu even while held beyond its deadline");
        Check(pair.Release()&&!pair.TakeMenu(900),"completed double click opens main without a later menu");
        var drag=First();drag.Press(200,100,100,500,8,8);drag.Cancel();
        Check(drag.Remaining(900)==0&&!drag.TakeMenu(900),"a drag retires pending click actions");
        var late=First();late.Press(301,100,100,500,8,8);
        Check(!late.Release()&&!late.TakeMenu(600)&&late.TakeMenu(601),"clicks outside the capped interval remain single clicks");
        var distant=First();distant.Press(100,105,100,500,8,8);
        Check(!distant.Release()&&distant.TakeMenu(600),"fast clicks outside the double-click rectangle cannot open main");
        var longPress=new CapsuleClickGesture();longPress.Press(0,0,0,500,8,8);
        Check(!longPress.Release()&&longPress.TakeMenu(1200),"long stationary press can open its menu without an extra full interval");
        var configured=First(interval:1200);configured.Press(1100,100,100,1200,8,8);
        Check(!configured.Release()&&!configured.TakeMenu(1399)&&configured.TakeMenu(1400),"longer system intervals are capped at 300 ms for menu responsiveness");
        var faster=First(interval:200);
        Check(!faster.TakeMenu(199)&&faster.TakeMenu(200),"shorter system intervals remain respected");
        var scaled=First();scaled.Press(100,107,107,500,16,16);
        Check(scaled.Release(),"DPI-scaled physical tolerance is respected");
        var cancelled=First();cancelled.Cancel();
        Check(!cancelled.TakeMenu(9999)&&cancelled.Remaining(9999)==0,"cancelled single click cannot open a delayed menu");
        var cancelledPair=First();cancelledPair.Press(100,100,100,500,8,8);cancelledPair.Cancel();
        cancelledPair.Press(200,100,100,500,8,8);
        Check(!cancelledPair.Release(),"cancellation clears the second-click candidate before the next input sequence");
        var race=First();race.Cancel();race.Press(1000,100,100,500,8,8);race.Release();
        Check(!race.TakeMenu(1001)&&race.Remaining(1001)==299&&race.TakeMenu(1300),"late old timer delivery cannot prematurely fire a newer click");
        pair.Press(700,100,100,500,8,8);
        Check(!pair.Release()&&pair.TakeMenu(1000),"a third click starts a fresh sequence after the completed double click");
        Console.WriteLine("Capsule click checks passed: single/double/drag arbitration, system interval/DPI thresholds, cancellation and stale timer delivery.");
    }
}
