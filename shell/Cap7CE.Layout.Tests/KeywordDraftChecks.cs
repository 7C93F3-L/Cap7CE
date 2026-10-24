using Cap7CE.WinUI.Models;

internal static class KeywordDraftChecks
{
    public static void Run()
    {
        void Require(bool value,string message){if(!value)throw new Exception(message);}
        var source=new[]{"粉色短袖","浅色牛仔裤","长发"};var draft=new KeywordDraft();draft.Reset(source);
        Require(!draft.Dirty&&draft.Words.SequenceEqual(source),"Loaded tags form a clean draft");
        draft.Remove("浅色牛仔裤");
        Require(draft.Dirty&&source.Length==3&&draft.SaveWords().SequenceEqual(["粉色短袖","长发"]),"Deleting a tag changes only the local draft");
        draft.Input="室内， 时尚, 长发， ,\nBLUE,blue";
        Require(draft.SaveWords().SequenceEqual(["粉色短袖","长发","室内","时尚","BLUE"]),"Save splits either comma and pasted lines, trims and deduplicates");
        draft.Cancel();Require(!draft.Dirty&&draft.Input==""&&draft.Words.SequenceEqual(source),"Cancel restores original tags and removes pending text");
        draft.Input="键入内容";draft.Clear();
        Require(draft.Dirty&&draft.Input==""&&draft.SaveWords().Length==0,"Clear stages removal of all tags and input, without an empty-string keyword");
        draft.Cancel();draft.Reset(["另一个文件"]);
        Require(!draft.Dirty&&draft.SaveWords().SequenceEqual(["另一个文件"]),"Switching files cannot carry over the previous draft");
        draft.Input="   ";Require(!draft.Dirty,"Whitespace alone does not create a change");
        draft.Reset([]);draft.Input="输入";draft.Clear();Require(!draft.Dirty,"Clearing unsaved input on an empty file restores clean state");
        foreach(var invalid in new[]{new string('a',257),"a\0b",string.Join(',',Enumerable.Range(0,129))}) {
            draft.Reset([]);draft.Input=invalid;
            try{draft.SaveWords();throw new Exception("Keyword limit accepted");}catch(IOException){}
            Require(draft.Dirty,"Validation failure preserves the draft");
        }
        Console.WriteLine("Keyword draft checks passed (delete/clear/cancel, comma parsing, deduplication, file reset and validation).");
    }
}
