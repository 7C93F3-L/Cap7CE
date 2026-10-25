using System.Security.Cryptography;

namespace Cap7CE.WinUI.Models;

internal static class SettingsOriginAsset
{
    public static byte[] Decode(string encoded)
    {
        if(encoded.Length>8*1024*1024)throw new InvalidDataException("Origin fragment is too large.");
        var payload=Convert.FromBase64String(encoded.Trim());
        if(payload.Length<=28)throw new InvalidDataException("Origin fragment is incomplete.");
        byte[] key=[0x8f,0x3a,0x1c,0x7d,0x5e,0x29,0xb6,0x40,0xd2,0xa4,0x7f,0x11,0x9b,0xc8,0x65,0x30,
            0xe7,0x1d,0x4a,0x9f,0x26,0x0b,0x5c,0x83,0xf8,0xd1,0x42,0x6e,0xa9,0x50,0x3b,0x7c];
        using var aes=new AesGcm(key,16);var image=new byte[payload.Length-28];
        aes.Decrypt(payload.AsSpan(0,12),payload.AsSpan(12,image.Length),payload.AsSpan(payload.Length-16),image);
        if(!image.AsSpan().StartsWith(new byte[]{137,80,78,71,13,10,26,10}))throw new InvalidDataException("Origin fragment is not a PNG.");
        return image;
    }
}
