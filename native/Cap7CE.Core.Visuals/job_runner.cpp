#include "platform.h"
#include <vector>

namespace cap7ce::visuals {
namespace {
std::wstring Quote(const std::wstring& value) {
  std::wstring result = L"\""; size_t slashes = 0;
  for (const auto character : value) {
    if (character == L'\\') { ++slashes; continue; }
    result.append(slashes * (character == L'\"' ? 2 : 1), L'\\'); slashes = 0;
    if (character == L'\"') result += L'\\';
    result += character;
  }
  result.append(slashes * 2, L'\\'); result += L'\"'; return result;
}
bool DuplicateStandard(DWORD kind, Handle& target) {
  return DuplicateHandle(GetCurrentProcess(), GetStdHandle(kind), GetCurrentProcess(), &target.value, 0, TRUE, DUPLICATE_SAME_ACCESS) != FALSE;
}
}
int RunNode(DWORD parentPid, const std::wstring& node, const std::wstring& worker, const std::wstring& root) {
  Handle parent(OpenProcess(SYNCHRONIZE, FALSE, parentPid));
  if (!parent.value || WaitForSingleObject(parent.value, 0) != WAIT_TIMEOUT) return 3;
  Handle job(CreateJobObjectW(nullptr, nullptr));
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{}; limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!job.value || !SetInformationJobObject(job.value, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) return 3;
  Handle input, output, error;
  if (!DuplicateStandard(STD_INPUT_HANDLE, input) || !DuplicateStandard(STD_OUTPUT_HANDLE, output) || !DuplicateStandard(STD_ERROR_HANDLE, error)) return 3;
  STARTUPINFOEXW startup{}; startup.StartupInfo.cb = sizeof(startup); startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  startup.StartupInfo.hStdInput = input.value; startup.StartupInfo.hStdOutput = output.value; startup.StartupInfo.hStdError = error.value;
  SIZE_T bytes = 0; InitializeProcThreadAttributeList(nullptr, 2, 0, &bytes);
  std::vector<unsigned char> attributes(bytes); startup.lpAttributeList = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(attributes.data());
  if (!InitializeProcThreadAttributeList(startup.lpAttributeList, 2, 0, &bytes)) return 3;
  const HANDLE inherited[] = { input.value, output.value, error.value };
  HANDLE jobs[] = { job.value };
  const bool configured = UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
    const_cast<HANDLE*>(inherited), sizeof(inherited), nullptr, nullptr) != FALSE
    && UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, jobs, sizeof(jobs), nullptr, nullptr) != FALSE;
  std::wstring command = Quote(node) + L" --max-old-space-size=384 " + Quote(worker) + L" " + Quote(root);
  PROCESS_INFORMATION process{};
  const bool created = configured && CreateProcessW(node.c_str(), command.data(), nullptr, nullptr, TRUE,
    EXTENDED_STARTUPINFO_PRESENT | CREATE_SUSPENDED | CREATE_NO_WINDOW, nullptr, nullptr, &startup.StartupInfo, &process);
  DeleteProcThreadAttributeList(startup.lpAttributeList);
  if (!created) return 3;
  Handle child(process.hProcess), thread(process.hThread);
  BOOL assigned = FALSE;
  if (!IsProcessInJob(child.value, job.value, &assigned) || !assigned || WaitForSingleObject(parent.value, 0) != WAIT_TIMEOUT
    || ResumeThread(thread.value) == static_cast<DWORD>(-1)) { TerminateProcess(child.value, 3); return 3; }
  const HANDLE waiting[] = { parent.value, child.value };
  if (WaitForMultipleObjects(2, waiting, FALSE, INFINITE) != WAIT_OBJECT_0 + 1) { TerminateJobObject(job.value, 3); return 3; }
  DWORD code = 3; GetExitCodeProcess(child.value, &code); return static_cast<int>(code);
  // Closing the non-inherited job also removes any decoder descendants left after the worker exits.
}
}
