idf_component_register(INCLUDE_DIRS "include" REQUIRES heap dl_fft)
# ESP-SR exposes the same AEC API on both targets, but the libraries use different ISAs.
set(aec_lib_dir "${CMAKE_CURRENT_SOURCE_DIR}/lib")
if(CONFIG_IDF_TARGET_ESP32S31)
    string(APPEND aec_lib_dir "/esp32s31")
endif()
add_prebuilt_library(aec_processor "${aec_lib_dir}/libesp_audio_processor.a" REQUIRES heap dl_fft)
add_prebuilt_library(aec_dl "${aec_lib_dir}/libdl_lib.a" REQUIRES heap dl_fft)
target_link_libraries(${COMPONENT_LIB} INTERFACE "-Wl,--start-group" aec_processor aec_dl "-Wl,--end-group")
