#pragma once
#include <windows.h>
#include <string>

namespace cap7ce::visuals {
class Handle {
 public:
  HANDLE value = nullptr;
  explicit Handle(HANDLE handle = nullptr) noexcept : value(handle) {}
  ~Handle() { if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value); }
  Handle(const Handle&) = delete;
  Handle& operator=(const Handle&) = delete;
};
int Thumbnail(DWORD parent);
int RunNode(DWORD parent, const std::wstring& node, const std::wstring& worker, const std::wstring& root);
}
