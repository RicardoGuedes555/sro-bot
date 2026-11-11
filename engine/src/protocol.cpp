#include "protocol.h"
#include <algorithm>
#include <cstring>

namespace proto {

std::string frame(const char* tag, const std::string& json, uint32_t a, uint32_t b) {
    Header h{};
    std::memset(h.tag, 0, 4);
    std::memcpy(h.tag, tag, std::min<size_t>(4, std::strlen(tag)));
    h.a = a;
    h.b = b;
    h.len = static_cast<uint32_t>(json.size());
    std::string out;
    out.resize(sizeof(Header));
    std::memcpy(out.data(), &h, sizeof(Header));
    out += json;
    return out;
}

}  // namespace proto
