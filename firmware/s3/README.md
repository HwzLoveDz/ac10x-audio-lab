# ESP32-S3 默认固件 0.3.1

**By mondraker**

上电提供 USB 播放、人声清晰 EQ 和独立麦克风录音，DAC 与 Line Out 均为 0 dB，AEC 默认关闭。在 Quick Start 中可切换[AEC 免提通话](../../AEC.md)，或恢复原始录音。

上电录音默认为 AMIC。使用 DMIC 时，在完整上位机 Quick Start 中选择数字麦克风并应用方案；断电重启后重新选择。数字输入接线见[DMIC 设置](../../DMIC.md)。

## 接线

| S3 GPIO | AC101S 信号 |
|---|---|
| 8 | MCLK |
| 9 | BCLK |
| 10 | LRCK / WS |
| 11 | SDIN，接收 S3 的播放数据 |
| 12 | SDOUT，向 S3 输出录音数据 |
| 13 | SDA |
| 14 | SCL |
| GND | 共地 |

GPIO19 为 D−、GPIO20 为 D+，连接原生 USB / OTG 音频口。USB 转 UART 口用于烧录和日志。接口采用 3.3 V 逻辑，功放由板卡的供电与使能电路控制。

## 音频与板型

USB 为 Full Speed，提供 48 kHz、S16LE 双向立体声音频。I²S 使用两个 32 bit 时隙，Codec 为从机。USB VID:PID 为 303A:4005，桥接协议为 0.1。

AEC 使用八线 PSRAM，以 16 kHz 单声道处理语音，再输出 48 kHz 双声道录音。固件配置为 240 MHz 和 Newlib。无八线 PSRAM 的板型可使用[0.2.1 声卡固件](默认固件-S3-0.2.1.bin)。

## 更新应用

- [0.3.1 应用镜像](默认固件-S3.bin)
- [源码与构建方法](source/README.md)
- [SHA-256 校验](SHA256SUMS.txt)

现有分区的应用起始地址为 `0x10000`，且空间足够时，可用以下命令更新应用：

```text
python -m esptool --chip esp32s3 --port <current-port> write-flash 0x10000 默认固件-S3.bin
```

保留原引导、分区表、NVS 和 PHY 区。源码默认使用 4 MB Flash 分区布局；已有其他布局时，按实际应用分区更新。

项目自有代码采用 [CC BY-NC-SA 4.0](../../LICENSE)，第三方组件沿用各自许可。
