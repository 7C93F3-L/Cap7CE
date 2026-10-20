using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace Cap7CE.WinUI.Models;

internal static class FormatRegistry
{
	public static readonly (string Id, string Label)[] Categories = new (string, string)[12]
	{
		("visual", "图像"),
		("video", "视频"),
		("audio", "音频"),
		("document", "文档"),
		("text", "文本"),
		("project", "工程"),
		("threeD", "三维"),
		("archive", "压缩包"),
		("data", "数据"),
		("font", "字体"),
		("model", "模型"),
		("other", "其他")
	};

	public static IReadOnlyList<FileFormat> Formats { get; } = JsonSerializer.Deserialize<FileFormat[]>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Assets/formats.json")), new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? Array.Empty<FileFormat>();

	public static FileFormat? Find(string extension)
	{
		return Formats.FirstOrDefault((FileFormat f) => f.Extension.Equals(extension, StringComparison.OrdinalIgnoreCase));
	}

	public static string[] Extensions(string category)
	{
		return (from f in Formats
			where f.CanSearch && ((f.Extension == ".pdf") ? "document" : f.Category) == category
			select f.Extension).ToArray();
	}

	public static int ExtractorVersion(string kind)
	{
		string[] ids = new string[9] { "image-dimensions", "video", "audio", "font", "model", "document", "three-d", "text-data", "archive" };
		using JsonDocument jsonDocument = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Assets/extractors.json")));
		return jsonDocument.RootElement.GetProperty("specifications").EnumerateArray().First((JsonElement s) => s.GetProperty("kind").GetInt32() == Array.IndexOf(ids, kind))
			.GetProperty("extractorVersion")
			.GetInt32();
	}
}
