using System.Text.Json;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;

internal static class EdgeCollapseChecks
{
    public static async Task RunAsync()
    {
        var checks=0;
        void Require(bool condition,string message){checks++;if(!condition)throw new Exception(message);}
        var screen=new EdgeScreen(new(0,0,3440,1440),new(0,0,3440,1392));
        var inset=new EdgeInsets(7,0,7,7);var screens=new[]{screen.Bounds};
        foreach(var overflow in new[]{0,1,16,17,100,300}){
            var left=new EdgeRect(-7-overflow,180,643-overflow,980);
            Require(EdgeCollapseGeometry.Detect(left,inset,screen,screens)==DockEdge.Left,"Left overshoot must not be rejected by an absolute-distance limit.");
            var right=new EdgeRect(2797+overflow,180,3447+overflow,980);
            Require(EdgeCollapseGeometry.Detect(right,inset,screen,screens)==DockEdge.Right,"Right overshoot must accept more than 16 DIP.");
            foreach(var pair in new[]{(left,DockEdge.Left),(right,DockEdge.Right)}){
                var aligned=EdgeCollapseGeometry.Align(pair.Item1,inset,screen,pair.Item2);
                var visible=EdgeCollapseGeometry.Visible(aligned,inset);
                Require(pair.Item2==DockEdge.Left?visible.Left==0:visible.Right==3440,"Align the visible frame, not the invisible sizing border.");
                Require(aligned.Width==650&&aligned.Height==800,"Ordinary alignment must preserve grid dimensions.");
                var hidden=EdgeCollapseGeometry.Visible(EdgeCollapseGeometry.Collapse(aligned,inset,screen.Bounds,pair.Item2),inset);
                Require(pair.Item2==DockEdge.Left?hidden.Right==3:hidden.Left==3437,"Both sides must leave three visible pixels.");
            }
        }
        Require(EdgeCollapseGeometry.Detect(new(20,100,670,900),inset,screen,screens) is null,"A window fully inside the screen must not dock.");
        var corner=new EdgeRect(-107,-50,543,750);
        Require(EdgeCollapseGeometry.Detect(corner,inset,screen,screens)==DockEdge.Left,"At corners choose the largest visible overflow.");
        var top=EdgeCollapseGeometry.Align(new(400,-100,1050,700),inset,screen,DockEdge.Top);
        Require(EdgeCollapseGeometry.Visible(top,inset).Top==0,"Top visible frame alignment must match side alignment.");
        Require(EdgeCollapseGeometry.Visible(EdgeCollapseGeometry.Collapse(top,inset,screen.Bounds,DockEdge.Top),inset).Bottom==3,"Top collapse must leave the same visible thickness.");
        var leftTaskbar=screen with{Work=new(48,0,3440,1440)};
        Require(EdgeCollapseGeometry.Detect(new(-100,100,550,900),inset,leftTaskbar,screens) is null,"Do not claim the taskbar's occupied edge.");
        var neighbor=new EdgeRect(3440,0,5360,1080);
        Require(EdgeCollapseGeometry.Detect(new(3000,100,3650,900),inset,screen,[screen.Bounds,neighbor]) is null,"Do not auto-hide into another monitor across an overlapping seam.");
        Require(EdgeCollapseGeometry.Detect(new(3000,1100,3650,1350),inset,screen,[screen.Bounds,neighbor])==DockEdge.Right,"An exposed section of an edge is still eligible.");
        var negative=new EdgeScreen(new(-1920,-200,0,880),new(-1920,-200,0,840));
        var alignedNegative=EdgeCollapseGeometry.Align(new(-2050,0,-1400,800),inset,negative,DockEdge.Left);
        Require(EdgeCollapseGeometry.Visible(alignedNegative,inset).Left==-1920,"Negative monitor coordinates must remain signed.");
        var clamped=EdgeCollapseGeometry.Visible(EdgeCollapseGeometry.Clamp(new(-8000,-8000,-7350,-7200),inset,screen.Work),inset);
        Require(clamped.Left>=0&&clamped.Top>=0&&clamped.Right<=3440&&clamped.Bottom<=1392,"Recovery must return the visible window inside the work area.");
        var directory=Path.Combine(Path.GetTempPath(),"cap7ce-edge-"+Guid.NewGuid().ToString("N"));
        var originalLanguage=Cap7CE.WinUI.Localization.AppLanguage.Session.Current;
        try{
            var file=Path.Combine(directory,"preferences.json");var store=new PreferenceStore(file,null);await store.LoadAsync();
            Require(!store.Current.EdgeCollapseEnabled,"New installations default to the standard window.");
            await Task.WhenAll(store.UpdateAsync(value=>value with{EdgeCollapseEnabled=true}),store.UpdateAsync(value=>value with{Color1="#123456"}));
            var restored=new PreferenceStore(file,null);await restored.LoadAsync();
            Require(restored.Current.EdgeCollapseEnabled&&restored.Current.Color1=="#123456","Window-mode saves must preserve concurrent preferences and survive reload.");
            using var saved=JsonDocument.Parse(await File.ReadAllTextAsync(file));Require(saved.RootElement.GetProperty("edgeCollapseEnabled").GetBoolean(),"Persist the actual mode selection.");
            await restored.UpdateAsync(value=>value with{EdgeCollapseEnabled=false});
            var standard=new PreferenceStore(file,null);await standard.LoadAsync();Require(!standard.Current.EdgeCollapseEnabled,"Turning the mode off must persist.");
        }finally{
            if(Directory.Exists(directory))Directory.Delete(directory,true);
            Cap7CE.WinUI.Localization.AppLanguage.Apply(originalLanguage);
        }
        Console.WriteLine($"Edge-collapse geometry and preferences: {checks} checks passed.");
    }
}
