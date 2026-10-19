#include "platform.h"

namespace cap7ce::visuals {
std::wstring StopEventName(DWORD process, const std::wstring& nonce) {
  return L"Local\\Cap7CE.Visuals.Stop." + std::to_wstring(process) + L"." + nonce;
}
int RequestStop(DWORD process, const std::wstring& nonce) {
  Handle owner(OpenProcess(SYNCHRONIZE, FALSE, process)); if (!owner.value) return 0;
  // Only an active stop request waits for a just-starting owner to create its event. No idle polling exists.
  for (unsigned attempt = 0; attempt < 100; ++attempt) {
    Handle signal(OpenEventW(EVENT_MODIFY_STATE, FALSE, StopEventName(process, nonce).c_str()));
    if (signal.value) return SetEvent(signal.value) ? 0 : 3;
    if (WaitForSingleObject(owner.value, 10) == WAIT_OBJECT_0) return 0;
  }
  return 3;
}
}
