// Mesmo enquadramento do srobot/engine_channel.py:
//   cabecalho little-endian: tag[4], a:uint32, b:uint32, len:uint32
//   corpo: JSON em UTF-8 (len bytes)
// O engine e o lado servidor: escuta, recebe CONN e responde OKAY.
#pragma once
#include <cstdint>
#include <string>

namespace proto {

#pragma pack(push, 1)
struct Header {
    char tag[4];
    uint32_t a;
    uint32_t b;
    uint32_t len;
};
#pragma pack(pop)
static_assert(sizeof(Header) == 16, "cabecalho deve ter 16 bytes");

// Serializa um frame (tag + json) num buffer pronto para enviar.
std::string frame(const char* tag, const std::string& json, uint32_t a = 0, uint32_t b = 0);

}  // namespace proto
