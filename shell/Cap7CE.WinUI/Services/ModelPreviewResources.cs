using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

// Read-only display snapshots. File handles never survive a completed resource read.
internal sealed class ModelPreviewResources : IDisposable
{
    private readonly AssetItem item;
    private readonly long sourceLength,sourceModified;
    private readonly CancellationTokenSource stopping;
    private readonly SemaphoreSlim reads=new(2);
    private long bytes;
    private int requests;
    private bool disposed;
    public string SourceUri=>ModelPreviewPolicy.SourceUri(item.FullPath);
    public string Extension=>Path.GetExtension(item.FullPath).ToLowerInvariant();
    public ModelPreviewResources(AssetItem item,CancellationToken token)
    {
        FileAccessGuard.Validate(item);
        if(!ModelPreviewPolicy.Supports(Path.GetExtension(item.FullPath)))throw new UiFailure("ui.preview.modelFailed");
        this.item=item;var source=new FileInfo(item.FullPath);
        if(source.Length>ModelPreviewPolicy.MaximumFileBytes)throw new UiFailure("ui.preview.modelTooLarge");
        sourceLength=source.Length;sourceModified=source.LastWriteTimeUtc.Ticks;
        stopping=CancellationTokenSource.CreateLinkedTokenSource(token);
    }
    public async Task<byte[]> ReadAsync(string uri)
    {
        if(disposed)throw new OperationCanceledException();
        var token=stopping.Token;
        if(Interlocked.Increment(ref requests)>ModelPreviewPolicy.MaximumRequests)throw new UiFailure("ui.preview.modelResources");
        var path=ModelPreviewPolicy.Resolve(item.FullPath,uri);
        await reads.WaitAsync(token);
        try {
            return await Task.Run(async()=>{
                token.ThrowIfCancellationRequested();FileAccessGuard.Validate(item);FileAccessGuard.RejectLinks(path);
                var source=new FileInfo(item.FullPath);
                if(source.Length!=sourceLength||source.LastWriteTimeUtc.Ticks!=sourceModified)throw new UiFailure("ui.error.sourceRefresh");
                await using var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete,65536,FileOptions.Asynchronous|FileOptions.SequentialScan);
                var length=stream.Length;
                if(length>ModelPreviewPolicy.MaximumFileBytes||Interlocked.Add(ref bytes,length)>ModelPreviewPolicy.MaximumTotalBytes)
                    throw new UiFailure("ui.preview.modelResources");
                var result=new byte[checked((int)length)];await stream.ReadExactlyAsync(result,token);
                if(stream.Length!=length)throw new UiFailure("ui.error.sourceRefresh");
                token.ThrowIfCancellationRequested();return result;
            },token);
        } finally {reads.Release();}
    }
    public void Dispose(){if(disposed)return;disposed=true;stopping.Cancel();stopping.Dispose();}
}
