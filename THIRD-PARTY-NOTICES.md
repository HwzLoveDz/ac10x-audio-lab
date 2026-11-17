# 第三方组件

项目自有代码和文档采用[项目许可](LICENSE)，以下组件沿用各自版权与许可。

| 组件 | 版本／来源 | 许可 |
|---|---|---|
| TinyUSB | 固件源码中的对应分支 | MIT |
| ESP-IDF | 固件构建使用的 Espressif SDK | Apache-2.0 及各组件许可 |
| ESP-SR | `bb552f1a559396a17681299cb3e199a0f1a4520a`，S3 预编译 AEC 库 | ESPRESSIF MIT License，适用于 Espressif 产品 |
| dl_fft / ESP-DL | `512ed0b0dc5f5320f3d9ca5a5aea189803f87f31` | MIT |
| FreeRTOS | ESP-IDF 对应版本 | MIT |
| lwIP | ESP-IDF 对应版本 | BSD |
| jsdom | 26.1.0 | MIT |
| axe-core | 4.14.0 | MPL-2.0 |
| fast-check | 4.10.2 | MIT |
| @resvg/resvg-js | 2.6.2 | MPL-2.0 |

网页开发依赖由 `package-lock.json` 固定。固件组件来源和许可证位置见[构建组件](firmware/s3/source/docs/THIRD-PARTY.md)。
