using Cap7CE.WinUI.Localization;
using System.Diagnostics;
using System.Text.Json;

namespace Cap7CE.WinUI.Services;

internal sealed record CoreLaunchProfile(ProcessStartInfo Start,string Pipe,bool Product)
{
    public static CoreLaunchProfile Create(string root,string database,bool product,bool interactive)
    {
        var pipe=(product?"cap7ce-core-p35-":"cap7ce-phase-f-")+Guid.NewGuid().ToString("N");
        var executable=Path.Combine(root,product?"core/artifacts/development-product-host/Cap7CE.Core.Host.exe":"shell/artifacts/query/Cap7CE.QueryHost.exe");
        if(!File.Exists(executable))throw new UiFailure("ui.error.coreMissing");
        var info=new ProcessStartInfo(executable) {UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
        foreach(var key in new[]{"NODE_OPTIONS","NODE_PATH","ELECTRON_RUN_AS_NODE"})info.Environment.Remove(key);
        if(product) {
            foreach(var arg in new[]{"--catalog-server","--pipe-name",pipe})info.ArgumentList.Add(arg);
            info.Environment["CAP7CE_METADATA_RUNTIME_ROOT"]=Path.Combine(root,"artifacts/metadata-worker/v1");
            info.Environment["CAP7CE_METADATA_VIDEO_HELPER"]=Path.Combine(root,"native/artifacts/metadata-media/v1/Cap7CE.Media.Metadata.exe");
        } else {
            foreach(var arg in new[]{"--pipe-name",pipe,"--catalog",database})info.ArgumentList.Add(arg);
            if(interactive)info.ArgumentList.Add("--interactive");
        }
        return new(info,pipe,product);
    }
    public bool IsReady(string? text,int pid)
    {
        if(!Product)return text=="ready";
        if(text is null)return false;
        using var json=JsonDocument.Parse(text);var value=json.RootElement;
        return value.GetProperty("status").GetString()=="ready"&&value.GetProperty("processId").GetInt32()==pid
            &&value.GetProperty("protocolVersion").GetInt32()==1&&!value.GetProperty("syntheticFixture").GetBoolean();
    }
}
