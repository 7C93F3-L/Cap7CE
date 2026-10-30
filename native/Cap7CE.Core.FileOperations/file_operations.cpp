#include <windows.h>
#include <shobjidl.h>
#include <shellapi.h>
#include <wrl/client.h>
#include <cwchar>
#include "operation_sink.h"

using Microsoft::WRL::ComPtr;
namespace {
struct Apartment {
  HRESULT status = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
  ~Apartment() { if (SUCCEEDED(status)) CoUninitialize(); }
};
HRESULT Prepare(LPCWSTR source, ComPtr<IFileOperation>& operation, ComPtr<IShellItem>& item) {
  if (!source || !*source || wcslen(source) > 32767) return E_INVALIDARG;
  auto status = CoCreateInstance(CLSID_FileOperation, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&operation));
  if (FAILED(status)) return status;
  return SHCreateItemFromParsingName(source, nullptr, IID_PPV_ARGS(&item));
}
}
extern "C" __declspec(dllexport) HRESULT __stdcall Cap7CE_RenameDirectory(
    LPCWSTR source, LPCWSTR name, UINT_PTR owner, LPWSTR path, int capacity, int* outcome) noexcept {
  if (!source || !outcome || !path || capacity < 1 || !name || !*name) return E_INVALIDARG;
  *outcome = -1; path[0] = L'\0';
  try {
    const auto attributes = GetFileAttributesW(source);
    if (attributes == INVALID_FILE_ATTRIBUTES) return HRESULT_FROM_WIN32(GetLastError());
    if (!(attributes & FILE_ATTRIBUTE_DIRECTORY)) return E_INVALIDARG;
    Apartment apartment; if (FAILED(apartment.status)) return apartment.status;
    ComPtr<IFileOperation> operation; ComPtr<IShellItem> item;
    auto status = Prepare(source, operation, item); if (FAILED(status)) return status;
    status = operation->SetOwnerWindow(reinterpret_cast<HWND>(owner)); if (FAILED(status)) return status;
    status = operation->SetOperationFlags(FOF_ALLOWUNDO | FOFX_ADDUNDORECORD | FOFX_SHOWELEVATIONPROMPT);
    if (FAILED(status)) return status;
    ComPtr<cap7ce::core::OperationSink> sink; sink.Attach(new cap7ce::core::OperationSink());
    status = operation->RenameItem(item.Get(), name, sink.Get()); if (FAILED(status)) return status;
    status = operation->PerformOperations();
    if (sink->renamed) {
      if (sink->actual_path.size() >= static_cast<size_t>(capacity)) return HRESULT_FROM_WIN32(ERROR_INSUFFICIENT_BUFFER);
      wcscpy_s(path, static_cast<size_t>(capacity), sink->actual_path.c_str()); *outcome = 1; return S_OK;
    }
    BOOL aborted = FALSE; const auto queried = operation->GetAnyOperationsAborted(&aborted);
    if (SUCCEEDED(queried) && aborted) { *outcome = 0; return S_OK; }
    return FAILED(status) ? status : FAILED(sink->error) ? sink->error : E_FAIL;
  } catch (...) { return E_FAIL; }
}
extern "C" __declspec(dllexport) HRESULT __stdcall Cap7CE_RecycleItem(LPCWSTR source, int* aborted) noexcept {
  if (!aborted) return E_INVALIDARG;
  *aborted = 0;
  try {
    Apartment apartment; if (FAILED(apartment.status)) return apartment.status;
    ComPtr<IFileOperation> operation; ComPtr<IShellItem> item;
    auto status = Prepare(source, operation, item); if (FAILED(status)) return status;
    status = operation->SetOperationFlags(FOF_NO_UI | FOFX_ADDUNDORECORD | FOF_NOERRORUI | FOF_SILENT
        | FOFX_SHOWELEVATIONPROMPT | FOFX_RECYCLEONDELETE);
    if (FAILED(status)) return status;
    ComPtr<cap7ce::core::OperationSink> sink; sink.Attach(new cap7ce::core::OperationSink());
    status = operation->DeleteItem(item.Get(), sink.Get()); if (FAILED(status)) return status;
    status = operation->PerformOperations(); if (FAILED(status)) return status;
    BOOL cancelled = FALSE; status = operation->GetAnyOperationsAborted(&cancelled); if (FAILED(status)) return status;
    *aborted = cancelled ? 1 : 0; return cancelled ? E_ABORT : S_OK;
  } catch (...) { return E_FAIL; }
}

#include "rename_items.h"
