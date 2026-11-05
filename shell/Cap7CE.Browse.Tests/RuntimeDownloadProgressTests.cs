using System.Net;
using System.Security.Cryptography;
using System.Text;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Services;

internal static class RuntimeDownloadProgressTests
{
    public static async Task RunAsync()
    {
        static void Require(bool value,string reason){if(!value)throw new Exception(reason);}
        var bytes=new byte[655360];
        var policy=CoreRuntimePolicy.Load() with{Sha512=Convert.ToHexString(SHA512.HashData(bytes))};
        foreach(var known in new[]{true,false}) {
            var installed=false;var progress=new List<CoreRuntimeProgress>();
            using var client=new HttpClient(new Handler(bytes,known));
            var installer=new CoreRuntimeInstaller(policy,()=>installed,client,(_,_)=>{
                Require(progress[^1].Stage==CoreRuntimeStage.Installing,"installation status must precede launching Microsoft setup");
                installed=true;return Task.FromResult(0);
            });
            Require(await installer.EnsureAsync(progress:progress.Add)==CoreRuntimeResult.Ready,"fixture install completes");
            Require(progress[0].Stage==CoreRuntimeStage.Checking,"detect before downloading");
            var percentages=progress.Where(p=>p.Stage==CoreRuntimeStage.Downloading&&p.Percent.HasValue).Select(p=>p.Percent!.Value).ToArray();
            Require(known?percentages.SequenceEqual(Enumerable.Range(0,11).Select(n=>n*10)):percentages.Length==0,
                "emit each real ten-percent milestone once; unknown length cannot invent percentages");
            Require(progress.FindIndex(p=>p.Stage==CoreRuntimeStage.Verifying)<progress.FindIndex(p=>p.Stage==CoreRuntimeStage.Installing),"verify before asking for installation");
            progress.Clear();Require(await installer.EnsureAsync(progress:progress.Add)==CoreRuntimeResult.Ready,"installed runtime remains ready");
            Require(progress is [{Stage:CoreRuntimeStage.Checking}],"already-installed runtime must skip download/install messages");
        }
        var catalog=new LanguageCatalog(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets/languages.json")));
        foreach(var language in LanguageCatalog.Languages) {
            using var bytesOut=new MemoryStream();
            using(var text=new StreamWriter(bytesOut,Encoding.Unicode,1024,leaveOpen:true)) {
                var sink=new InstallerSearchProgress(catalog,language,text);
                sink.Report(new(CoreRuntimeStage.Downloading,40));sink.Report(new(CoreRuntimeStage.Configuring));
                Require(bytesOut.Length>0,"each progress line must flush before process exit");
            }
            Require(bytesOut.ToArray().Take(2).SequenceEqual(new byte[]{255,254}),"NSIS output has a UTF-16LE signature");
            var output=Encoding.Unicode.GetString(bytesOut.ToArray());
            Require(output.Contains(language=="zh-CN"?"正在下载 .NET 运行时：40%":"Downloading .NET runtime: 40%"),"installer language and percentage must reach the text pipe");
        }
        new InstallerSearchProgress(catalog,"en-US",new BrokenWriter()).Report(new(CoreRuntimeStage.Downloading,0));
        Console.WriteLine("Runtime download progress passed: ten-percent milestones, unknown size, existing runtime, stage order, bilingual UTF-16LE flush and closed output pipe. Fixtures only.");
    }
    private sealed class Handler(byte[] bytes,bool known):HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token)
            =>Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK){Content=known?new ByteArrayContent(bytes):new StreamContent(new NonSeekable(bytes))});
    }
    private sealed class NonSeekable(byte[] bytes):MemoryStream(bytes){public override bool CanSeek=>false;}
    private sealed class BrokenWriter:TextWriter
    {
        public override Encoding Encoding=>Encoding.Unicode;
        public override void WriteLine(string? value)=>throw new IOException("fixture closed pipe");
    }
}
