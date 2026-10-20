using System;
using System.Linq;
using Cap7CE.Core.Protocol;

namespace Cap7CE.WinUI.Models;

internal sealed record BrowseFilter
{
	public string TimePreset { get; init; } = "all";
	public string Category { get; init; } = "";

	public string[] Extensions { get; init; } = Array.Empty<string>();
	public string[] ThreeDTypes { get; init; } = Array.Empty<string>();

	public long? MinimumBytes { get; init; }

	public long? MaximumBytes { get; init; }

	public DateTimeOffset? After { get; init; }

	public DateTimeOffset? Before { get; init; }

	public CoreSearchFactFilter? Facts { get; init; }

	public int Count => ((Category.Length > 0 || Extensions.Length != 0) ? 1 : 0) + ((MinimumBytes.HasValue || MaximumBytes.HasValue) ? 1 : 0) + ((After.HasValue || Before.HasValue) ? 1 : 0) + (ThreeDTypes.Length>0?1:0) + FilterFactRules.Count(Facts);

	public CoreSearchFileConditions? ToConditions()
	{
		var array=FilterPresets.QueryExtensions(this);
		if (Count != 0)
		{
			return new CoreSearchFileConditions((array.Length != 0||ThreeDTypes.Length>0) ? array : null, MinimumBytes, MaximumBytes, After?.UtcDateTime.ToFileTimeUtc().ToString(), Before?.UtcDateTime.AddTicks(-1).ToFileTimeUtc().ToString(), (Category == "other") ? FormatRegistry.Formats.Select((FileFormat f) => f.Extension).Distinct().ToArray() : null);
		}
		return null;
	}
}
