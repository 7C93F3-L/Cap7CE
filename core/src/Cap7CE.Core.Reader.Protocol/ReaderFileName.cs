namespace Cap7CE.Core.Reader.Protocol;

// Entry metadata; the owning physical identity stays separate.
public sealed record ReaderFileName(ulong ParentFileReference, string Name);
