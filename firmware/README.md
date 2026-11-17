# S31 默认固件 0.3.3

USB声卡播放、人声清晰EQ和独立麦克风录音。DAC与Line Out均0dB，监听和数字回环关闭。

镜像：`默认固件.bin`。源码：`默认固件源码.zip`。用于ESP32-S31对应的应用分区，校验见[SHA256SUMS.txt](SHA256SUMS.txt)。

启动配置与Quick Start共用83项寄存器掩码。人声清晰参数为180Hz−3dB、2.5kHz+3dB、8kHz+1.5dB，前级−4dB。

ESP32-S3使用独立的[S3固件和GPIO接线](s3/README.md)。项目许可见[LICENSE](../LICENSE)，第三方组件沿用原许可。
