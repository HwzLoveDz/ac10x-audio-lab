# AC101S 硬件接线核对

适用于本次确认的 AC101S 实板；AC102、其他板版不能仅凭相同 ID 沿用。

1. **先读 U1 实际型号。** 软件 ID 0x12 不能独立区分 AC101S 与 AC102。
2. **AC101S 第3脚是 GND，应接 AGND。** 随包 AC101S 数据手册第7页如此定义。评估板图虽标了 NOSWM，不能据此把 AC101S 的3脚当作 AC102 的免软件模式输入。本板 H19 在图纸中1脚AGND、2脚芯片3脚、3脚VCC；只在确认板版及全断电后按实物连通关系处理，不能带电换帽。
3. 裸两脚 ECM 用 MIC1；本板 H28 接通偏置，H29 的1–2和3–4接通信号。麦克风极性及真实连通应按对应板图确认。此板正常实测 H28约2.35V，MIC1两端对AGND约2.11V／0.23V；这些是本次读数，不是所有咪头的通用合格范围。
4. S31默认固件接USB后即作为声卡；系统选择 AC10x Duplex 播放。默认人声清晰、麦克风独立录音，不开反馈监听。Quick Start恢复同一参数，不烧录固件。
5. 上位机走本地 HTTP：`http://127.0.0.1:47881/`。HID控制连接与录音输入分别选择。测量录音应关闭目标输入的系统音效（含Voice Clarity）；浏览器关闭降噪不能证明系统处理已旁路。等待录音权限时可点“停止并保留”取消；未获得实际权限不等于录音通过。

本次3脚由VCC改接AGND后，偏置关闭实际降到接近0V，ECM测试音下降约41dB；1500Hz下12dB PGA步进实测约11.5～11.9dB。说明控制已恢复，不代表所有模拟音质指标均合格。详见 [整改与复测](FOLLOWUP-HARDWARE-REVIEW.md)。

English: Verify the actual chip marking. AC101S pin 3 is GND (datasheet p.7); the reused NOSWM board label is not an AC101S mode specification. Disconnect all power before changing board wiring. ID 0x12 is not unique. Use loopback HTTP, select HID and audio input separately, and disable only the target input's system audio effects for measurements. Quick Start restores parameters; it does not flash firmware.
