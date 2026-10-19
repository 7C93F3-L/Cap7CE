#include "scratch.h"
#include <objbase.h>
#include <vector>

namespace cap7ce::visuals {
namespace {
// This traversal only enters the directory created by this owner. Reparse points are unlinked, never followed.
void RemoveTree(const std::wstring& directory) noexcept {
  const DWORD attributes = GetFileAttributesW(directory.c_str());
  if (attributes == INVALID_FILE_ATTRIBUTES) return;
  if (!(attributes & FILE_ATTRIBUTE_REPARSE_POINT)) {
    WIN32_FIND_DATAW entry{}; const auto search = FindFirstFileW((directory + L"\\*").c_str(), &entry);
    if (search != INVALID_HANDLE_VALUE) {
      do {
        const std::wstring name = entry.cFileName; if (name == L"." || name == L"..") continue;
        const std::wstring child = directory + L"\\" + name;
        if (entry.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) RemoveTree(child);
        else DeleteFileW(child.c_str());
      } while (FindNextFileW(search, &entry));
      FindClose(search);
    }
  }
  RemoveDirectoryW(directory.c_str());
}
}
bool OwnedScratch::Create() {
  std::vector<wchar_t> temporary(32768); const auto length = GetTempPathW(static_cast<DWORD>(temporary.size()), temporary.data());
  GUID guid{}; wchar_t text[40]{};
  if (!length || length >= temporary.size() || FAILED(CoCreateGuid(&guid)) || !StringFromGUID2(guid, text, 40)) return false;
  base.assign(temporary.data(), length); if (base.back() != L'\\') base += L'\\';
  root = base + L"cap7ce-visual-host-" + std::wstring(text + 1, 36);
  if (!CreateDirectoryW(root.c_str(), nullptr)) { root.clear(); return false; }
  return SetEnvironmentVariableW(L"CAP7CE_CORE_SCRATCH_ROOT", root.c_str()) != FALSE;
}
OwnedScratch::~OwnedScratch() {
  // Both strings originate here, not from a request, script path or source file. Refuse an unexpected target.
  const std::wstring prefix = base + L"cap7ce-visual-host-";
  if (root.empty() || base.empty() || root.rfind(prefix, 0) != 0 || root.size() != prefix.size() + 36) return;
  RemoveTree(root);
}
}
