#pragma once
#include <shlobj.h>
#include <map>
#include <vector>
#include <string>

extern "C" __declspec(dllexport) HRESULT __stdcall Cap7CE_RenameItems(
    LPCWSTR* sources, int count, LPCWSTR name, UINT_PTR owner,
    cap7ce::core::RenameCallback callback, int* aborted) noexcept {
  if (!sources || count < 1 || count > 200 || !name || !*name || !aborted) return E_INVALIDARG;
  *aborted = 0;
  try {
    Apartment apartment; if (FAILED(apartment.status)) return apartment.status;
    ComPtr<IFileOperation> operation;
    auto status = CoCreateInstance(CLSID_FileOperation, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&operation));
    if (FAILED(status)) return status;
    status = operation->SetOwnerWindow(reinterpret_cast<HWND>(owner)); if (FAILED(status)) return status;
    DWORD flags = FOF_ALLOWUNDO | FOFX_ADDUNDORECORD | FOFX_SHOWELEVATIONPROMPT;
    if (count > 1) flags |= FOF_RENAMEONCOLLISION | FOFX_PRESERVEFILEEXTENSIONS;
    status = operation->SetOperationFlags(flags); if (FAILED(status)) return status;
    ComPtr<cap7ce::core::OperationSink> sink; sink.Attach(new cap7ce::core::OperationSink());
    sink->rename_completed = callback;
    DWORD cookie = 0; status = operation->Advise(sink.Get(), &cookie); if (FAILED(status)) return status;
    struct Lists {
      std::vector<PIDLIST_ABSOLUTE> values;
      ~Lists() { for (auto item : values) CoTaskMemFree(item); }
    } lists;
    std::map<std::wstring, std::vector<PCIDLIST_ABSOLUTE>> groups;
    for (int i = 0; i < count; ++i) {
      if (!sources[i] || !*sources[i]) return E_INVALIDARG;
      const auto attributes = GetFileAttributesW(sources[i]);
      if (attributes == INVALID_FILE_ATTRIBUTES) return HRESULT_FROM_WIN32(GetLastError());
      std::wstring target(name);
      if (count > 1 && !(attributes & FILE_ATTRIBUTE_DIRECTORY)) {
        const auto leaf = wcsrchr(sources[i], L'\\');
        const auto file = leaf ? leaf + 1 : sources[i];
        const auto extension = wcsrchr(file, L'.');
        if (extension && extension != file) target += extension;
      }
      PIDLIST_ABSOLUTE id = nullptr;
      status = SHParseDisplayName(sources[i], nullptr, &id, 0, nullptr); if (FAILED(status)) return status;
      lists.values.push_back(id); groups[target].push_back(id);
    }
    for (auto& group : groups) {
      ComPtr<IShellItemArray> items;
      status = SHCreateShellItemArrayFromIDLists(static_cast<UINT>(group.second.size()), group.second.data(), &items);
      if (FAILED(status)) return status;
      if (count == 1) {
        ComPtr<IShellItem> item; status = items->GetItemAt(0, &item);
        if (SUCCEEDED(status)) status = operation->RenameItem(item.Get(), group.first.c_str(), nullptr);
      } else status = operation->RenameItems(items.Get(), group.first.c_str());
      if (FAILED(status)) return status;
    }
    status = operation->PerformOperations();
    BOOL cancelled = FALSE; operation->GetAnyOperationsAborted(&cancelled); *aborted = cancelled ? 1 : 0;
    operation->Unadvise(cookie); return status;
  } catch (...) { return E_FAIL; }
}
