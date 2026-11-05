using System.Net.Http;
using System.Security.Cryptography;

namespace Cap7CE.WinUI.Services;

internal enum CoreRuntimeResult { Ready,RestartRequired,Failed }

// One owner for the bounded download, verified executable and temporary cleanup.
internal sealed class CoreRuntimeInstaller(CoreRuntimePolicy policy,Func<bool> detect,HttpClient client,
    Func<string,string[],Task<int>> runInstaller,Action<Exception>? diagnostic=null)
{
    internal const long MaximumBytes=128*1024*1024;
    public async Task<CoreRuntimeResult> EnsureAsync(CancellationToken token=default,Action<CoreRuntimeProgress>? progress=null)
    {
        progress?.Invoke(new(CoreRuntimeStage.Checking));
        if(detect())return CoreRuntimeResult.Ready;
        var directory=Directory.CreateTempSubdirectory("cap7ce-runtime-").FullName;
        var installer=Path.Combine(directory,"dotnet-runtime-x64.exe");
        try {
            progress?.Invoke(new(CoreRuntimeStage.Downloading));
            using var timeout=CancellationTokenSource.CreateLinkedTokenSource(token);timeout.CancelAfter(TimeSpan.FromMinutes(2));
            using var response=await client.GetAsync(policy.InstallerUrl,HttpCompletionOption.ResponseHeadersRead,timeout.Token);
            response.EnsureSuccessStatusCode();
            var expected=response.Content.Headers.ContentLength;
            if(expected is <=0 or >MaximumBytes)throw new IOException("runtime-download-size");
            if(expected.HasValue)progress?.Invoke(new(CoreRuntimeStage.Downloading,0));
            await using(var input=await response.Content.ReadAsStreamAsync(timeout.Token))
            await using(var output=new FileStream(installer,FileMode.CreateNew,FileAccess.Write,FileShare.None,65536,true)) {
                var buffer=new byte[65536];long received=0;int count,reported=0;
                while((count=await input.ReadAsync(buffer,timeout.Token))!=0) {
                    received+=count;if(received>MaximumBytes||expected is {} size&&received>size)throw new IOException("runtime-download-size");
                    await output.WriteAsync(buffer.AsMemory(0,count),timeout.Token);
                    if(expected is {} length) {
                        var percent=Math.Min(90,(int)(received*100/length)/10*10);
                        if(percent>reported){reported=percent;progress?.Invoke(new(CoreRuntimeStage.Downloading,percent));}
                    }
                }
                if(received==0||expected is {} total&&received!=total)throw new IOException("runtime-download-incomplete");
                await output.FlushAsync(timeout.Token);
            }
            if(expected.HasValue)progress?.Invoke(new(CoreRuntimeStage.Downloading,100));
            progress?.Invoke(new(CoreRuntimeStage.Verifying));
            // Keep a deny-write/delete handle from verification until the installer exits.
            await using var verified=new FileStream(installer,FileMode.Open,FileAccess.Read,FileShare.Read,65536,true);
            var digest=Convert.ToHexString(await SHA512.HashDataAsync(verified,timeout.Token));
            if(!digest.Equals(policy.Sha512,StringComparison.OrdinalIgnoreCase))throw new IOException("runtime-digest-mismatch");
            token.ThrowIfCancellationRequested();
            progress?.Invoke(new(CoreRuntimeStage.Installing));
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
