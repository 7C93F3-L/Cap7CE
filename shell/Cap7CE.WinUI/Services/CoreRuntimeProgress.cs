namespace Cap7CE.WinUI.Services;

internal enum CoreRuntimeStage { Checking,Downloading,Verifying,Installing,Configuring,Completed }
internal readonly record struct CoreRuntimeProgress(CoreRuntimeStage Stage,int? Percent=null);
