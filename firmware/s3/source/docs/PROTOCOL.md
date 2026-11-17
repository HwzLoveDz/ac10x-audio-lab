# 固件和网页契约

固件版本0.2.0（S3默认固件），HID协议0.1，USB `bcdDevice=0x0200`（设备版本字段，独立于固件SemVer）。S3仅使用内部USB Full Speed PHY，GPIO19 D− / GPIO20 D+；名称为 AC10x S3 Duplex。开发VID/PID为303A:4005；S31原桥为303A:4004。

## 音频

- UAC2，固定48000 Hz，立体声S16LE，录音与播放各192000 B/s；USB不是24 bit格式。
- 播放OUT01、显式反馈IN82（4字节）、录音IN83；数据端点最大196 B、每1 ms服务一次。
- I²S0主机，Philips格式，16 bit样本、双声道32 bit槽、MCLK倍数256。实际时钟与品质尚未在S3验证。
- I²S工作线程与USB拥有者分核，经过有界复制队列；复位、拔插、休眠及alt-setting变化使旧代次数据失效。
- 录音新会话显式插入4 ms零PCM预填充；后续数据来自外部I²S，不是合成测试音。

## HID / I²C

Vendor usage page FF00，usage1，Report ID0，OUT和IN payload均严格10字节；WebHID不包含Windows API中额外的报告ID前缀。

普通请求：`[cmd,1,bus8,reg_hi,reg_lo,data_hi_or_byte,data_lo_or_zero,width,0,0]`。

- cmd=0写、1读；16 bit寄存器地址时cmd加10h。width为1或2，数据/寄存器宽度分开处理。
- bus8为偶数8位线上写地址，例如7位33h对应66h；不接受67h读地址作请求地址。
- 读响应：`[cmd,1,data_hi_or_byte,data_lo_or_zero,reg_hi,reg_lo,width,success,bus8,0]`。
- 写响应：`[cmd,1,data_hi_or_byte,data_lo_or_zero,reg_hi,reg_lo,width,bus8,success,0]`。
- I²C配置400 kHz，单笔驱动超时20 ms。错误计数并不等价于音质指标。

时钟命令：`[2,1,on,0,0,0,0,0,0,0]`，on只能0或1，响应byte2回显，byte8成功标志。网页要求当前系统音频流先停止，并显式勾选允许切换。

只读状态命令7Eh：响应 `[7e,1,0,1,gate,playback,capture,i2cErrorsLow8,1,busyLow8]`。第2/3字节是协议版本0.1，不是固件版本；固件版本由应用描述和启动日志给出。

命令3和未知命令不执行擦除/重启；错误长度、Report ID及类型不进入请求队列。固件在启动时、暴露USB前初始化AC101S默认配置，见DEFAULT-PROFILE.md；后续USB连接、查询和重连不重放参数。网页和固件串行化请求；没有事务ID，超时后不能盲目继续以免迟到应答串入下一笔。

启动初始化只拥有AC101S默认表所列的83个普通RW掩码；未知ID不会触发初始化写入。其余手动HID传输仍不推断各Codec寄存器的RO/W1C/复位语义。完整Audio Lab负责芯片模型和掩码；独立诊断页的手动写入只适用于已核对的普通RW寄存器。
