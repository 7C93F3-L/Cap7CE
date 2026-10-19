#pragma once
#include <windows.h>
#include <shobjidl.h>
#include <atomic>
#include <string>

namespace cap7ce::core {
class OperationSink final : public IFileOperationProgressSink {
  std::atomic<ULONG> references_{1};
 public:
  bool renamed = false;
  HRESULT error = S_OK;
  std::wstring actual_path;
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void** result) override {
    if (!result) return E_POINTER;
    *result = nullptr;
    if (id != IID_IUnknown && id != IID_IFileOperationProgressSink) return E_NOINTERFACE;
    *result = static_cast<IFileOperationProgressSink*>(this); AddRef(); return S_OK;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return ++references_; }
  ULONG STDMETHODCALLTYPE Release() override { const auto count = --references_; if (!count) delete this; return count; }
  HRESULT STDMETHODCALLTYPE StartOperations() override { return S_OK; }
  HRESULT STDMETHODCALLTYPE FinishOperations(HRESULT) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE PreRenameItem(DWORD, IShellItem*, LPCWSTR) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE PostRenameItem(DWORD, IShellItem*, LPCWSTR, HRESULT result, IShellItem* created) override {
    error = result;
    if (FAILED(result) || !created) return S_OK;
    PWSTR value = nullptr;
    const auto status = created->GetDisplayName(SIGDN_FILESYSPATH, &value);
    if (FAILED(status)) { error = status; return S_OK; }
    try { actual_path = value; renamed = true; }
    catch (...) { error = E_OUTOFMEMORY; }
    CoTaskMemFree(value); return S_OK;
  }
  HRESULT STDMETHODCALLTYPE PreMoveItem(DWORD, IShellItem*, IShellItem*, LPCWSTR) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE PostMoveItem(DWORD, IShellItem*, IShellItem*, LPCWSTR, HRESULT, IShellItem*) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE PreCopyItem(DWORD, IShellItem*, IShellItem*, LPCWSTR) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE PostCopyItem(DWORD, IShellItem*, IShellItem*, LPCWSTR, HRESULT, IShellItem*) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE PreDeleteItem(DWORD flags, IShellItem*) override {
    // A recycle request is never permission to fall back to permanent deletion.
    return (flags & TSF_DELETE_RECYCLE_IF_POSSIBLE) ? S_OK : E_ABORT;
  }
  HRESULT STDMETHODCALLTYPE PostDeleteItem(DWORD, IShellItem*, HRESULT, IShellItem*) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE PreNewItem(DWORD, IShellItem*, LPCWSTR) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE PostNewItem(DWORD, IShellItem*, LPCWSTR, LPCWSTR, DWORD, HRESULT, IShellItem*) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE UpdateProgress(UINT, UINT) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE ResetTimer() override { return S_OK; }
  HRESULT STDMETHODCALLTYPE PauseTimer() override { return S_OK; }
  HRESULT STDMETHODCALLTYPE ResumeTimer() override { return S_OK; }
};
}
