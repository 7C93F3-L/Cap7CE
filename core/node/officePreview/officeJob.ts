// Win32 ABI only. The script supplies a newly activated application's HWND-derived PID, never an RPC PID.
export const officeJobSource = String.raw`
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public sealed class Cap7CEOfficeProcess : IDisposable {
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
    public long ProcessTime, JobTime; public uint Flags;
    public UIntPtr MinimumWorkingSet, MaximumWorkingSet; public uint ActiveProcesses;
    public UIntPtr Affinity; public uint Priority, Scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters {
    public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes;
  }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
    public BasicLimits Basic; public IoCounters Io;
    public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
  }
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern SafeFileHandle CreateJobObject(IntPtr security, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(SafeFileHandle job, int kind, ref ExtendedLimits limits, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern SafeFileHandle OpenProcess(uint access, bool inherit, uint processId);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(SafeFileHandle job, SafeFileHandle process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(SafeFileHandle process, uint code);
  readonly SafeFileHandle job;
  public Cap7CEOfficeProcess() {
    job = CreateJobObject(IntPtr.Zero, null);
    if (job.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
    ExtendedLimits limits = new ExtendedLimits(); limits.Basic.Flags = 0x2000;
    if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits)))) {
      int error = Marshal.GetLastWin32Error(); job.Dispose(); throw new Win32Exception(error);
    }
  }
  public static bool IsExisting(uint processId, uint[] existing) {
    if (processId == 0) throw new InvalidOperationException("CAP7CE_OFFICE_PID_UNAVAILABLE");
    return existing != null && Array.IndexOf(existing, processId) >= 0;
  }
  public void Attach(uint processId) {
    using (SafeFileHandle process = OpenProcess(0x0101, false, processId)) {
      if (process.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
      if (!AssignProcessToJobObject(job, process)) {
        int error = Marshal.GetLastWin32Error(); TerminateProcess(process, 1); throw new Win32Exception(error);
      }
    }
  }
  public void Dispose() { job.Dispose(); }
}
`;
