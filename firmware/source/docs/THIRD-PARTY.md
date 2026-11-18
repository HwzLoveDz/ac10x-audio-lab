# 构建组件

| 组件 | 版本／提交 | 许可位置 |
|---|---|---|
| ESP-IDF | 6.2 开发版，`c712a0dde385d659a1470a136251980d31a70bc1` | SDK 内的 Apache-2.0 及各组件许可 |
| TinyUSB | 0.21.0~5 对应分支 | [MIT](../components/tinyusb/LICENSE) |
| ESP-SR | `bb552f1a559396a17681299cb3e199a0f1a4520a` | [ESPRESSIF MIT License](../components/esp_aec_vendor/LICENSE)，适用于 Espressif 产品 |
| ESP-DL dl_fft | `512ed0b0dc5f5320f3d9ca5a5aea189803f87f31` | [MIT](../components/dl_fft/LICENSE) |
| FreeRTOS | ESP-IDF 对应版本 | [MIT](../licenses/FreeRTOS-MIT.md) |
| lwIP | ESP-IDF 对应版本 | [BSD](../licenses/lwIP-BSD.txt) |

编译器使用 Espressif GCC 16.1.0，S3 使用 Xtensa，S31 使用 RISC-V。ESP-SR 的预编译库、头文件及 FFT 源码随组件保留，来源和 SHA-256 记录在各组件的 `provenance.json` 中。
