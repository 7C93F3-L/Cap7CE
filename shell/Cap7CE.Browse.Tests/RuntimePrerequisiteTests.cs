using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using Cap7CE.WinUI.Services;

internal static class RuntimePrerequisiteTests
{
    public static async Task RunAsync()
    {
        static void Require(bool condition,string message){if(!condition)throw new Exception(message);}
        var policy=CoreRuntimePolicy.Load();
        Require(policy.MinimumVersion=="10.0.12"&&policy.Arguments.SequenceEqual(new[]{"/install","/norestart"}),"shared foreground runtime policy");
        Require(policy.Matches(["10.0.12"])&&policy.Matches(["10.0.13"]),"supported runtime patches");
        Require(!policy.Matches(["9.0.99","10.0.11","11.0.0"]),"different major runtime cannot satisfy .NET 10");
        var bytes="runtime installer fixture"u8.ToArray();
        var fixture=policy with{Sha512=Convert.ToHexString(SHA512.HashData(bytes))};
        foreach(var scenario in new[]{"present","ready","reboot","undetected","cancelled","digest","http","oversize","truncated"}) {
            var installed=scenario=="present";var downloads=0;var launches=0;string? path=null;
            using var client=new HttpClient(new Handler(request=>{
                downloads++;Require(request.RequestUri?.ToString()==policy.InstallerUrl,"only the embedded installer URL is requested");
                var response=new HttpResponseMessage(scenario=="http"?HttpStatusCode.ServiceUnavailable:HttpStatusCode.OK){Content=new ByteArrayContent(bytes)};
                if(scenario=="oversize")response.Content.Headers.ContentLength=CoreRuntimeInstaller.MaximumBytes+1;
                if(scenario=="truncated")response.Content.Headers.ContentLength=bytes.Length+1;
                return response;
            }));
            var input=scenario=="digest"?fixture with{Sha512=new string('0',128)}:fixture;
            var owner=new CoreRuntimeInstaller(input,()=>installed,client,(file,args)=>{
                launches++;path=file;
                Require(File.ReadAllBytes(file).SequenceEqual(bytes),"only the verified installer is launched");
                Require(args.SequenceEqual(new[]{"/install","/norestart"}),"no silent install or automatic restart");
                var blocked=false;
                try{using var writer=File.Open(file,FileMode.Open,FileAccess.Write,FileShare.ReadWrite);}
                catch(IOException){blocked=true;}
                Require(blocked,"verified installer must remain protected against replacement while launched");
                if(scenario=="ready")installed=true;
                return Task.FromResult(scenario=="reboot"?3010:scenario=="cancelled"?1602:0);
            });
            var result=await owner.EnsureAsync();
            var expected=scenario is "present" or "ready"?CoreRuntimeResult.Ready:
                scenario is "reboot" or "undetected"?CoreRuntimeResult.RestartRequired:CoreRuntimeResult.Failed;
            Require(result==expected,"runtime result: "+scenario);
            Require(downloads==(scenario=="present"?0:1),"present runtime must not download");
            Require(launches==(scenario is "ready" or "reboot" or "undetected" or "cancelled"?1:0),"invalid downloads must never launch");
            if(path is not null)Require(!Directory.Exists(Path.GetDirectoryName(path)),"temporary installer must be removed");
        }
        Console.WriteLine("Runtime prerequisite regression passed: detection, bounded download, digest, foreground install, cancellation, restart and cleanup. Fixtures only.");
    }
    private sealed class Handler(Func<HttpRequestMessage,HttpResponseMessage> respond):HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token)=>Task.FromResult(respond(request));
    }
}
