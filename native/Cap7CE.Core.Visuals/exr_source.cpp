#include "exr_source.h"
#include <OpenEXR/ImfChannelList.h>
#include <OpenEXR/ImfFrameBuffer.h>
#include <OpenEXR/ImfHeader.h>
#include <OpenEXR/ImfInputPart.h>
#include <OpenEXR/ImfMultiPartInputFile.h>
#include <OpenEXR/ImfPartType.h>
#include <OpenEXR/ImfStdIO.h>
#include <OpenEXR/ImfTiledInputPart.h>
#include <filesystem>
#include <optional>
#include <stdexcept>

namespace cap7ce::visuals {
namespace {
constexpr int64_t maximumPixels = 16000000;
std::optional<std::string> ColorPrefix(const Imf::ChannelList& channels) {
  const auto complete = [&](const std::string& prefix) {
    for (const auto component : {"R", "G", "B"}) {
      const auto channel = channels.findChannel(prefix + component);
      if (!channel || channel->xSampling != 1 || channel->ySampling != 1) return false;
    }
    return true;
  };
  for (const auto prefix : {"Composite.Combined.", "", "ViewLayer.Combined.", "Combined."})
    if (complete(prefix)) return prefix;
  for (auto channel = channels.begin(); channel != channels.end(); ++channel) {
    const std::string name(channel.name());
    if (name.ends_with(".Combined.R") && complete(name.substr(0, name.size() - 1))) return name.substr(0, name.size() - 1);
  }
  return std::nullopt;
}
std::pair<int, int> Dimensions(const Imath::Box2i& window) {
  const auto width = int64_t(window.max.x) - window.min.x + 1, height = int64_t(window.max.y) - window.min.y + 1;
  if (width < 1 || height < 1 || width > 32768 || height > 32768 || width * height > maximumPixels)
    throw std::runtime_error("EXR image dimensions exceed the preview limit.");
  return {static_cast<int>(width), static_cast<int>(height)};
}
}
ExrImage ReadExrImage(const std::wstring& source) {
  std::ifstream input(std::filesystem::path(source), std::ios::binary | std::ios::ate);
  if (!input || input.tellg() <= 0 || input.tellg() > 512LL * 1024 * 1024) throw std::runtime_error("EXR source size is unsupported.");
  input.seekg(0);
  Imf::StdIFStream stream(input, "EXR preview");
  Imf::MultiPartInputFile file(stream, 2, false);
  if (file.parts() < 1 || file.parts() > 16) throw std::runtime_error("EXR part count exceeds the preview limit.");
  for (int part = 0; part < file.parts(); ++part) {
    const auto& header = file.header(part);
    if (header.type() != Imf::SCANLINEIMAGE && header.type() != Imf::TILEDIMAGE) continue;
    int channels = 0;
    for (auto channel = header.channels().begin(); channel != header.channels().end(); ++channel)
      if (++channels > 128) throw std::runtime_error("EXR channel count exceeds the preview limit.");
    const auto prefix = ColorPrefix(header.channels()); if (!prefix) continue;
    const auto data = header.dataWindow(), display = header.displayWindow();
    const auto [width, height] = Dimensions(data); const auto [displayWidth, displayHeight] = Dimensions(display);
    ExrImage image{width, height, data.min.x, data.min.y, displayWidth, displayHeight, display.min.x, display.min.y, {}};
    image.pixels.resize(static_cast<size_t>(width) * height);
    Imf::FrameBuffer frame;
    for (int component = 0; component < 4; ++component) {
      const auto name = *prefix + "RGBA"[component]; const auto channel = header.channels().findChannel(name);
      if (component == 3 && !channel) continue;
      if (!channel || channel->xSampling != 1 || channel->ySampling != 1) throw std::runtime_error("EXR sampled color channel is unsupported.");
      auto* pixels = reinterpret_cast<float*>(image.pixels.data()) + component;
      frame.insert(name, Imf::Slice::Make(Imf::FLOAT, pixels, data, sizeof(ExrPixel), sizeof(ExrPixel) * width));
    }
    if (header.type() == Imf::TILEDIMAGE) {
      Imf::TiledInputPart selected(file, part); selected.setFrameBuffer(frame);
      selected.readTiles(0, selected.numXTiles() - 1, 0, selected.numYTiles() - 1);
    } else {
      Imf::InputPart selected(file, part); selected.setFrameBuffer(frame); selected.readPixels(data.min.y, data.max.y);
    }
    return image;
  }
  throw std::runtime_error("EXR contains no supported RGB composite image.");
}
}
