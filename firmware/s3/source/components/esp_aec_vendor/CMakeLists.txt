idf_component_register(INCLUDE_DIRS "include" REQUIRES heap dl_fft)
add_prebuilt_library(aec_processor "${CMAKE_CURRENT_SOURCE_DIR}/lib/libesp_audio_processor.a" REQUIRES heap dl_fft)
add_prebuilt_library(aec_dl "${CMAKE_CURRENT_SOURCE_DIR}/lib/libdl_lib.a" REQUIRES heap dl_fft)
target_link_libraries(${COMPONENT_LIB} INTERFACE "-Wl,--start-group" aec_processor aec_dl "-Wl,--end-group")
