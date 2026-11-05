#pragma once
#include "platform.h"
#include <vector>

namespace cap7ce::visuals {
struct ExrPixel { float r = 0, g = 0, b = 0, a = 1; };
struct ExrImage {
  int width = 0, height = 0, x = 0, y = 0;
  int displayWidth = 0, displayHeight = 0, displayX = 0, displayY = 0;
  std::vector<ExrPixel> pixels;
};
ExrImage ReadExrImage(const std::wstring& source);
}
