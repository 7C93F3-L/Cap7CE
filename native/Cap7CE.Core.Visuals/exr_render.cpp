#include "exr_render.h"
#include "exr_source.h"
#include <wincodec.h>
#include <wrl/client.h>
#include <algorithm>
#include <cmath>
#include <cstdint>

namespace cap7ce::visuals {
namespace {
using Microsoft::WRL::ComPtr;
unsigned char Byte(float value) {
  return static_cast<unsigned char>(std::lround(std::clamp(std::isfinite(value) ? value : 0.0f, 0.0f, 1.0f) * 255.0f));
}
unsigned char Color(float value, float alpha) {
  // EXR color is scene-linear and conventionally premultiplied; PNG holds straight alpha.
  value = std::isfinite(value) && alpha > 0 ? std::clamp(value / alpha, 0.0f, 1.0f) : 0;
  return Byte(value <= 0.0031308f ? value * 12.92f : 1.055f * std::pow(value, 1.0f / 2.4f) - 0.055f);
}
ExrPixel Sample(const ExrImage& image, double x, double y) {
  x -= image.x; y -= image.y;
  const auto ix = static_cast<int64_t>(std::floor(x)), iy = static_cast<int64_t>(std::floor(y));
  const float fx = static_cast<float>(x - ix), fy = static_cast<float>(y - iy);
  ExrPixel result{0, 0, 0, 0};
  for (int dy = 0; dy < 2; ++dy) for (int dx = 0; dx < 2; ++dx) {
    const auto px = ix + dx, py = iy + dy;
    if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
    const auto& pixel = image.pixels[static_cast<size_t>(py) * image.width + static_cast<size_t>(px)];
    const float weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
    result.r += pixel.r * weight; result.g += pixel.g * weight; result.b += pixel.b * weight; result.a += pixel.a * weight;
  }
  return result;
}
HRESULT EncodePixels(std::vector<unsigned char>& pixels, UINT width, UINT height, std::vector<unsigned char>& png) {
  ComPtr<IWICImagingFactory> factory;
  auto status = CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&factory)); if (FAILED(status)) return status;
  ComPtr<IStream> stream; status = CreateStreamOnHGlobal(nullptr, TRUE, &stream); if (FAILED(status)) return status;
  ComPtr<IWICBitmapEncoder> encoder; status = factory->CreateEncoder(GUID_ContainerFormatPng, nullptr, &encoder); if (FAILED(status)) return status;
  status = encoder->Initialize(stream.Get(), WICBitmapEncoderNoCache); if (FAILED(status)) return status;
  ComPtr<IWICBitmapFrameEncode> frame; status = encoder->CreateNewFrame(&frame, nullptr); if (FAILED(status)) return status;
  status = frame->Initialize(nullptr); if (FAILED(status)) return status;
  status = frame->SetSize(width, height); if (FAILED(status)) return status;
  auto format = GUID_WICPixelFormat32bppBGRA; status = frame->SetPixelFormat(&format); if (FAILED(status)) return status;
  if (format != GUID_WICPixelFormat32bppBGRA) return E_FAIL;
  status = frame->WritePixels(height, width * 4, static_cast<UINT>(pixels.size()), pixels.data()); if (FAILED(status)) return status;
  status = frame->Commit(); if (FAILED(status)) return status;
  status = encoder->Commit(); if (FAILED(status)) return status;
  STATSTG stat{}; status = stream->Stat(&stat, STATFLAG_NONAME); if (FAILED(status)) return status;
  if (!stat.cbSize.QuadPart || stat.cbSize.QuadPart > 40 * 1024 * 1024) return E_INVALIDARG;
  HGLOBAL memory = nullptr; status = GetHGlobalFromStream(stream.Get(), &memory); if (FAILED(status)) return status;
  const auto data = static_cast<unsigned char*>(GlobalLock(memory)); if (!data) return E_OUTOFMEMORY;
  png.assign(data, data + static_cast<size_t>(stat.cbSize.QuadPart)); GlobalUnlock(memory); return S_OK;
}
}
HRESULT EncodeExrThumbnail(const std::wstring& source, UINT edge, std::vector<unsigned char>& png) noexcept {
  const auto initialized = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(initialized)) return initialized;
  struct Apartment { ~Apartment() { CoUninitialize(); } } apartment;
  try {
    const auto image = ReadExrImage(source);
    const double scale = std::min({1.0, double(edge) / image.displayWidth, double(edge) / image.displayHeight});
    const auto width = static_cast<UINT>(std::max(1.0, std::floor(image.displayWidth * scale)));
    const auto height = static_cast<UINT>(std::max(1.0, std::floor(image.displayHeight * scale)));
    if (uint64_t(width) * height > 16000000) return E_INVALIDARG;
    std::vector<unsigned char> pixels(static_cast<size_t>(width) * height * 4);
    for (UINT y = 0; y < height; ++y) for (UINT x = 0; x < width; ++x) {
      const auto pixel = Sample(image, image.displayX + (x + 0.5) * image.displayWidth / width - 0.5,
        image.displayY + (y + 0.5) * image.displayHeight / height - 0.5);
      const float alpha = std::clamp(std::isfinite(pixel.a) ? pixel.a : 0.0f, 0.0f, 1.0f);
      const auto offset = (static_cast<size_t>(y) * width + x) * 4;
      pixels[offset] = Color(pixel.b, alpha); pixels[offset + 1] = Color(pixel.g, alpha);
      pixels[offset + 2] = Color(pixel.r, alpha); pixels[offset + 3] = Byte(alpha);
    }
    return EncodePixels(pixels, width, height, png);
  } catch (...) { png.clear(); return E_FAIL; }
}
}
