#include "pdf_thumbnail.h"
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Data.Pdf.h>
#include <winrt/Windows.Storage.h>
#include <winrt/Windows.Storage.Streams.h>
#include <algorithm>
#include <cmath>

namespace cap7ce::visuals {
HRESULT EncodePdfThumbnail(const std::wstring& source, UINT edge, std::vector<unsigned char>& png) noexcept {
  try {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
    struct Apartment { ~Apartment() { winrt::uninit_apartment(); } } apartment;
    const auto file = winrt::Windows::Storage::StorageFile::GetFileFromPathAsync(source).get();
    const auto document = winrt::Windows::Data::Pdf::PdfDocument::LoadFromFileAsync(file).get();
    if (!document.PageCount()) return E_INVALIDARG;
    const auto page = document.GetPage(0);
    const auto size = page.Size();
    if (!std::isfinite(size.Width) || !std::isfinite(size.Height) || size.Width <= 0 || size.Height <= 0) return E_INVALIDARG;
    const double scale = std::min(edge / static_cast<double>(size.Width), edge / static_cast<double>(size.Height));
    const auto width = static_cast<uint32_t>(std::max(1.0, std::ceil(size.Width * scale)));
    const auto height = static_cast<uint32_t>(std::max(1.0, std::ceil(size.Height * scale)));
    if (static_cast<uint64_t>(width) * height > 16000000) return E_INVALIDARG;
    winrt::Windows::Data::Pdf::PdfPageRenderOptions options;
    options.DestinationWidth(width); options.DestinationHeight(height);
    winrt::Windows::Storage::Streams::InMemoryRandomAccessStream stream;
    page.RenderToStreamAsync(stream, options).get();
    if (!stream.Size() || stream.Size() > 40 * 1024 * 1024) return E_INVALIDARG;
    winrt::Windows::Storage::Streams::DataReader reader(stream.GetInputStreamAt(0));
    const auto count = static_cast<uint32_t>(stream.Size());
    if (reader.LoadAsync(count).get() != count) return E_FAIL;
    png.resize(count); reader.ReadBytes(png);
    reader.Close(); stream.Close(); page.Close();
    return S_OK;
  } catch (...) { png.clear(); return winrt::to_hresult(); }
}
}
