# ESP32-S3 默认固件 0.3.0

**By mondraker**

上电提供USB播放、人声清晰EQ、独立麦克风录音，DAC与Line Out各0dB，AEC默认关闭。Quick Start可切换[AEC免提通话](../../AEC.md)，或恢复原始录音。USB为48kHz／S16LE双向立体声，Codec从机，32bit×2 I²S时隙。

## 接线与板型

| S3 GPIO | AC101S信号 |
|---|---|
| 8 | MCLK |
| 9 | BCLK |
| 10 | LRCK／WS |
| 11 | SDIN，S3向Codec发送播放数据 |
| 12 | SDOUT，Codec向S3发送录音数据 |
| 13 | SDA |
| 14 | SCL |
| GND | 共地 |

GPIO19=D−、GPIO20=D+，使用原生USB／OTG音频口。USB转UART口用于烧录和日志。信号为3.3V逻辑，功放由板卡供电与使能电路控制。

0.3.0使用8MB八线PSRAM、240MHz和Newlib。AEC以16kHz单声道处理语音，再输出48kHz双声道录音；播放不经过AEC。USB身份仍303A:4005，桥接协议0.1。

## 镜像与更新

镜像：[默认固件-S3.bin](默认固件-S3.bin)。源码：[source](source/README.md)。[SHA-256校验](SHA256SUMS.txt)。当现有引导、分区采用0x10000作为应用起始地址，且应用分区空间足够时，更新应用：

```text
python -m esptool --chip esp32s3 --port <current-port> write-flash 0x10000 默认固件-S3.bin
```

保留现有引导、分区、NVS与PHY区。源码默认4MB Flash布局，与8MB PSRAM是不同配置；已有8MB Flash分区按实际布局使用。无八线PSRAM的板型可使用[0.2.1回退镜像](默认固件-S3-0.2.1.bin)，提供原声卡模式。

项目自有代码采用[CC BY-NC-SA 4.0](../../LICENSE)，第三方组件保留各自许可。
