#include "platform.h"
#include <cwchar>
#include <cerrno>

int wmain(int count, wchar_t** arguments) {
  if (count == 2 && std::wstring(arguments[1]) == L"--describe") {
    constexpr char text[] = "{\"protocol\":\"core-visuals/1\",\"runtimeRequired\":false}\n";
    DWORD written = 0; WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), text, sizeof(text) - 1, &written, nullptr); return 0;
  }
  if (count == 4 && std::wstring(arguments[1]) == L"--stop") {
    wchar_t* end = nullptr; errno = 0; const auto process = wcstoul(arguments[2], &end, 10);
    if (errno || !end || *end || !process || wcslen(arguments[3]) > 64) return 2;
    return cap7ce::visuals::RequestStop(process, arguments[3]);
  }
  if (count < 4 || std::wstring(arguments[2]) != L"--parent-pid") return 2;
  wchar_t* end = nullptr; errno = 0;
  const auto parent = wcstoul(arguments[3], &end, 10);
  if (errno || !end || *end || parent == 0 || parent == GetCurrentProcessId()) return 2;
  if (count == 4 && std::wstring(arguments[1]) == L"--pdf-thumbnail") return cap7ce::visuals::Thumbnail(parent, true);
  if (count == 4 && std::wstring(arguments[1]) == L"--thumbnail") return cap7ce::visuals::Thumbnail(parent);
  if ((count == 7 || count == 8) && std::wstring(arguments[1]) == L"--node-worker")
    return cap7ce::visuals::RunNode(parent, arguments[4], arguments[5], arguments[6], count == 8 ? arguments[7] : L"");
  return 2;
}
