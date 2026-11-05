#include "platform.h"
#include "icon_pixels.h"
#include "pdf_thumbnail.h"
#include <shobjidl.h>
#include <thumbcache.h>
#include <wincodec.h>
#include <wrl/client.h>
#include <vector>
#include <cstdint>
#include <algorithm>

using Microsoft::WRL::ComPtr;
namespace cap7ce::visuals {
namespace {
constexpr DWORD maximumImageBytes = 40 * 1024 * 1024;
bool Transfer(HANDLE pipe, void* bytes, DWORD count, bool write) {
  auto cursor = static_cast<unsigned char*>(bytes);
  while (count) {
    DWORD transferred = 0;
    const bool success = write ? WriteFile(pipe, cursor, count, &transferred, nullptr) : ReadFile(pipe, cursor, count, &transferred, nullptr);
    if (!success || !transferred) return false;
    cursor += transferred; count -= transferred;
  }
  return true;
}
DWORD WINAPI ParentEnded(void* parent) { WaitForSingleObject(parent, INFINITE); CloseHandle(parent); ExitProcess(3); }
struct Apartment {
  HRESULT status = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
  ~Apartment() { if (SUCCEEDED(status)) CoUninitialize(); }
};
struct Icon { HICON value; ~Icon() { if (value) DestroyIcon(value); } };
HRESULT EncodeThumbnail(const std::wstring& source, UINT edge, std::vector<unsigned char>& png) {
  Apartment apartment; if (FAILED(apartment.status)) return apartment.status;
  ComPtr<IShellItem> item; auto status = SHCreateItemFromParsingName(source.c_str(), nullptr, IID_PPV_ARGS(&item));
  if (FAILED(status)) return status;
  ComPtr<IThumbnailCache> cache;
  status = CoCreateInstance(CLSID_LocalThumbnailCache, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&cache));
  if (FAILED(status)) return status;
  ComPtr<ISharedBitmap> shared;
  status = cache->GetThumbnail(item.Get(), edge, static_cast<WTS_FLAGS>(WTS_SCALETOREQUESTEDSIZE | WTS_SCALEUP), &shared, nullptr, nullptr);
  if (FAILED(status)) return status;
  HBITMAP bitmap = nullptr; status = shared->GetSharedBitmap(&bitmap); if (FAILED(status)) return status;
  BITMAP dimensions{};
  if (!GetObjectW(bitmap, sizeof(dimensions), &dimensions)) return HRESULT_FROM_WIN32(GetLastError());
  if (dimensions.bmWidth < 1 || dimensions.bmHeight < 1 || dimensions.bmWidth > 4096 || dimensions.bmHeight > 4096
    || static_cast<uint64_t>(dimensions.bmWidth) * dimensions.bmHeight > 16000000) return E_INVALIDARG;
  // Match the existing HBITMAP -> HICON path, including its monochrome mask/alpha semantics.
  ICONINFO information{}; information.fIcon = TRUE; information.hbmColor = bitmap; information.hbmMask = bitmap;
  Icon icon{ CreateIconIndirect(&information) }; if (!icon.value) return HRESULT_FROM_WIN32(GetLastError());
  ComPtr<IWICImagingFactory> factory;
  status = CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&factory)); if (FAILED(status)) return status;
  ComPtr<IWICBitmap> image;
  status = DecodeIconPixels(icon.value, dimensions.bmWidth, dimensions.bmHeight, factory.Get(), image); if (FAILED(status)) return status;
  ComPtr<IStream> stream; status = CreateStreamOnHGlobal(nullptr, TRUE, &stream); if (FAILED(status)) return status;
  ComPtr<IWICBitmapEncoder> encoder; status = factory->CreateEncoder(GUID_ContainerFormatPng, nullptr, &encoder); if (FAILED(status)) return status;
  status = encoder->Initialize(stream.Get(), WICBitmapEncoderNoCache); if (FAILED(status)) return status;
  ComPtr<IWICBitmapFrameEncode> frame; status = encoder->CreateNewFrame(&frame, nullptr); if (FAILED(status)) return status;
  status = frame->Initialize(nullptr); if (FAILED(status)) return status;
  UINT width = 0, height = 0; status = image->GetSize(&width, &height); if (FAILED(status)) return status;
  status = frame->SetSize(width, height); if (FAILED(status)) return status;
  WICPixelFormatGUID format = GUID_WICPixelFormat32bppBGRA; status = frame->SetPixelFormat(&format); if (FAILED(status)) return status;
  status = frame->WriteSource(image.Get(), nullptr); if (FAILED(status)) return status;
  status = frame->Commit(); if (FAILED(status)) return status;
  status = encoder->Commit(); if (FAILED(status)) return status;
  STATSTG stat{}; status = stream->Stat(&stat, STATFLAG_NONAME); if (FAILED(status)) return status;
  if (!stat.cbSize.QuadPart || stat.cbSize.QuadPart > maximumImageBytes) return E_INVALIDARG;
  HGLOBAL memory = nullptr; status = GetHGlobalFromStream(stream.Get(), &memory); if (FAILED(status)) return status;
  auto data = static_cast<unsigned char*>(GlobalLock(memory)); if (!data) return HRESULT_FROM_WIN32(GetLastError());
  png.assign(data, data + static_cast<size_t>(stat.cbSize.QuadPart)); GlobalUnlock(memory); return S_OK;
}
}
int Thumbnail(DWORD parentPid, bool pdf) {
  Handle parent(OpenProcess(SYNCHRONIZE, FALSE, parentPid));
  if (!parent.value || WaitForSingleObject(parent.value, 0) != WAIT_TIMEOUT) return 3;
  HANDLE observed = nullptr;
  if (!DuplicateHandle(GetCurrentProcess(), parent.value, GetCurrentProcess(), &observed, 0, FALSE, DUPLICATE_SAME_ACCESS)) return 3;
  Handle watcher(CreateThread(nullptr, 0, ParentEnded, observed, 0, nullptr));
  if (!watcher.value) { CloseHandle(observed); return 3; }
  try {
    const auto input = GetStdHandle(STD_INPUT_HANDLE), output = GetStdHandle(STD_OUTPUT_HANDLE);
    DWORD length = 0;
    if (!Transfer(input, &length, sizeof(length), false) || length < 14 || length > 12 + 32767 * 2) return 2;
    std::vector<unsigned char> request(length);
    if (!Transfer(input, request.data(), length, false)) return 2;
    uint32_t header[3]{}; memcpy(header, request.data(), sizeof(header));
    if (header[0] != 1 || header[1] < 1 || header[1] > 4096 || header[2] == 0 || header[2] > 32767 || length != 12 + header[2] * 2) return 2;
    std::wstring source(header[2], L'\0'); memcpy(source.data(), request.data() + 12, header[2] * 2);
    if (std::find(source.begin(), source.end(), L'\0') != source.end()) return 2;
    std::vector<unsigned char> png; const auto status = pdf ? EncodePdfThumbnail(source, header[1], png) : EncodeThumbnail(source, header[1], png);
    uint32_t response[] = { 1, static_cast<uint32_t>(status), static_cast<uint32_t>(png.size()) };
    length = static_cast<DWORD>(sizeof(response) + png.size());
    if (!Transfer(output, &length, sizeof(length), true) || !Transfer(output, response, sizeof(response), true)) return 3;
    if (!png.empty() && !Transfer(output, png.data(), static_cast<DWORD>(png.size()), true)) return 3;
    return 0;
  } catch (...) { return 3; }
}
}
