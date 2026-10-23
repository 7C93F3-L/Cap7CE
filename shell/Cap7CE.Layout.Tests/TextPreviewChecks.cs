using AngleSharp.Html.Parser;
using Cap7CE.WinUI.Models;

internal static class TextPreviewChecks
{
    public static void Run()
    {
        void Require(bool value,string message){if(!value)throw new Exception(message);}
        var html=TextPreviewDocument.Render("# 标题\n\n**粗体**\n\n- 一\n- 二\n\n```cs\nvar a = 1;\n```\n\n|A|B|\n|-|-|\n|1|2|", ".md",true,16);
        var doc=new HtmlParser().ParseDocument(html);
        Require(doc.QuerySelector("h1")?.TextContent=="标题","Markdown headings");
        Require(doc.QuerySelector("strong")?.TextContent=="粗体"&&doc.QuerySelectorAll("li").Length==2,"Markdown inline and list");
        Require(doc.QuerySelector("pre code") is not null&&doc.QuerySelector("table") is not null,"Markdown code and table");
        html=TextPreviewDocument.Render("<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))\n\n![image](file:///C:/secret.png)\n\n[anchor](#part)",".md",false,99);
        doc=new HtmlParser().ParseDocument(html);
        Require(doc.QuerySelector("script,iframe,form,input,base,link,svg") is null,"Active content removed");
        Require(doc.All.All(e=>e.Attributes.All(a=>!a.Name.StartsWith("on")&&a.Name!="srcset"&&a.Name!="src")),"Unsafe attributes removed");
        Require(doc.QuerySelectorAll("a")[0].GetAttribute("href") is null&&doc.QuerySelectorAll("a")[1].GetAttribute("href")=="#part","Only local document anchors retained");
        Require(html.Contains("default-src 'none'")&&html.Contains("font:28px"),"Resource blocking and font bounds");
        Require(!TextPreviewDocument.CanRender(".html")&&!TextPreviewDocument.CanRender(".js")&&TextPreviewDocument.CanRender(".MD"),"Only Markdown renders as a page");
        Require(html.Contains("background:transparent")&&!html.Contains("background:#"),"Markdown surfaces stay transparent");
        Require(TextPreviewDocument.BookText(["第一章\n内容一","第二章\n内容二"])=="第一章\n内容一\n\n第二章\n内容二","Entire book retains chapter order and text");
        Require(TextPreviewDocument.BookText([])=="暂无可读正文","Empty book");
        Console.WriteLine("Text preview checks passed (Markdown, text-only HTML, transparent surfaces, continuous book text).");
    }
}
