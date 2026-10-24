using Cap7CE.WinUI.Models;

internal static class CatalogRefreshChecks
{
    public static void Run()
    {
        void Require(bool value,string label){if(!value)throw new Exception(label);}
        CatalogVolumeStamp c=new("c","C:",1,true,"ready"),e=new("e","E:",2,true,"ready");
        var changed=CatalogRefreshRules.Changes([c,e],[c with{Revision=3},e],true);
        Require(changed is not null&&changed.SetEquals(new[]{"C:"}),"only changed volumes are reported");
        Require(!CatalogRefreshRules.Affects("E:\\7C",changed),"C activity cannot refresh E results");
        Require(CatalogRefreshRules.Affects("c:\\work",changed),"volume matching ignores case");
        Require(CatalogRefreshRules.Affects("",changed),"whole-computer search sees volume changes");
        Require(!CatalogRefreshRules.Affects("",new HashSet<string>()),"lifecycle-only notice does not reload a global query");
        Require(CatalogRefreshRules.Changes([e],[e],true) is null,"global metadata or keyword changes are not silently dropped");
        Require(CatalogRefreshRules.Changes([e with{Revision=null}],[e],false) is null,"older Core responses safely refresh affected scopes");
        Require(CatalogRefreshRules.Affects("E:\\7C",CatalogRefreshRules.Changes([e],[],true)),"removed volume affects its old scope");
        Require(CatalogRefreshRules.CanRefresh(true,false,0,false,false),"idle invalidated result can refresh");
        Require(!CatalogRefreshRules.CanRefresh(true,false,1,false,false),"selection defers background refresh");
        Require(!CatalogRefreshRules.CanRefresh(true,false,0,true,false),"preview defers background refresh");
        Require(!CatalogRefreshRules.CanRefresh(true,true,0,false,false),"in-flight request is not restarted");
        Require(!CatalogRefreshRules.CanRefresh(false,false,0,false,false),"clean result is not refreshed");
        Require(!CatalogRefreshRules.CanRefresh(true,false,0,false,true),"minimized window defers refresh");
        var retained=CatalogRefreshRules.RetainSelection(new[]{"E:\\a|1","E:\\deleted|2"},new[]{"e:\\a|1","E:\\a|9","E:\\new|3"},x=>x);
        Require(retained.SequenceEqual(new[]{"e:\\a|1"}),"selection retains only still-existing identities, not replacements or deleted files");
        Console.WriteLine("Catalog refresh checks passed (volume relevance, lifecycle, metadata, interaction deferral, retained identities).");
    }
}
