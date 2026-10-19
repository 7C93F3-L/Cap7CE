// Copyright 2012 The Chromium Authors
// Alpha/mask conversion adapted from Chromium IconUtil. BSD-3-Clause notice in third_party/chromium-visuals/LICENSE.
#include "icon_pixels.h"
#include <vector>
#include <algorithm>
#include <cstdint>

namespace cap7ce::visuals {
HRESULT DecodeIconPixels(HICON icon, UINT width, UINT height, IWICImagingFactory* factory, Microsoft::WRL::ComPtr<IWICBitmap>& image) {
  BITMAPV5HEADER header{};
  header.bV5Size = sizeof(header); header.bV5Width = static_cast<LONG>(width); header.bV5Height = -static_cast<LONG>(height);
  header.bV5Planes = 1; header.bV5BitCount = 32; header.bV5Compression = BI_RGB;
  header.bV5RedMask = 0x00ff0000; header.bV5GreenMask = 0x0000ff00; header.bV5BlueMask = 0x000000ff; header.bV5AlphaMask = 0xff000000;
  header.bV5CSType = LCS_WINDOWS_COLOR_SPACE; header.bV5Intent = LCS_GM_IMAGES;
  void* bits = nullptr;
  const auto desktop = GetDC(nullptr);
  const auto bitmap = CreateDIBSection(desktop, reinterpret_cast<BITMAPINFO*>(&header), DIB_RGB_COLORS, &bits, nullptr, 0);
  const auto context = CreateCompatibleDC(desktop); if (desktop) ReleaseDC(nullptr, desktop);
  if (!bitmap || !context || !bits) { if (bitmap) DeleteObject(bitmap); if (context) DeleteDC(context); return E_FAIL; }
  const auto previous = SelectObject(context, bitmap);
  auto pixels = static_cast<uint32_t*>(bits); const size_t count = static_cast<size_t>(width) * height;
  std::vector<unsigned char> opaque(count);
  std::fill_n(pixels, count, 0u);
  bool drawn = DrawIconEx(context, 0, 0, icon, width, height, 0, nullptr, DI_MASK) != FALSE;
  if (drawn) for (size_t index = 0; index < count; ++index) opaque[index] = pixels[index] == 0;
  std::fill_n(pixels, count, 0u);
  drawn = drawn && DrawIconEx(context, 0, 0, icon, width, height, 0, nullptr, DI_NORMAL) != FALSE;
  const bool alpha = std::any_of(pixels, pixels + count, [](uint32_t pixel) { return (pixel & 0xff000000) != 0; });
  if (drawn && !alpha) for (size_t index = 0; index < count; ++index) if (opaque[index]) pixels[index] |= 0xff000000;
  // GDI produced premultiplied BGRA. WIC performs the final straight-alpha PNG conversion.
  const auto result = drawn ? factory->CreateBitmapFromMemory(width, height, GUID_WICPixelFormat32bppPBGRA,
    width * 4, static_cast<UINT>(count * 4), reinterpret_cast<BYTE*>(pixels), &image) : E_FAIL;
  SelectObject(context, previous); DeleteDC(context); DeleteObject(bitmap); return result;
}
}
