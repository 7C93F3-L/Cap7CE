using System;
using Cap7CE.Core.Protocol;
using Microsoft.UI.Xaml.Data;

namespace Cap7CE.WinUI.Models;

[Bindable]
public sealed class AssetItem(BasicSearchItem entry, string fullPath)
{
	public BasicSearchItem Entry { get; } = entry;

	public string FullPath { get; } = fullPath;

	public string Name => Entry.Name;

	public string Glyph
	{
		get
		{
			if (!Entry.IsDirectory)
			{
				return "\ue8a5";
			}
			return "\ue8b7";
		}
	}

	public string SizeLabel
	{
		get
		{
			if (!Entry.IsDirectory)
			{
				long? sizeBytes = Entry.SizeBytes;
				if (sizeBytes.HasValue)
				{
					long valueOrDefault = sizeBytes.GetValueOrDefault();
					if (valueOrDefault >= 1048576)
					{
						return $"{(double)valueOrDefault / 1048576.0:N1} MB";
					}
					return $"{(double)valueOrDefault / 1024.0:N1} KB";
				}
				return "—";
			}
			return "文件夹";
		}
	}

	public string ModifiedLabel
	{
		get
		{
			long? modifiedUtcTicks = Entry.ModifiedUtcTicks;
			if (modifiedUtcTicks.HasValue)
			{
				long valueOrDefault = modifiedUtcTicks.GetValueOrDefault();
				return DateTime.FromFileTimeUtc(valueOrDefault).ToLocalTime().ToString("yyyy-MM-dd HH:mm");
			}
			return "—";
		}
	}

	public override string ToString()
	{
		return Name;
	}
}
