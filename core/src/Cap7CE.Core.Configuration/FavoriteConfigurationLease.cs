using System.Security.Cryptography;
using System.Text;

namespace Cap7CE.Core.Configuration;

// Held on the caller thread while the host blocks on its async operation. No disk marker.
public sealed class FavoriteConfigurationLease : IDisposable
{
    private readonly Mutex mutex;
    private FavoriteConfigurationLease(Mutex mutex) => this.mutex = mutex;
    public static FavoriteConfigurationLease Acquire(string statePath)
    {
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Path.GetFullPath(statePath).ToUpperInvariant())));
        var mutex = new Mutex(false, "Global\\Cap7CE.Configuration." + key);
        try { if (mutex.WaitOne(0)) return new(mutex); }
        catch (AbandonedMutexException) { return new(mutex); }
        mutex.Dispose(); throw new FavoriteConfigurationException("favorite-directories-storage-busy");
    }
    public void Dispose() { mutex.ReleaseMutex(); mutex.Dispose(); }
}
