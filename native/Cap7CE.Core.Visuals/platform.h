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
int Thumbnail(DWORD parent, bool pdf = false);
int RunNode(DWORD parent, const std::wstring& node, const std::wstring& worker, const std::wstring& root, const std::wstring& nonce);
std::wstring StopEventName(DWORD process, const std::wstring& nonce);
int RequestStop(DWORD process, const std::wstring& nonce);
}
