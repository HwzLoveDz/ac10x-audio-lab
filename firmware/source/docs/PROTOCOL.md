# AC10x USB 音频与控制协议

S3 和 S31 固件使用 HID 协议 0.1。S3 的 USB 设备版本字段为 `bcdDevice=0x0200`，S31 为 `0x0302`。

音频端点名称为 **AC10x Duplex**，HID 接口名称为 **AC10x Register Bridge**。USB 标识和接线见[板型表](../../README.md)。

## 音频

- UAC2，固定 48000 Hz，立体声 S16LE，录音与播放各 192000 B/s。
- 播放端点 OUT01、显式反馈 IN82（4 字节）、录音端点 IN83。Full Speed 音频端点最大 196 B，每 1 ms 服务一次；S31 的 High Speed 描述符使用 28 B、125 µs。
- I²S0 为主机，使用 Philips 格式、16 bit 样本和双声道 32 bit 时隙；MCLK 为采样率的 256 倍，即 12.288 MHz。
- I²S 与 USB 任务分核运行，通过有界队列交换数据；复位、拔插、休眠和 alt-setting 变化时丢弃旧会话数据。
- 录音新会话预填充 4 ms 零 PCM，随后使用 I²S 采集数据；AEC 模式输出回声消除后的录音。

## HID / I²C

Vendor usage page 为 `0xFF00`，usage 为 1，Report ID 为 0，OUT 和 IN 载荷均为 10 字节。Windows HID API 的缓冲区额外包含报告 ID 前缀，WebHID 载荷不含此前缀。

普通请求：`[cmd,1,bus8,reg_hi,reg_lo,data_hi_or_byte,data_lo_or_zero,width,0,0]`。

- cmd 为 0（写）或 1（读）；使用 16 bit 寄存器地址时，cmd 加 `0x10`。width 为 1 或 2，表示数据字节数。
- bus8 为 8 bit 总线写地址，例如 7 bit 地址 `0x33` 对应 `0x66`。
- 读响应：`[cmd,1,data_hi_or_byte,data_lo_or_zero,reg_hi,reg_lo,width,success,bus8,0]`。
- 写响应：`[cmd,1,data_hi_or_byte,data_lo_or_zero,reg_hi,reg_lo,width,bus8,success,0]`。
- I²C配置400 kHz，单笔驱动超时20 ms。

时钟命令为 `[2,1,on,0,0,0,0,0,0,0]`，on 为 0 或 1。应答的 byte2 回显开关值，byte8 为成功标记。切换前停止系统播放和录音。

`0x7E` 查询桥接状态，应答为 `[0x7E,1,0,1,gate,playback,capture,i2cErrorsLow8,1,busyLow8]`。byte2 和 byte3 表示协议版本 0.1，应用固件版本见应用描述或启动日志。

未知命令返回失败应答；报告长度、Report ID 或类型错误时拒绝入队。HID 请求按顺序处理，超时后需断开并重新连接，以隔离迟到应答。

固件在开放 USB 前检查芯片 ID，并按默认表的 83 项 RW 掩码初始化 AC101S，见[默认配置](../../../DEFAULT-FIRMWARE.json)。后续连接、查询和重连保留当前参数。

Audio Lab 按芯片模型执行掩码读写与核验。

## AEC 扩展

`0x7D` 只读查询 AEC 状态，`0x7C` 设置开关。设置请求为 `[0x7C,1,on,0,0,0,0,0,0,0]`，on 为 0（关闭）或 1（开启）；查询请求为 `[0x7D,1,0,0,0,0,0,0,0,0]`。报告长度为 10 字节，以下字段使用从 0 开始的字节序号：

| 字节 | 应答内容 |
|---|---|
| 0 | 请求命令 `0x7C` 或 `0x7D` |
| 1 | 标识 `0xAE` |
| 2 | 扩展版本 1 |
| 3 | AEC 能力标记 1 |
| 4 | 当前开关状态，0 或 1 |
| 5 | 故障计数低 8 位 |
| 6 | 丢块计数低 8 位 |
| 7 | 最大算法处理时间，单位 ms |
| 8 | 0 为失败，1 为成功 |
| 9 | 已处理帧数低 8 位 |

旧固件的零填充应答表示不支持 AEC。设置完成后，应答需同时包含成功标记和所请求的开关状态。启用 AEC 前固件检查 MIC／PLAY 路由；配置与使用方法见[AEC 设置](../../../AEC.md)。

## 音频能力查询

`0x7A` 为只读命令，请求为 `[0x7A,1,0,0,0,0,0,0,0,0]`。具备所需 PSRAM 的 0.4.0 固件应答为 `[0x7A,0xD4,1,7,0,4,0,48,48,1]`。AEC 服务不可用时，能力字节为 5。

| 字节 | 内容 |
|---|---|
| 0 | 命令 0x7A |
| 1 | 标识 0xD4 |
| 2 | 扩展版本 1 |
| 3 | bit0：48 kHz DMIC；bit1：AEC；bit2：AMIC |
| 4–6 | 固件主版本、次版本、修订号 |
| 7 | USB 采样率，单位 kHz |
| 8 | I²S 采样率，单位 kHz |
| 9 | 成功标记 1 |

旧固件返回的零填充表示没有此扩展，不影响模拟输入和原有 AEC 查询。此命令报告固件能力；麦克风当前选择由 `ADC_DIG_CTRL 0x19[7]` 读回。AEC 模式和桥接状态分别沿用 `0x7C/0x7D`、`0x7E`，桥接协议保持 0.1。
