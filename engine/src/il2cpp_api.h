// Ponteiros para as funcoes publicas exportadas pelo libil2cpp.so.
// Nao e o SDK do Unity: sao so os simbolos il2cpp_* que o runtime ja expoe.
// Resolvidos por dlsym em tempo de execucao. Nada aqui decifra nada; o jogo
// ja carregou e decifrou os assemblies, e aqui so os lemos pelo nome.
#pragma once
#include <cstdint>

using Il2CppDomain = void;
using Il2CppAssembly = void;
using Il2CppImage = void;
using Il2CppClass = void;
using Il2CppObject = void;
using Il2CppThread = void;
using FieldInfo = void;

struct Il2CppApi {
    Il2CppDomain* (*domain_get)();
    Il2CppThread* (*thread_attach)(Il2CppDomain*);
    void (*thread_detach)(Il2CppThread*);
    const Il2CppAssembly** (*domain_get_assemblies)(const Il2CppDomain*, size_t*);
    const Il2CppImage* (*assembly_get_image)(const Il2CppAssembly*);
    const char* (*image_get_name)(const Il2CppImage*);
    size_t (*image_get_class_count)(const Il2CppImage*);
    const Il2CppClass* (*image_get_class)(const Il2CppImage*, size_t);
    const char* (*class_get_name)(Il2CppClass*);
    const char* (*class_get_namespace)(Il2CppClass*);
    Il2CppClass* (*class_from_name)(const Il2CppImage*, const char*, const char*);
    FieldInfo* (*class_get_field_from_name)(Il2CppClass*, const char*);
    size_t (*field_get_offset)(FieldInfo*);
    void (*field_static_get_value)(FieldInfo*, void*);
    // iteracao de campos de uma classe
    FieldInfo* (*class_get_fields)(Il2CppClass*, void** iter);
    const char* (*field_get_name)(FieldInfo*);
    Il2CppClass* (*class_get_parent)(Il2CppClass*);
    int (*field_get_flags)(FieldInfo*);
    // invocar metodos (para resolver o singleton pelo getter, sem tocar
    // estaticos nao inicializados de outras classes)
    const void* (*class_get_method_from_name)(Il2CppClass*, const char* name, int argc);
    Il2CppObject* (*runtime_invoke)(const void* method, void* obj, void** params, void** exc);
    Il2CppClass* (*object_get_class)(Il2CppObject*);
    // enumeracao de metodos
    const void* (*class_get_methods)(Il2CppClass*, void** iter);
    const char* (*method_get_name)(const void*);
    uint32_t (*method_get_param_count)(const void*);
    bool (*method_is_instance)(const void*);  // false = estatico
    const void* (*method_get_param)(const void* method, uint32_t index);  // Il2CppType*
    char* (*type_get_name)(const void* type);  // alocado pelo il2cpp: liberar com free_mem
    void (*free_mem)(void*);                   // il2cpp_free
    void* (*string_new)(const char* utf8);     // il2cpp_string_new (arg string de metodo)
    const void* (*field_get_type)(FieldInfo*);  // Il2CppType*
};

// Flags de campo (subset do ECMA-335): bit de estatico.
constexpr int FIELD_ATTR_STATIC = 0x10;

// Preenche api resolvendo cada simbolo no handle do libil2cpp. Devolve o
// numero de simbolos essenciais que faltaram (0 = tudo certo).
int il2cpp_api_resolve(void* handle, Il2CppApi* api);
