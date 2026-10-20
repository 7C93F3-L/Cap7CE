using System;
using Cap7CE.Core.Protocol;
using Microsoft.UI.Xaml.Data;

namespace Cap7CE.WinUI.Models;

[Bindable]
public sealed class AssetItem(BasicSearchItem entry, string fullPath)
{
    public double AspectRatio {get;private set;}=1;
    internal event Action? AspectChanged;
    internal void ReportAspect(double width,double height)
    {if(width<=0||height<=0)return;var ratio=width/height;if(!double.IsFinite(ratio)||Math.Abs(ratio-AspectRatio)<.001)return;AspectRatio=ratio;AspectChanged?.Invoke();}
    public string IconName=>Entry.Id switch {"home-桌面"=>"skim-location-desktop","home-文档"=>"skim-location-documents","home-下载"=>"skim-location-downloads","home-图片"=>"skim-location-pictures","home-音乐"=>"skim-location-music","home-视频"=>"skim-location-videos",_=>Entry.IsDirectory?(FullPath.Length<=3?"skim-disk":"skim-folder"):FormatRegistry.Find(Entry.Extension)?.IconName??"skim-file"};
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
