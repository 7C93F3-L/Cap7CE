using System.Net.Http;
using System.Security.Cryptography;

namespace Cap7CE.WinUI.Services;

internal enum CoreRuntimeResult { Ready,RestartRequired,Failed }

// One owner for the bounded download, verified executable and temporary cleanup.
internal sealed class CoreRuntimeInstaller(CoreRuntimePolicy policy,Func<bool> detect,HttpClient client,
    Func<string,string[],Task<int>> runInstaller,Action<Exception>? diagnostic=null)
{
    internal const long MaximumBytes=128*1024*1024;
    public async Task<CoreRuntimeResult> EnsureAsync(CancellationToken token=default)
    {
        if(detect())return CoreRuntimeResult.Ready;
        var directory=Directory.CreateTempSubdirectory("cap7ce-runtime-").FullName;
        var installer=Path.Combine(directory,"dotnet-runtime-x64.exe");
        try {
            using var timeout=CancellationTokenSource.CreateLinkedTokenSource(token);timeout.CancelAfter(TimeSpan.FromMinutes(2));
            using var response=await client.GetAsync(policy.InstallerUrl,HttpCompletionOption.ResponseHeadersRead,timeout.Token);
            response.EnsureSuccessStatusCode();
            var expected=response.Content.Headers.ContentLength;
            if(expected is <=0 or >MaximumBytes)throw new IOException("runtime-download-size");
            await using(var input=await response.Content.ReadAsStreamAsync(timeout.Token))
            await using(var output=new FileStream(installer,FileMode.CreateNew,FileAccess.Write,FileShare.None,65536,true)) {
                var buffer=new byte[65536];long received=0;int count;
                while((count=await input.ReadAsync(buffer,timeout.Token))!=0) {
                    received+=count;if(received>MaximumBytes||expected is {} size&&received>size)throw new IOException("runtime-download-size");
                    await output.WriteAsync(buffer.AsMemory(0,count),timeout.Token);
                }
                if(received==0||expected is {} total&&received!=total)throw new IOException("runtime-download-incomplete");
                await output.FlushAsync(timeout.Token);
            }
            // Keep a deny-write/delete handle from verification until the installer exits.
            await using var verified=new FileStream(installer,FileMode.Open,FileAccess.Read,FileShare.Read,65536,true);
            var digest=Convert.ToHexString(await SHA512.HashDataAsync(verified,timeout.Token));
            if(!digest.Equals(policy.Sha512,StringComparison.OrdinalIgnoreCase))throw new IOException("runtime-digest-mismatch");
            token.ThrowIfCancellationRequested();
            var exitCode=await runInstaller(installer,policy.Arguments);
            if(exitCode==3010)return CoreRuntimeResult.RestartRequired;
            if(exitCode!=0){diagnostic?.Invoke(new IOException("runtime-installer-exit-"+exitCode));return CoreRuntimeResult.Failed;}
            return detect()?CoreRuntimeResult.Ready:CoreRuntimeResult.RestartRequired;
        }catch(OperationCanceledException) when(token.IsCancellationRequested){throw;}
        catch(Exception error) when(error is IOException or HttpRequestException or OperationCanceledException
            or System.ComponentModel.Win32Exception or UnauthorizedAccessException){diagnostic?.Invoke(error);return CoreRuntimeResult.Failed;}
        finally {
            try{File.Delete(installer);Directory.Delete(directory);}catch(IOException){}catch(UnauthorizedAccessException){}
        }
    }
}
