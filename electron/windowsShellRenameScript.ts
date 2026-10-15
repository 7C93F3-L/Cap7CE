// STA helper owns one Shell operation. Paths/names arrive as JSON on stdin,
// never as executable PowerShell or command-line fragments.
export const windowsShellRenameScript = String.raw`
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface RenameShellItem {
  void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr result);
  void GetParent(out RenameShellItem parent);
  void GetDisplayName(uint name, out IntPtr value);
  void GetAttributes(uint mask, out uint attributes);
  void Compare(RenameShellItem other, uint hint, out int order);
}
[ComVisible(true), Guid("04B0F1A7-9490-44BC-96E1-4296A31252E2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface RenameProgressSink {
  [PreserveSig] int StartOperations();
  [PreserveSig] int FinishOperations(int result);
  [PreserveSig] int PreRenameItem(uint flags, RenameShellItem item, [MarshalAs(UnmanagedType.LPWStr)] string name);
  [PreserveSig] int PostRenameItem(uint flags, RenameShellItem item, [MarshalAs(UnmanagedType.LPWStr)] string name, int result, RenameShellItem created);
  [PreserveSig] int PreMoveItem(uint flags, RenameShellItem item, RenameShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name);
  [PreserveSig] int PostMoveItem(uint flags, RenameShellItem item, RenameShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, int result, RenameShellItem created);
  [PreserveSig] int PreCopyItem(uint flags, RenameShellItem item, RenameShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name);
  [PreserveSig] int PostCopyItem(uint flags, RenameShellItem item, RenameShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, int result, RenameShellItem created);
  [PreserveSig] int PreDeleteItem(uint flags, RenameShellItem item);
  [PreserveSig] int PostDeleteItem(uint flags, RenameShellItem item, int result, RenameShellItem created);
  [PreserveSig] int PreNewItem(uint flags, RenameShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name);
  [PreserveSig] int PostNewItem(uint flags, RenameShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPWStr)] string template, uint attributes, int result, RenameShellItem created);
  [PreserveSig] int UpdateProgress(uint total, uint completed);
  [PreserveSig] int ResetTimer();
  [PreserveSig] int PauseTimer();
  [PreserveSig] int ResumeTimer();
}
[ComImport, Guid("947AAB5F-0A5C-4C13-B4D6-4BF7836FC9F8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface RenameFileOperation {
  void Advise(RenameProgressSink sink, out uint cookie);
  void Unadvise(uint cookie);
  void SetOperationFlags(uint flags);
  void SetProgressMessage([MarshalAs(UnmanagedType.LPWStr)] string message);
  void SetProgressDialog(IntPtr dialog);
  void SetProperties(IntPtr properties);
  void SetOwnerWindow(IntPtr owner);
  void ApplyPropertiesToItem(RenameShellItem item);
  void ApplyPropertiesToItems(IntPtr items);
  void RenameItem(RenameShellItem item, [MarshalAs(UnmanagedType.LPWStr)] string name, RenameProgressSink sink);
  void RenameItems(IntPtr items, [MarshalAs(UnmanagedType.LPWStr)] string name);
  void MoveItem(RenameShellItem item, RenameShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, RenameProgressSink sink);
  void MoveItems(IntPtr items, RenameShellItem destination);
  void CopyItem(RenameShellItem item, RenameShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, RenameProgressSink sink);
  void CopyItems(IntPtr items, RenameShellItem destination);
  void DeleteItem(RenameShellItem item, RenameProgressSink sink);
  void DeleteItems(IntPtr items);
  void NewItem(RenameShellItem destination, uint attributes, [MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPWStr)] string template, RenameProgressSink sink);
  void PerformOperations();
  void GetAnyOperationsAborted([MarshalAs(UnmanagedType.Bool)] out bool aborted);
}
public class RenameOutcome { public string status = "cancelled"; public string path; public int error; }
[ComVisible(true), ClassInterface(ClassInterfaceType.None)]
public class RenameSink : RenameProgressSink {
  public RenameOutcome Outcome = new RenameOutcome();
  public int StartOperations() { return 0; }
  public int FinishOperations(int result) { return 0; }
  public int PreRenameItem(uint f, RenameShellItem i, string n) { return 0; }
  public int PostRenameItem(uint f, RenameShellItem i, string n, int result, RenameShellItem created) {
    Outcome.error = result;
    if (result < 0 || created == null) return 0;
    IntPtr text; created.GetDisplayName(0x80058000, out text);
    try { Outcome.path = Marshal.PtrToStringUni(text); Outcome.status = "renamed"; }
    finally { Marshal.FreeCoTaskMem(text); }
    return 0;
  }
  public int PreMoveItem(uint f, RenameShellItem i, RenameShellItem d, string n) { return 0; }
  public int PostMoveItem(uint f, RenameShellItem i, RenameShellItem d, string n, int r, RenameShellItem c) { return 0; }
  public int PreCopyItem(uint f, RenameShellItem i, RenameShellItem d, string n) { return 0; }
  public int PostCopyItem(uint f, RenameShellItem i, RenameShellItem d, string n, int r, RenameShellItem c) { return 0; }
  public int PreDeleteItem(uint f, RenameShellItem i) { return 0; }
  public int PostDeleteItem(uint f, RenameShellItem i, int r, RenameShellItem c) { return 0; }
  public int PreNewItem(uint f, RenameShellItem d, string n) { return 0; }
  public int PostNewItem(uint f, RenameShellItem d, string n, string t, uint a, int r, RenameShellItem c) { return 0; }
  public int UpdateProgress(uint t, uint c) { return 0; }
  public int ResetTimer() { return 0; }
  public int PauseTimer() { return 0; }
  public int ResumeTimer() { return 0; }
}
public static class Cap7CERename {
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
  private static extern void SHCreateItemFromParsingName(string path, IntPtr bind, ref Guid id, out RenameShellItem item);
  public static RenameOutcome Run(string path, string name, long owner) {
    RenameFileOperation operation = null; RenameShellItem item = null; var sink = new RenameSink();
    try {
      Guid id = typeof(RenameShellItem).GUID; SHCreateItemFromParsingName(path, IntPtr.Zero, ref id, out item);
      operation = (RenameFileOperation)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("3AD05575-8857-4850-9277-11B85BDB8E09")));
      operation.SetOwnerWindow(new IntPtr(owner));
      // Keep native error/conflict/elevation UI. Never auto-answer or overwrite.
      operation.SetOperationFlags(0x40 | 0x20000000 | 0x40000);
      operation.RenameItem(item, name, sink); operation.PerformOperations();
      bool aborted; operation.GetAnyOperationsAborted(out aborted);
      if (sink.Outcome.status != "renamed" && !aborted) sink.Outcome.status = "failed";
    } catch (Exception error) {
      if (sink.Outcome.status != "renamed") { sink.Outcome.status = "failed"; sink.Outcome.error = error.HResult; }
    } finally {
      if (item != null) Marshal.ReleaseComObject(item);
      if (operation != null) Marshal.ReleaseComObject(operation);
      GC.KeepAlive(sink);
    }
    return sink.Outcome;
  }
}
'@
$request=([Console]::In.ReadToEnd()|ConvertFrom-Json)
[Cap7CERename]::Run([string]$request.path,[string]$request.name,[long]$request.owner)|ConvertTo-Json -Compress
`;
