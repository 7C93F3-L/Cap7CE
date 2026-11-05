await ModelPreviewChecks.RunAsync();

namespace Cap7CE.WinUI.Models
{
    internal sealed record AssetItem(Cap7CE.Core.Protocol.BasicSearchItem Entry,string FullPath);
}
