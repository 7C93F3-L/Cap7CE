using System;
using System.Collections.ObjectModel;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.UI.Xaml.Data;
using Windows.Foundation;

namespace Cap7CE.WinUI.Models;

public sealed class AssetCollection : ObservableCollection<AssetItem>, ISupportIncrementalLoading
{
	public bool HasMoreItems { get; set; }

	internal Func<Task<uint>>? LoadPage { get; set; }

	public IAsyncOperation<LoadMoreItemsResult> LoadMoreItemsAsync(uint count)
	{
		return AsyncInfo.Run(async (CancellationToken _) =>
		{
			LoadMoreItemsResult result = default;
			uint count2 = ((LoadPage != null) ? (await LoadPage()) : 0u);
			result.Count = count2;
			return result;
		});
	}
}
