idf_component_register(SRCS "main.c" "audio_bridge.c" "audio_pipe.c" "aec_service.c" "aec_resample.c" "usb_owner.c" "hid_bridge.c" "codec_default.c" "bridge_protocol.c" "usb_descriptors.c"
    INCLUDE_DIRS "."
    LDFRAGMENTS "usb_hot.lf"
    REQUIRES esp_aec_vendor esp_psram tinyusb esp_driver_i2s esp_driver_i2c esp_driver_gpio esp_hw_support esp_timer)
# This project owns the composite UAC2/HID descriptor and TinyUSB configuration.
idf_component_get_property(tusb_lib tinyusb COMPONENT_LIB)
target_include_directories(${tusb_lib} PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")

# Only this component's atomic objects are statically allocated in internal DRAM.
# Keep ISR epochs lock-free even when SDK defaults allow atomic objects in PSRAM.
if(CONFIG_IDF_TARGET_ESP32S3)
    target_compile_options(${COMPONENT_LIB} PRIVATE -mno-disable-hardware-atomics)
endif()
