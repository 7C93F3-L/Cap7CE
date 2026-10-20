using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Controllers;
using Cap7CE.WinUI.Models;
using System.Runtime.CompilerServices;

namespace Cap7CE.WinUI.Services;
internal sealed class FilterAvailabilityService(ShellServices services,Action<FilterAvailability> publish) : IDisposable
{
    private readonly FilterAvailabilityController controller=new(publish);
    public bool IsCurrent(FilterAvailability state)=>controller.IsCurrent(state);
    public void Update(BrowseSession session,bool force=false)
    {
        var filter=session.Filter;var domain=FilterPresets.Domain(filter);var extensions=FilterPresets.QueryExtensions(filter);
        var kinds=AdvancedFilterRules.Groups.Where(g=>AdvancedFilterRules.Available(g,filter)).Select(g=>g.Kind).ToList();
        if(domain is "image-dimensions" or "video" or "audio")kinds.Insert(0,domain);
        var requested=kinds.Distinct().ToArray();var core=services.Core;var path=session.PathValue;
        var volumes=services.Volumes.Where(v=>v.Queryable).Select(v=>v.VolumeId).ToArray();var hidden=session.ShowHidden;
        var key=$"{(core is null?0:RuntimeHelpers.GetHashCode(core))}|{path}|{hidden}|{string.Join(',',extensions.Order())}";
        Task<CoreSearchScopeRequest?>? scope=null;
        controller.Update(key,requested,async(kind,colors,token)=>{
            if(core is null||volumes.Length==0)throw new IOException("Core 尚未就绪");
            scope??=Resolve();var resolved=await scope;
            var facts=new CoreSearchFactFilter(kind,FormatRegistry.ExtractorVersion(kind),VisualGroups:colors?[new CoreSearchVisualGroup([[new("brightnessMean","<=",10000)]])]:null);
            var page=await core.RequestAsync<SearchPageResponse>(CoreOperations.SearchStart,
                new SearchStartRequest("",1,"name-ascending",resolved is null?volumes:[resolved.VolumeId!],resolved,EntryType:"file",Facts:facts,FileConditions:new(extensions),ExcludeHidden:!hidden),token);
            return page.Items.Count>0;
            async Task<CoreSearchScopeRequest?> Resolve()
            {
                if(path.Length==0)return null;
                var value=await core.RequestAsync<CatalogResolveScopeResponse>(CoreOperations.CatalogResolveScope,new CatalogResolveScopeRequest(path),token);
                if(!value.Resolved||!value.Queryable||value.VolumeId is null||value.DirectoryFileReference is null)throw new IOException("目录不可查询");
                return new("directory-descendants",value.VolumeId,value.DirectoryFileReference);
            }
        },force);
    }
    public void Dispose()=>controller.Dispose();
}
