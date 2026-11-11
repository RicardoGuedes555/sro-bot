// Loader: substitui o libmain.so do jogo.
//
// Quando o Android carrega o libmain.so da app, chama o JNI_OnLoad dele. Este
// loader encaminha esse JNI_OnLoad para o jogo original (renomeado para
// libcore.so) e, de passagem, carrega o nosso engine (libsroengine.so), cujo
// constructor sobe a thread do engine.
//
// Reversivel: basta restaurar o libmain.so original.

#include <android/log.h>
#include <dlfcn.h>
#include <jni.h>

#define LOG(...) __android_log_print(ANDROID_LOG_INFO, "SROLOADER", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "SROLOADER", __VA_ARGS__)

extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* reserved) {
    LOG("loader ativo");

    // Carrega o nosso engine. O constructor dele sobe a thread; se falhar,
    // o jogo segue normal.
    void* eng = dlopen("libsroengine.so", RTLD_NOW | RTLD_GLOBAL);
    if (!eng) LOGE("engine nao carregou: %s", dlerror());

    // Carrega o jogo original e encaminha o JNI_OnLoad dele.
    void* orig = dlopen("libcore.so", RTLD_NOW | RTLD_GLOBAL);
    if (!orig) {
        LOGE("libcore.so (jogo original) nao carregou: %s", dlerror());
        return JNI_VERSION_1_6;
    }
    auto real = reinterpret_cast<jint (*)(JavaVM*, void*)>(dlsym(orig, "JNI_OnLoad"));
    if (!real) {
        LOGE("JNI_OnLoad do original ausente");
        return JNI_VERSION_1_6;
    }
    return real(vm, reserved);
}
