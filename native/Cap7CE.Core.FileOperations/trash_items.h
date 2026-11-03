#pragma once
#include <vector>
// One Shell operation, with one result slot per explicitly selected source.
extern "C" __declspec(dllexport) HRESULT __stdcall Cap7CE_RecycleItems(
    LPCWSTR* sources, int count, HRESULT* results) noexcept {
  if (!sources || !results || count < 1 || count > 200) return E_INVALIDARG;
  for (int i = 0; i < count; ++i) results[i] = E_PENDING;
  try {
    Apartment apartment; if (FAILED(apartment.status)) return apartment.status;
    ComPtr<IFileOperation> operation;
    auto status = CoCreateInstance(CLSID_FileOperation, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&operation));
    if (FAILED(status)) return status;
    status = operation->SetOperationFlags(FOF_NO_UI | FOFX_ADDUNDORECORD | FOF_NOERRORUI | FOF_SILENT
        | FOFX_SHOWELEVATIONPROMPT | FOFX_RECYCLEONDELETE);
    if (FAILED(status)) return status;
    std::vector<ComPtr<cap7ce::core::OperationSink>> sinks;
    for (int i = 0; i < count; ++i) {
      ComPtr<IShellItem> item;
      auto queued = SHCreateItemFromParsingName(sources[i], nullptr, IID_PPV_ARGS(&item));
      if (FAILED(queued)) { results[i] = queued; continue; }
      ComPtr<cap7ce::core::OperationSink> sink; sink.Attach(new cap7ce::core::OperationSink());
      sink->delete_result = &results[i]; sink->delete_source = item;
      queued = operation->DeleteItem(item.Get(), sink.Get());
      if (FAILED(queued)) results[i] = queued;
      sinks.push_back(sink);
    }
    status = operation->PerformOperations();
    BOOL aborted = FALSE; const auto queried = operation->GetAnyOperationsAborted(&aborted);
    for (int i = 0; i < count; ++i) if (results[i] == E_PENDING)
      results[i] = aborted ? E_ABORT : FAILED(status) ? status : FAILED(queried) ? queried : E_FAIL;
    return status;
  } catch (...) { return E_FAIL; }
}
