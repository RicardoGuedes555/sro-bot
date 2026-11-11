#include "il2cpp_api.h"
#include <dlfcn.h>

int il2cpp_api_resolve(void* handle, Il2CppApi* api) {
    int missing = 0;
    auto sym = [&](const char* name, bool essential) -> void* {
        void* p = dlsym(handle, name);
        if (!p && essential) missing++;
        return p;
    };

    api->domain_get =
        reinterpret_cast<decltype(api->domain_get)>(sym("il2cpp_domain_get", true));
    api->thread_attach =
        reinterpret_cast<decltype(api->thread_attach)>(sym("il2cpp_thread_attach", true));
    api->thread_detach =
        reinterpret_cast<decltype(api->thread_detach)>(sym("il2cpp_thread_detach", false));
    api->domain_get_assemblies =
        reinterpret_cast<decltype(api->domain_get_assemblies)>(
            sym("il2cpp_domain_get_assemblies", true));
    api->assembly_get_image =
        reinterpret_cast<decltype(api->assembly_get_image)>(
            sym("il2cpp_assembly_get_image", true));
    api->image_get_name =
        reinterpret_cast<decltype(api->image_get_name)>(sym("il2cpp_image_get_name", true));
    api->image_get_class_count =
        reinterpret_cast<decltype(api->image_get_class_count)>(
            sym("il2cpp_image_get_class_count", true));
    api->image_get_class =
        reinterpret_cast<decltype(api->image_get_class)>(sym("il2cpp_image_get_class", true));
    api->class_get_name =
        reinterpret_cast<decltype(api->class_get_name)>(sym("il2cpp_class_get_name", true));
    api->class_get_namespace =
        reinterpret_cast<decltype(api->class_get_namespace)>(
            sym("il2cpp_class_get_namespace", false));
    api->class_from_name =
        reinterpret_cast<decltype(api->class_from_name)>(sym("il2cpp_class_from_name", false));
    api->class_get_field_from_name =
        reinterpret_cast<decltype(api->class_get_field_from_name)>(
            sym("il2cpp_class_get_field_from_name", false));
    api->field_get_offset =
        reinterpret_cast<decltype(api->field_get_offset)>(sym("il2cpp_field_get_offset", false));
    api->field_static_get_value =
        reinterpret_cast<decltype(api->field_static_get_value)>(
            sym("il2cpp_field_static_get_value", false));
    api->class_get_fields =
        reinterpret_cast<decltype(api->class_get_fields)>(sym("il2cpp_class_get_fields", false));
    api->field_get_name =
        reinterpret_cast<decltype(api->field_get_name)>(sym("il2cpp_field_get_name", false));
    api->class_get_parent =
        reinterpret_cast<decltype(api->class_get_parent)>(sym("il2cpp_class_get_parent", false));
    api->field_get_flags =
        reinterpret_cast<decltype(api->field_get_flags)>(sym("il2cpp_field_get_flags", false));
    api->class_get_method_from_name =
        reinterpret_cast<decltype(api->class_get_method_from_name)>(
            sym("il2cpp_class_get_method_from_name", false));
    api->runtime_invoke =
        reinterpret_cast<decltype(api->runtime_invoke)>(sym("il2cpp_runtime_invoke", false));
    api->object_get_class =
        reinterpret_cast<decltype(api->object_get_class)>(sym("il2cpp_object_get_class", false));
    api->class_get_methods =
        reinterpret_cast<decltype(api->class_get_methods)>(sym("il2cpp_class_get_methods", false));
    api->method_get_name =
        reinterpret_cast<decltype(api->method_get_name)>(sym("il2cpp_method_get_name", false));
    api->method_get_param_count =
        reinterpret_cast<decltype(api->method_get_param_count)>(
            sym("il2cpp_method_get_param_count", false));
    api->method_is_instance = reinterpret_cast<decltype(api->method_is_instance)>(
        sym("il2cpp_method_is_instance", false));
    api->method_get_param =
        reinterpret_cast<decltype(api->method_get_param)>(sym("il2cpp_method_get_param", false));
    api->type_get_name =
        reinterpret_cast<decltype(api->type_get_name)>(sym("il2cpp_type_get_name", false));
    api->free_mem = reinterpret_cast<decltype(api->free_mem)>(sym("il2cpp_free", false));
    api->string_new = reinterpret_cast<decltype(api->string_new)>(sym("il2cpp_string_new", false));
    api->field_get_type =
        reinterpret_cast<decltype(api->field_get_type)>(sym("il2cpp_field_get_type", false));
    return missing;
}
