# S3 AEC免提通话

Quick Start → AEC免提通话 → 写入并核验。S3需要配套AEC固件0.3.0，AC101S接线沿用GPIO8–14。

播放路径保留USB声卡和人声清晰EQ。AC101S的TX左路提供PLAY（EQ/DVC后的播放参考），右路提供MIC录音；两路由同一I²S时钟同步采集。ESP-SR FD_LOW_COST在S3中运行自适应回声消除及常规残余回声抑制。

USB接口继续使用48kHz、双声道S16LE。算法以16kHz单声道处理语音，输入使用抗混叠FIR，输出通过多相FIR恢复为48kHz，复制至USB左右录音通道；语音处理带宽约7kHz。录音会增加分帧与队列延迟。播放不经过AEC。

上电默认仍是原声卡模式，AEC关闭。应用“默认固件 · USB声卡”即可恢复原始录音和人声清晰播放。Quick Start只改参数，不烧录程序。手动写寄存器会关闭AEC，修改后重新应用AEC方案。

在电脑通话软件中选择AC10x播放和录音端。测试MCU AEC时关闭通话软件的重复AEC处理，保持扬声器和麦克风不削波；AEC不会消除办公室里所有无关环境噪声。

## 控制接口

原有协议0.1和10字节HID报告保持兼容。S3扩展0x7D只读查询；0x7C设置模式（byte2：0关闭、1开启）。应答byte1为0xAE、byte2扩展版本1、byte3能力标记1、byte4实际运行状态、byte5故障计数低8位、byte6丢块计数低8位、byte7最大算法调用毫秒数、byte8成功标记、byte9处理帧计数低8位。

旧固件的零填充应答只表示不支持；设置命令必须得到明确成功及同值读回。启用前固件检查MIC/PLAY路由；网页在启用失败或取消时关闭AEC并尝试按原会话掩码恢复上一配置。断流或处理故障期间不将原始播放参考冒充处理后录音。

## 构建

完整上位机：`node qa/build.cjs`。专项回归：`node qa/verify-aec.cjs`。完整回归：`npm test`。

固件位于`firmware/s3/source`，使用现有ESP-IDF 6.2和S3工具链。ESP-SR和dl_fft均锁定提交，来源及SHA256见各组件的provenance.json，第三方许可独立保留。固件使用八线PSRAM分配AEC与SIMD缓冲；中断原子状态保留在内部DRAM。工程启用Newlib以兼容预编译库，PSRAM不足时拒绝启用AEC，默认原声卡路径保留。
