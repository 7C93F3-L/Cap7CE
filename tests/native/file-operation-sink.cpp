#include "operation_sink.h"
int main() {
  cap7ce::core::OperationSink sink;
  if (sink.PreDeleteItem(0, nullptr) != E_ABORT) return 1;
  if (sink.PreDeleteItem(TSF_DELETE_RECYCLE_IF_POSSIBLE, nullptr) != S_OK) return 2;
  if (sink.PreDeleteItem(TSF_DELETE_RECYCLE_IF_POSSIBLE | TSF_COPY_CREATION_TIME, nullptr) != S_OK) return 3;
  if (sink.QueryInterface(IID_IUnknown, nullptr) != E_POINTER) return 4;
  HRESULT result = E_PENDING; sink.delete_result = &result;
  sink.PostDeleteItem(0, nullptr, S_OK, nullptr);
  if (result != E_PENDING) return 5;
  return 0;
}
