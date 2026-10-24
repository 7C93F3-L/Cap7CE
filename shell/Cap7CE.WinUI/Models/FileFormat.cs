namespace Cap7CE.WinUI.Models;

internal sealed record FileFormat(string Extension, string Category, string IconName, string PreviewKind, bool CanSearch, bool CanThumbnail, bool CanShellPreview, bool CanAIIndex=false);
