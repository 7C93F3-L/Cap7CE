using System.Net;
using System.Text.Json;

namespace Cap7CE.WinUI.Models;

internal static class FontPreviewDocument
{
    public const string ChineseSample="学而时习之不亦说乎";
    public const string FontUri="https://cap7ce-text.invalid/font";
    public static string Render(JsonElement metadata,byte[] font,bool dark)
    {
        var title=WebUtility.HtmlEncode(metadata.GetProperty("familyName").GetString());
        var italic=(metadata.GetProperty("styleName").GetString()??"").Contains("italic",StringComparison.OrdinalIgnoreCase)?"italic":"normal";
        var weight=Math.Clamp(metadata.GetProperty("weight").GetInt32(),1,1000);
        var chinese=FontCharacterCoverage.Supports(font,ChineseSample)?$"<p class='chinese'>{ChineseSample}</p>":"";
        var color=dark?"#e7e7e7":"#222";
        return "<!doctype html><html><head><meta charset='utf-8'><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; font-src https://cap7ce-text.invalid/font; style-src 'unsafe-inline'; base-uri 'none'\"><style>"+
            $"@font-face{{font-family:Cap7CEPreviewFont;src:url('{FontUri}');font-weight:{weight};font-style:{italic};font-display:block}}"+
            $"html{{background:transparent;color:{color};color-scheme:{(dark?"dark":"light")}}}"+
            "body{margin:0;padding:36px;min-height:calc(100vh - 72px);box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;max-width:1000px;margin-inline:auto}h1{font:600 22px/1.4 'Segoe UI','Microsoft YaHei',sans-serif;margin:0 0 36px;overflow-wrap:anywhere}"+
            $"main{{font-family:Cap7CEPreviewFont;font-style:{italic};font-weight:{weight};font-size:clamp(24px,4.5vw,42px);line-height:1.7;overflow-wrap:anywhere;visibility:hidden}}"+
            "p{margin:0 0 18px}.chinese{margin-top:30px;padding-top:24px;border-top:1px solid #8884;font-size:clamp(28px,5vw,46px)}</style></head><body><h1>"+title+"</h1><main><p>abcdefghijklmnopqrstuvwxyz</p><p>ABCDEFGHIJKLMNOPQRSTUVWXYZ</p><p>0123456789</p><p>"+
            WebUtility.HtmlEncode(".,;: ' \" (!?) +-*/= @#$%& _<>[]{} \\|~^")+"</p>"+chinese+"</main></body></html>";
    }
}
