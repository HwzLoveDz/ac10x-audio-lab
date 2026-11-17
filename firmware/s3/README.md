# ESP32-S3 默认固件 0.2.1

**By mondraker**

USB播放、人声清晰EQ、独立麦克风录音；DAC与Line Out各0dB，监听和数字回环关闭。48kHz／S16LE，32bit×2 I²S时隙，Codec从机，原生USB Full Speed。固件协议0.1，开发VID:PID为303A:4005。

## 接线

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

GPIO19=D−、GPIO20=D+，连接原生USB／OTG音频口。USB转UART口只负责烧录和日志。信号为3.3V逻辑；功放由板卡的供电与使能电路控制。确认开发板外设未占用GPIO8～14。

## 镜像与更新

应用镜像：`默认固件-S3.bin`。完整源码见[source](source/README.md)，校验见[SHA256SUMS.txt](SHA256SUMS.txt)。

当目标板引导和分区采用0x10000作为应用起始地址，且应用分区空间足够时，可更新应用：

```text
python -m esptool --chip esp32s3 --port <current-port> write-flash 0x10000 默认固件-S3.bin
```

源码默认4MB DIO80MHz布局，不使用PSRAM。已有8MB布局可按实际分区保留引导、NVS及PHY区，仅更新兼容的应用区。原生USB启动后切换为声卡接口，烧录端口随接口变化。

## 默认音频

上电自动配置USB播放、人声清晰EQ及独立录音。DAC与Line Out各0dB；麦克风监听、数字回环和测试音关闭。电脑播放选择AC10x Duplex。

项目自有源码使用[项目许可](../../LICENSE)，组件许可保留在源码licenses目录。
