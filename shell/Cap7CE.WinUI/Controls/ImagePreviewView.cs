using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Dispatching;

namespace Cap7CE.WinUI.Controls;

internal sealed class ImagePreviewView : Grid
{
    private const int ToolsIdleDelayMs=1500;
    private readonly Image image=new(){Stretch=Stretch.Uniform,HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center};
    private readonly Grid surface=new(){Background=new SolidColorBrush(Microsoft.UI.Colors.Transparent),HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center};
    private readonly ScrollViewer scroll=new(){ZoomMode=ZoomMode.Enabled,MinZoomFactor=0.1f,MaxZoomFactor=8,
        HorizontalScrollBarVisibility=ScrollBarVisibility.Auto,VerticalScrollBarVisibility=ScrollBarVisibility.Auto,
        HorizontalScrollMode=ScrollMode.Enabled,VerticalScrollMode=ScrollMode.Enabled,
        Background=new SolidColorBrush(Microsoft.UI.Colors.Transparent),HorizontalContentAlignment=HorizontalAlignment.Center,VerticalContentAlignment=VerticalAlignment.Center};
    private readonly TextBlock scale=Ui.Text("100%",true);
    private readonly Slider zoomSlider=new(){Minimum=10,Maximum=800,Value=100,StepFrequency=1,Width=110,VerticalAlignment=VerticalAlignment.Center};
    private bool syncingZoom;
    private uint? dragPointer;
    private Windows.Foundation.Point dragStart;
    private double dragX,dragY;
    private double width,height;
    private bool fit=true;
    private readonly Border overlay;
    private readonly DispatcherQueueTimer idle;
    private long lastActivity;
    private Windows.Foundation.Point? lastPointerPosition;
    public Action<int>? WheelAction {get;set;}
    public ImagePreviewView(Action openExternal,FrameworkElement? pageTools=null,Action<int>? wheelAction=null)
    {
        WheelAction=wheelAction;
        Background=new SolidColorBrush(Microsoft.UI.Colors.Transparent);
        surface.Children.Add(image);scroll.Content=surface;Children.Add(scroll);IdleScrollBars.Attach(scroll);
        // Handle image-surface input before it bubbles to ScrollViewer's default scrolling/zooming.
        surface.AddHandler(PointerWheelChangedEvent,new PointerEventHandler((_,e)=>{
            var point=e.GetCurrentPoint(surface).Properties;
            if(e.Handled||e.Pointer.PointerDeviceType!=Microsoft.UI.Input.PointerDeviceType.Mouse
                ||point.IsHorizontalMouseWheel||point.MouseWheelDelta==0)return;
            e.Handled=true;ShowTools();
            if(WheelAction is {} action)action(point.MouseWheelDelta);
            else Zoom(MathF.Pow(1.25f,point.MouseWheelDelta/120f));
        }),true);
        var tools=Ui.Row(scale,L.Tool("\uE71F","ui.preview.zoomOut",()=>Zoom(1/1.25f)),zoomSlider,L.Tool("\uE8A3","ui.preview.zoomIn",()=>Zoom(1.25f)),L.Button("ui.preview.fit",Fit),L.Tool("\uE8A7","ui.preview.openDefault",openExternal));
        tools.Spacing=4;scale.Width=44;scale.VerticalAlignment=VerticalAlignment.Center;
        if(pageTools is not null)tools.Children.Insert(0,pageTools);
        L.Bind(zoomSlider,Microsoft.UI.Xaml.Automation.AutomationProperties.NameProperty,"ui.preview.zoomPercent");
        zoomSlider.ValueChanged+=(_,_)=>{if(!syncingZoom)SetZoom((float)(zoomSlider.Value/100));};
        tools.HorizontalAlignment=HorizontalAlignment.Center;
        overlay=new Border {Child=tools,RequestedTheme=ElementTheme.Dark,
            Background=PreviewNavigationView.SurfaceBrush(),CornerRadius=new(12),Padding=new(8),
            Margin=new(8,0,8,16),HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Bottom};
        Children.Add(overlay);
        idle=DispatcherQueue.CreateTimer();idle.Interval=TimeSpan.FromMilliseconds(100);idle.IsRepeating=true;
        idle.Tick+=(_,_)=>{
            if(Environment.TickCount64-lastActivity<ToolsIdleDelayMs||KeyboardInside()||dragPointer is not null)return;
            overlay.Opacity=0;overlay.IsHitTestVisible=false;idle.Stop();
        };
        AddHandler(PointerMovedEvent,new PointerEventHandler((_,e)=>{
            var point=e.GetCurrentPoint(this).Position;
            if(lastPointerPosition is {} previous&&Math.Abs(previous.X-point.X)<0.1&&Math.Abs(previous.Y-point.Y)<0.1)return;
            lastPointerPosition=point;ShowTools();
        }),true);
        AddHandler(PointerPressedEvent,new PointerEventHandler((_,_)=>ShowTools()),true);
        overlay.GotFocus+=(_,_)=>{if(KeyboardInside())ShowTools();};
        overlay.LostFocus+=(_,_)=>{if(overlay.Opacity>0)idle.Start();};
        Loaded+=(_,_)=>ShowTools();Unloaded+=(_,_)=>{idle.Stop();dragPointer=null;scroll.ReleasePointerCaptures();};
        scroll.SizeChanged+=(_,_)=>{if(fit)Fit();};
        scroll.ViewChanged+=(_,_)=>{
            scale.Text=$"{scroll.ZoomFactor*100:0}%";
            syncingZoom=true;zoomSlider.Value=scroll.ZoomFactor*100;syncingZoom=false;
        };
        surface.PointerPressed+=(_,e)=>{
            var point=e.GetCurrentPoint(scroll);
            if(e.Pointer.PointerDeviceType!=Microsoft.UI.Input.PointerDeviceType.Mouse||!point.Properties.IsLeftButtonPressed
                ||(scroll.ScrollableWidth<=0&&scroll.ScrollableHeight<=0))return;
            if(!scroll.CapturePointer(e.Pointer))return;
            dragPointer=e.Pointer.PointerId;dragStart=point.Position;dragX=scroll.HorizontalOffset;dragY=scroll.VerticalOffset;
            fit=false;e.Handled=true;
        };
        scroll.AddHandler(PointerMovedEvent,new PointerEventHandler((_,e)=>{
            if(dragPointer!=e.Pointer.PointerId)return;
            var point=e.GetCurrentPoint(scroll);
            if(!point.Properties.IsLeftButtonPressed){dragPointer=null;scroll.ReleasePointerCapture(e.Pointer);return;}
            scroll.ChangeView(Math.Clamp(dragX+dragStart.X-point.Position.X,0,scroll.ScrollableWidth),
                Math.Clamp(dragY+dragStart.Y-point.Position.Y,0,scroll.ScrollableHeight),null,true);e.Handled=true;
        }),true);
        scroll.AddHandler(PointerReleasedEvent,new PointerEventHandler((_,e)=>{
            if(dragPointer!=e.Pointer.PointerId)return;dragPointer=null;scroll.ReleasePointerCapture(e.Pointer);e.Handled=true;
        }),true);
        scroll.PointerCaptureLost+=(_,_)=>dragPointer=null;
    }
    private void ShowTools(){lastActivity=Environment.TickCount64;overlay.Opacity=1;overlay.IsHitTestVisible=true;idle.Start();}
    private bool KeyboardInside()
    {
        var focused=XamlRoot is null?null:FocusManager.GetFocusedElement(XamlRoot) as DependencyObject;
        if(focused is not Control {FocusState:FocusState.Keyboard})return false;
        for(var node=focused;node is not null;node=VisualTreeHelper.GetParent(node))if(ReferenceEquals(node,overlay))return true;
        return false;
    }
    public async Task<(double Width,double Height)> LoadAsync(string path,CancellationToken token)
    {
        var bitmap=await CachedBitmapLoader.LoadAsync(image,path,1600,token);
        token.ThrowIfCancellationRequested();SetBitmap(bitmap);
        return (width,height);
    }
    public void SetBitmap(Microsoft.UI.Xaml.Media.Imaging.BitmapImage bitmap)
    {image.Source=bitmap;width=bitmap.PixelWidth;height=bitmap.PixelHeight;Fit();}
    public async Task<(double Width,double Height)> LoadAnimationAsync(AnimationSource source,CancellationToken token)
    {
        var animation=new AnimatedImageView();surface.Children.Clear();surface.Children.Add(animation);
        width=source.Width;height=source.Height;Fit();
        try {await animation.LoadAsync(source,token);token.ThrowIfCancellationRequested();return (width,height);}
        catch {animation.Dispose();throw;}
    }
    private void Fit()
    {
        fit=true;if(width<=0||height<=0||scroll.ActualWidth<=0||scroll.ActualHeight<=0)return;
        var ratio=Math.Min(1,Math.Min(scroll.ActualWidth/width,scroll.ActualHeight/height));
        surface.Width=Math.Max(1,width*ratio);surface.Height=Math.Max(1,height*ratio);
        scroll.ChangeView(0,0,1,true);
    }
    private void Zoom(float factor)
        =>SetZoom(scroll.ZoomFactor*factor);
    private void SetZoom(float value)
    {
        if(width<=0||height<=0)return;
        fit=false;var next=Math.Clamp(value,scroll.MinZoomFactor,scroll.MaxZoomFactor);
        var old=scroll.ZoomFactor;var viewportWidth=scroll.ViewportWidth;var viewportHeight=scroll.ViewportHeight;
        static double Offset(double offset,double viewport,double extent,float oldZoom,float newZoom)
        {
            var center=(offset+viewport/2-Math.Max(0,(viewport-extent*oldZoom)/2))/oldZoom;
            return Math.Clamp(center*newZoom-viewport/2,0,Math.Max(0,extent*newZoom-viewport));
        }
        scroll.ChangeView(Offset(scroll.HorizontalOffset,viewportWidth,surface.Width,old,next),
            Offset(scroll.VerticalOffset,viewportHeight,surface.Height,old,next),next,true);
    }
}
