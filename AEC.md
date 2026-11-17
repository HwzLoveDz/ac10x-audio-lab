# S3 AEC 免提通话

AEC 使用扬声器的播放信号作为参考，减少麦克风录音中的回声。需要 S3 0.3.0 固件和八线 PSRAM，AC101S 接线见[S3 GPIO 表](firmware/s3/README.md)。

## 使用

1. 连接 S3，等待读回参数。
2. 打开 **Quick Start**，选择“AEC 免提通话”，点击“写入并核验”。
3. 在通话软件中选择 **AC10x Duplex** 作为播放和录音设备。

默认上电为 USB 声卡模式，AEC 关闭。选择“默认固件 · USB 声卡”可恢复原始麦克风录音和人声清晰播放。手动写寄存器会关闭 AEC，调整后可重新应用 AEC 方案。

通话软件若自带回声消除，可关闭其 AEC 后比较 S3 的处理效果。调整播放和录音增益，避免扬声器或麦克风削波。

## 音频处理

AC101S 的 TX 左路提供 EQ／音量处理后的 PLAY 参考，右路提供 MIC；两路使用同一 I²S 时钟采集。ESP-SR `AEC_MODE_FD_LOW_COST` 配合 `NLP NORMAL` 处理回声。

USB 使用 48 kHz、双声道 S16LE。算法将输入降采样至 16 kHz 单声道，再将结果转换为 48 kHz，复制到 USB 录音左右路；语音带宽约 7 kHz。AEC 仅处理录音，分帧和队列会增加录音延迟。

## 控制与开发

S3 使用 `0x7D` 查询 AEC 状态，使用 `0x7C` 设置开关；HID 报告仍为 10 字节，桥接协议仍为 0.1。启用失败或取消时，网页关闭 AEC 并尝试恢复上一套寄存器配置。报文定义见[固件协议](firmware/s3/source/docs/PROTOCOL.md)。

完整上位机构建与测试：

```powershell
node qa/build.cjs
node qa/verify-aec.cjs
npm test
```

固件构建方法、SDK 版本和依赖见[源码说明](firmware/s3/source/README.md)。
