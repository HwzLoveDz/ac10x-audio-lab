#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:-build/host-tests}"
mkdir -p "$out"
vendor=components/tinyusb/src
sed '/#include "sdkconfig.h"/d; /#include "esp_attr.h"/d; s/OPT_OS_FREERTOS/OPT_OS_NONE/; s/DRAM_ATTR//' main/tusb_config.h > "$out/host_config.h"
printf '\n#define CFG_TUSB_MCU OPT_MCU_NONE\n#define TUP_DCD_ENDPOINT_MAX 8\n' >> "$out/host_config.h"
for entry in MCLK:8 BCLK:9 LRCK:10 DOUT:11 DIN:12 SDA:13 SCL:14; do
    printf '#define CONFIG_BRIDGE_%s_GPIO %s\n' "${entry%:*}" "${entry#*:}"
done > "$out/sdkconfig.h"
flags=(-std=c11 -Wall -Wextra -Werror -g -pthread -fsanitize=address,undefined -fno-omit-frame-pointer)
includes=(-Itools/host/include -Imain -I"$out" -I"$vendor" '-DCFG_TUSB_CONFIG_FILE="host_config.h"')
gcc "${flags[@]}" -Imain main/bridge_protocol.c tools/test_protocol.c -o "$out/test_protocol"
"$out/test_protocol"
gcc "${flags[@]}" -Imain main/codec_default.c tools/test_codec_default.c -o "$out/test_codec_default"
"$out/test_codec_default"
gcc "${flags[@]}" "${includes[@]}" -include tools/host/include/fifo_hook.h -c "$vendor/common/tusb_fifo.c" -o "$out/fifo.o"
gcc "${flags[@]}" "${includes[@]}" main/audio_pipe.c main/usb_owner.c main/usb_descriptors.c tools/host/queue.c tools/test_audio_pipe.c "$out/fifo.o" -o "$out/test_audio_pipe"
"$out/test_audio_pipe"
