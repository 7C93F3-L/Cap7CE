using System;
using System.Collections.Generic;
using System.IO;
using Cap7CE.Core.Protocol;

namespace Cap7CE.WinUI.Models;

internal static class HomeEntries
{
	// Home is a direct shell projection: it intentionally does not depend on
	// catalog availability, index progress, or metadata state.
	public static IEnumerable<AssetItem> Create()
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
		foreach (var drive in DriveInfo.GetDrives())
		{
			var root = ReadyRoot(drive);
			if (root is not null)
				yield return new AssetItem(new BasicSearchItem("drive-" + root, "本地磁盘 (" + root.TrimEnd('\\') + ")", "", "", IsDirectory: true), root);
		}
	}
	private static string? ReadyRoot(DriveInfo drive)
	{
		try { return drive.IsReady ? drive.Name : null; }
		catch (IOException) { return null; }
	}
}
