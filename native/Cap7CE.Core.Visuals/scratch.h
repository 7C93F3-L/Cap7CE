#pragma once
#include <windows.h>
#include <string>

namespace cap7ce::visuals {
class OwnedScratch {
  std::wstring root, base;
 public:
  bool Create();
  ~OwnedScratch();
};
}
