using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using Windows.Graphics.Imaging;
using Windows.Media.Editing;
using Windows.Storage;
using FileAttributes = System.IO.FileAttributes;

if (args.Length != 2 || args[0] != "--parent-pid" || !int.TryParse(args[1], out var parentId) || parentId <= 0) return 2;
Process parent;
try { parent = Process.GetProcessById(parentId); } catch { return 2; }
_ = Task.Run(async () => { try { await parent.WaitForExitAsync(); } finally { Environment.Exit(0); } });
using var input = Console.OpenStandardInput();
var requestBytes = new List<byte>();
var readBuffer = new byte[4096];
var jobs = 0;
while (jobs < 16)
{
    var count = await input.ReadAsync(readBuffer);
    if (count == 0) return 0;
    for (var offset = 0; offset < count; offset++)
    {
        if (readBuffer[offset] != 10)
        {
            if (requestBytes.Count == 256 * 1024) return 2;
            requestBytes.Add(readBuffer[offset]); continue;
        }
        FrameRequest? request;
        try { request = JsonSerializer.Deserialize(requestBytes.ToArray(), MediaJsonContext.Default.FrameRequest); }
        catch { return 2; }
        requestBytes.Clear();
        if (request is null || request.Id <= 0 || request.FilePath is not { Length: >= 4 and <= 32768 } sourcePath
            || !char.IsAsciiLetter(sourcePath[0]) || sourcePath[1] != ':' || sourcePath[2] != '\\'
            || sourcePath.IndexOfAny(['\0', '\r', '\n']) >= 0) return 2;
        var result = await Inspect(request);
        Console.WriteLine(JsonSerializer.Serialize(result, MediaJsonContext.Default.FrameResponse));
        jobs++;
        // Recycle between requests; never keep unbounded native decoder state.
        if (jobs == 16 || result.ResidentBytes > 192 * 1024 * 1024) return 0;
    }
}
return 0;

static async Task<FrameResponse> Inspect(FrameRequest request)
{
    using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(9));
    try
    {
        var attributes = File.GetAttributes(request.FilePath);
        if ((attributes & (FileAttributes.Directory | FileAttributes.ReparsePoint | FileAttributes.Offline)) != 0
            || ((int)attributes & 0x440000) != 0)
            return Failed(request.Id);
        var file = await StorageFile.GetFileFromPathAsync(request.FilePath).AsTask(deadline.Token);
        var clip = await MediaClip.CreateFromFileAsync(file).AsTask(deadline.Token);
        var encoding = clip.GetVideoEncodingProperties();
        if (encoding.Width is < 1 or > 65535 || encoding.Height is < 1 or > 65535 || clip.OriginalDuration.Ticks <= 0)
            return Failed(request.Id);
        var composition = new MediaComposition(); composition.Clips.Add(clip);
        var frames = new List<VideoFrame>();
        foreach (var fraction in new[] { 0.1, 0.5, 0.9 })
        {
            using var image = await composition.GetThumbnailAsync(TimeSpan.FromTicks((long)(clip.OriginalDuration.Ticks * fraction)),
                encoding.Width >= encoding.Height ? 160 : 0, encoding.Width >= encoding.Height ? 0 : 160,
                VideoFramePrecision.NearestFrame).AsTask(deadline.Token);
            var decoder = await BitmapDecoder.CreateAsync(image).AsTask(deadline.Token);
            if (decoder.PixelWidth is < 1 or > 160 || decoder.PixelHeight is < 1 or > 160) return Failed(request.Id);
            var data = await decoder.GetPixelDataAsync(BitmapPixelFormat.Rgba8, BitmapAlphaMode.Straight, new BitmapTransform(),
                ExifOrientationMode.IgnoreExifOrientation, ColorManagementMode.DoNotColorManage).AsTask(deadline.Token);
            var pixels = data.DetachPixelData();
            if (pixels.Length != decoder.PixelWidth * decoder.PixelHeight * 4) return Failed(request.Id);
            frames.Add(new((int)decoder.PixelWidth, (int)decoder.PixelHeight, Convert.ToBase64String(pixels)));
        }
        composition.Clips.Clear();
        return new(request.Id, "indexed", (int)encoding.Width, (int)encoding.Height,
            (long)Math.Round(clip.OriginalDuration.TotalMilliseconds), frames.ToArray(), Process.GetCurrentProcess().WorkingSet64);
    }
    catch { return Failed(request.Id); }
}
static FrameResponse Failed(int id) => new(id, "unavailable", 0, 0, 0, [], Process.GetCurrentProcess().WorkingSet64);

internal sealed record FrameRequest(int Id, string FilePath);
internal sealed record VideoFrame(int Width, int Height, string Rgba);
internal sealed record FrameResponse(int Id, string State, int Width, int Height, long DurationMilliseconds,
    VideoFrame[] Frames, long ResidentBytes);
[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, MaxDepth = 4,
    UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow)]
[JsonSerializable(typeof(FrameRequest))]
[JsonSerializable(typeof(FrameResponse))]
internal partial class MediaJsonContext : JsonSerializerContext;
