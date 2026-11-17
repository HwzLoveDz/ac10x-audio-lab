idf_component_register(SRCS "main.c" "audio_bridge.c" "audio_pipe.c" "usb_owner.c" "hid_bridge.c" "codec_default.c" "bridge_protocol.c" "usb_descriptors.c"
    INCLUDE_DIRS "."
    LDFRAGMENTS "usb_hot.lf"
    REQUIRES tinyusb esp_driver_i2s esp_driver_i2c esp_driver_gpio esp_hw_support esp_timer)
# This project owns the composite UAC2/HID descriptor and TinyUSB configuration.
idf_component_get_property(tusb_lib tinyusb COMPONENT_LIB)
target_include_directories(${tusb_lib} PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
