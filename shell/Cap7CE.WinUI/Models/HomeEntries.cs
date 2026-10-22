using System;
using System.Collections.Generic;
using System.IO;
using Cap7CE.Core.Protocol;

namespace Cap7CE.WinUI.Models;

internal static class HomeEntries
{
	public static IEnumerable<AssetItem> Create(IReadOnlyList<CoreVolumeStatus> volumes)
	{
		(string, string)[] array = new (string, string)[6]
		{
			("桌面", Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory)),
			("文档", Environment.GetFolderPath(Environment.SpecialFolder.Personal)),
			("下载", Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads")),
			("图片", Environment.GetFolderPath(Environment.SpecialFolder.MyPictures)),
			("音乐", Environment.GetFolderPath(Environment.SpecialFolder.MyMusic)),
			("视频", Environment.GetFolderPath(Environment.SpecialFolder.MyVideos))
		};
		(string, string)[] array2 = array;
		for (int i = 0; i < array2.Length; i++)
		{
			var (text, text2) = array2[i];
			if (!string.IsNullOrEmpty(text2))
			{
				yield return new AssetItem(new BasicSearchItem("home-" + text, text, "", "", IsDirectory: true), text2);
			}
		}
		foreach (CoreVolumeStatus volume in volumes)
		{
			yield return new AssetItem(new BasicSearchItem(volume.VolumeId, "本地磁盘 (" + volume.DisplayName + ")", "", "", IsDirectory: true), volume.DisplayName.TrimEnd('\\') + "\\");
		}
		foreach(var drive in DriveInfo.GetDrives())
		{
			if(drive.DriveType is not (DriveType.Fixed or DriveType.Removable)||volumes.Any(v=>string.Equals(v.DisplayName.TrimEnd('\\'),drive.Name.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase)))continue;
			yield return new AssetItem(new BasicSearchItem("drive-"+drive.Name,"本地磁盘 ("+drive.Name.TrimEnd('\\')+")","","",IsDirectory:true),drive.Name);
		}
	}
}
