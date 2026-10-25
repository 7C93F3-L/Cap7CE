using System.Security.Cryptography;
using Cap7CE.WinUI.Models;

internal static class SettingsOriginChecks
{
    public static async Task RunAsync()
    {
        var encoded=await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory,"Assets/phase7.dat"));
        var image=SettingsOriginAsset.Decode(encoded);
        if(image.Length<24||!image.AsSpan(12,4).SequenceEqual("IHDR"u8))throw new Exception("The original Electron payload must decode into a PNG in memory");
        var corrupted=Convert.FromBase64String(encoded.Trim());corrupted[20]^=1;
        try{SettingsOriginAsset.Decode(Convert.ToBase64String(corrupted));throw new Exception("Expected authentication rejection");}catch(CryptographicException){}
        try{SettingsOriginAsset.Decode("AAAA");throw new Exception("Expected truncated payload rejection");}catch(InvalidDataException){}
        Console.WriteLine("Settings origin checks passed: legacy payload compatibility, PNG content, authentication and truncated payload rejection.");
    }
}
