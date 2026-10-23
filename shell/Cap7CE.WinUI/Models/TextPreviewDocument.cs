using AngleSharp.Html.Parser;
using Markdig;

namespace Cap7CE.WinUI.Models;

internal static class TextPreviewDocument
{
    // Adapted from Read7CE.Core/Documents.cs: Markdown pipeline and SafeHtml.Prepare.
    // Preview has no book state, resource routing or reader scripts.
    private static readonly MarkdownPipeline MarkdownPipeline=new MarkdownPipelineBuilder().UseAdvancedExtensions().DisableHtml().Build();
    public static bool CanRender(string extension)=>extension.Equals(".md",StringComparison.OrdinalIgnoreCase);
    public static string Render(string text,string extension,bool dark,int fontSize)
    {
        if(!CanRender(extension))throw new ArgumentException("仅Markdown进行格式渲染。",nameof(extension));
        var html=Markdown.ToHtml(text,MarkdownPipeline);
        var doc=new HtmlParser().ParseDocument(html);
        foreach(var item in doc.QuerySelectorAll("script,iframe,object,embed,base,form,input,button,textarea,meta,link,audio,video,svg,math").ToArray())item.Remove();
        foreach(var item in doc.All)foreach(var attr in item.Attributes.ToArray()) {
            if(attr.Name.StartsWith("on",StringComparison.OrdinalIgnoreCase)||attr.Name is "srcdoc" or "srcset" or "action" or "formaction")item.RemoveAttribute(attr.Name);
            if(attr.Name is "href" or "src" or "xlink:href") {
                // Keep only document anchors; no file/network navigation or resource reads.
                if(attr.Name!="href"||!attr.Value.StartsWith('#'))item.RemoveAttribute(attr.Name);
            }
        }
        var foreground=dark?"#e7e7e7":"#222";
        var css=$"html{{color-scheme:{(dark?"dark":"light")};background:transparent;color:{foreground};font:{Math.Clamp(fontSize,12,28)}px/1.75 'Segoe UI','Microsoft YaHei',sans-serif}}";
        return "<!doctype html><html><head><meta charset='utf-8'><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\"><style>"+css+"body{max-width:960px;margin:0 auto;padding:24px 36px;overflow-wrap:anywhere}pre,code{font-family:Consolas,monospace}pre{padding:12px;background:transparent;overflow:auto;white-space:pre}blockquote{margin-left:0;padding-left:16px;border-left:3px solid #8888}table{border-collapse:collapse;display:block;overflow:auto}th,td{border:1px solid #8886;padding:6px 12px}a{color:inherit}img{display:none}hr{border:0;border-top:1px solid #8886}</style>"+(doc.Head?.InnerHtml??"")+"</head><body>"+(doc.Body?.InnerHtml??"")+"</body></html>";
    }
    public static string BookText(IReadOnlyList<string> chapters)=>chapters.Count==0?"暂无可读正文":string.Join("\n\n",chapters);
}
