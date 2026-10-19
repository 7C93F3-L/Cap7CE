#pragma once
#include <windows.h>
#include <wincodec.h>
#include <wrl/client.h>

namespace cap7ce::visuals {
HRESULT DecodeIconPixels(HICON icon, UINT width, UINT height, IWICImagingFactory* factory, Microsoft::WRL::ComPtr<IWICBitmap>& image);
}
