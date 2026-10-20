using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Media;

namespace Cap7CE.WinUI.Controls;

// Active StableFilterOptionIcon paths; reuse the native vector's theme/selection ink owner.
internal static class FilterIcons
{
    private static readonly Dictionary<string,string> paths=new() {
        ["cad"]="M10 5a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM11 7 5 21M13 7l6 14M7 14a9 9 0 0 0 10 0M12 1v2",
        ["scene"]="m2 15 10-5 10 5-10 6-10-6ZM12 16V3m-3 3 3-3 3 3M6 13l6 3 6-3",
        ["mono"]="M9 4h6v16H9zM12 7h.01M12 11a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
        ["stereo"]="M3 4h6v16H3zM15 4h6v16h-6zM6 7h.01M18 7h.01M6 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM18 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
        ["multichannel"]="M9 3h6v4H9zM2 5h4v6H2zM18 5h4v6h-4zM2 16h4v6H2zM18 16h4v6h-4zM12 11a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
        ["dimensions"]="M4 4h16v16H4zM8 4v3M12 4v2M16 4v3M4 8h3M4 12h2M4 16h3",
        ["program"]="M3 4h18v16H3zM7 9l3 3-3 3M13 15h4",
        ["flat"]="M3 5h18v14H3zM7 9h.01M10 9h7M7 14h.01M10 14h7",
        ["nested"]="M3 3h7l2 3h9v15H3zM7 10v7h3M7 12h3M11 10h6M11 16h6",
        ["static"]="M6 4h12v16H6zM10 8v8M14 8v8",
        ["animated"]="M3 6h18v15H3zM7 3h14M10 10l6 3.5-6 3.5v-7Z",
        ["rigged"]="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM5 8l7 3 7-3M12 7v8m0 0-5 7m5-7 5 7",
        ["竖图"]="M6 2h12v20H6z",["横图"]="M2 6h20v12H2z",["方形"]="M3 3h18v18H3z",["宽图"]="M1 8h22v8H1z",["长图"]="M8 1h8v22H8z",
        ["visual"]="M3 3h18v18H3zM3 16l5-5 5 5 3-3 5 5M16 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z",
        ["video"]="M3 4h18v16H3zM10 8l6 4-6 4V8Z",
        ["audio"]="M9 18V5l11-2v13M9 7l11-2M6 16a3 2 0 1 0 0 4 3 2 0 0 0 0-4ZM17 14a3 2 0 1 0 0 4 3 2 0 0 0 0-4Z",
        ["document"]="M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h8",
        ["text"]="M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h5",
        ["project"]="M2 6h8l2 3h10v12H2V6ZM2 6V3h8l2 3h8v3",
        ["threeD"]="m12 3 9 5v9l-9 5-9-5V8l9-5ZM3 8l9 5 9-5M12 13v9",
        ["archive"]="M4 3h16v18H4zM10 3v3h4v3h-4v3h4v3M10 15h4v4h-4z",
        ["data"]="M3 4h18v16H3zM3 9h18M3 14h18M9 4v16",
        ["font"]="M3 20 10 3l7 17M6 13h8M16 12h6m-3 0v8",
        ["model"]="m12 2 9 5v10l-9 5-9-5V7l9-5ZM7 9l5-3 5 3v6l-5 3-5-3V9ZM12 10v4M10 12h4",
        ["other"]="M6 2h9l5 5v15H6zM15 2v6h5M9 14h.01M13 14h.01M17 14h.01"
    };
    public static SidebarIcon Create(string id) => new() {OutlinePath=paths[id],Width=16,Height=16};
    public static void BindSelection(SidebarIcon icon,ToggleButton owner)
    {
        // Visual-state foreground changes on a presenter are not a reliable notification
        // source for a separately snapshotted Shape brush. Follow the semantic state.
        void Sync()=>icon.InkForeground=owner.IsChecked==true
            ?(Brush)Application.Current.Resources["CapAccentForegroundBrush"]:owner.Foreground;
        owner.Checked+=(_,_)=>Sync();owner.Unchecked+=(_,_)=>Sync();owner.Indeterminate+=(_,_)=>Sync();
        owner.Loaded+=(_,_)=>Sync();
        owner.RegisterPropertyChangedCallback(Control.ForegroundProperty,(_,_)=>Sync());
        owner.ActualThemeChanged+=(_,_)=>{Sync();owner.DispatcherQueue.TryEnqueue(Sync);};
        Sync();
    }
}
