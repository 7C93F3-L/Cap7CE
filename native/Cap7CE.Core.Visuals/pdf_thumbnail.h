#pragma once
#include "platform.h"
#include <vector>

namespace cap7ce::visuals {
HRESULT EncodePdfThumbnail(const std::wstring& source, UINT edge, std::vector<unsigned char>& png) noexcept;
}
