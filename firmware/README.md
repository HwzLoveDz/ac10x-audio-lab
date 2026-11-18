# AC10x 桥接固件 / Bridge firmware

[中文](#中文) | [English](#english)

## 中文

ESP32-S3 和 ESP32-S31 共用 AC10x 桥接固件 **0.4.0**，提供 48 kHz 双向 USB 音频、AC101S 模拟／数字麦克风、人声清晰 EQ 和 AEC。开机启用 USB 播放和模拟麦克风，AEC 默认关闭。换接数字麦克风后，从 Quick Start 选择数字麦克风并应用方案。见[数字麦克风接线](../DMIC.md)。

按芯片下载应用镜像，烧录前核对 [SHA-256](SHA256SUMS.txt)。默认构建要求八线 PSRAM。

| 构建目标 / Target | VID:PID | USB | 默认 Flash 布局 / Default flash layout | 0.4.0 应用镜像 / App image |
|---|---|---|---|---|
| esp32s3 | 303A:4005 | Full Speed | 4 MB | [下载 / Download](images/AC10x-esp32s3-0.4.0-app.bin) |
| esp32s31 | 303A:4004 | High Speed / Full Speed | 16 MB（Korvo-1 V1.1） | [下载 / Download](images/AC10x-esp32s31-0.4.0-app.bin) |

接口使用 3.3 V 逻辑，与 Codec 共地。S3 的 GPIO19 接 D−、GPIO20 接 D+，使用原生 USB／OTG 口。S31 Korvo-1 V1.1 使用 J2 数据口和 J14，相关引脚被 LCD 占用时断开 LCD。两块板均使用独立的 UART 口烧录和看日志。模拟输入、功放和跳线见 [AC101S 板卡接线](../HARDWARE-SETUP.md)。

| Codec 信号 / Signal | 主控 GPIO / Host GPIO | S31 Korvo-1 V1.1 J14 |
|---|---|---|
| MCLK | GPIO8 | 13 |
| BCLK | GPIO9 | 16 |
| LRCK / WS | GPIO10 | 15 |
| SDIN（播放 / playback） | GPIO11 | 18 |
| SDOUT（录音 / capture） | GPIO12 | 17 |
| SDA | GPIO13 | 20 |
| SCL | GPIO14 | 19 |

通过 UART 更新前，确认板上应用分区从 `0x10000` 起始且空间足够。在镜像所在目录运行以下命令，替换目标、串口和镜像文件名。

```text
python -m esptool --chip <target> --port <port> write-flash 0x10000 <image>
```

ESP32-S31 在 write-flash 前加 --no-stub，并使用支持该芯片的 esptool。此命令只写应用分区，保留引导、分区表、NVS 和资源区。空白板或需要更换分区布局时，按[源码与构建](source/README.md)生成整套镜像。启动后在电脑选择 **AC10x Duplex**，在 Audio Lab 连接 **AC10x Register Bridge**。见[桥接协议](source/docs/PROTOCOL.md)和[历史版本](../releases/)。

## English

ESP32-S3 and ESP32-S31 share AC10x bridge firmware **0.4.0**. Both provide 48 kHz duplex USB audio, AC101S analog and digital microphone input, clear-vocal EQ, and AEC. At boot, USB playback and analog capture are enabled, and AEC is off. Follow the [DMIC wiring guide](../DMIC.en.md) for digital input, then choose Digital microphone in Quick Start and apply a setup.

Download your chip's application image from the table above and check its [SHA-256](SHA256SUMS.txt). The default builds require octal PSRAM.

Use 3.3 V logic and a common ground with the codec. On S3, native USB uses GPIO19 for D− and GPIO20 for D+. On the S31 Korvo-1 V1.1, use J2 for native USB data and J14 for the codec. Disconnect the LCD if it occupies those pins. Use the separate UART port for flashing and logs. See the [AC101S board wiring](../HARDWARE-SETUP.md) for the amplifier, analog input, and jumpers.

For an application update over UART, check that the installed app partition starts at `0x10000` and fits the image. Run the command above from the image directory with the correct target, port, and filename. For ESP32-S31, use an esptool release with chip support and add --no-stub before write-flash. The command preserves the bootloader, partition table, NVS, and resource partition. Build the full image set for blank hardware or a new partition layout. After boot, select **AC10x Duplex** on your computer and connect **AC10x Register Bridge** in Audio Lab. [Build instructions](source/README.md) · [Bridge protocol](source/docs/PROTOCOL.md) · [Previous releases](../releases/)
