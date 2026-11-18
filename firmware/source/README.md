# AC10x 桥接固件 0.4.0

默认提供 USB 声卡、人声清晰 EQ 和原始麦克风录音，可通过上位机切换 ESP-SR AEC。板型、接线和应用更新见[固件说明](../README.md)。

AC101S 数字麦克风以 48 kHz 接入现有 I²S 录音通道，USB 格式不变。麦克风类型由完整上位机选择；启动默认表保留模拟输入、人声清晰播放和 AEC 关闭。见[使用与接线](../../DMIC.md)。

## 构建

同一工程按 ESP-IDF 构建目标生成 ESP32-S3 或 ESP32-S31 镜像。使用 ESP-IDF 6.2（提交 `c712a0dde385d659a1470a136251980d31a70bc1`）及对应 Xtensa 或 RISC-V 工具链。导出 ESP-IDF 环境后，在本目录运行：

```powershell
.\tools\build.ps1 -Target esp32s3
.\tools\build.ps1 -Target esp32s31
python tools/check_image.py build-esp32s3 esp32s3
python tools/check_image.py build-esp32s31 esp32s31
```

加 `-Menuconfig` 可在 **AC10x audio bridge GPIO routing** 设置 I²S 和 I²C 引脚。每个目标独立保存 `sdkconfig` 和编译输出。工程使用八线 PSRAM 和 Newlib。

ESP32-S31 在 Core 1 上初始化 I²S，DMA 回调和音频任务共用该核心。使用已有 S31 构建目录时，在 menuconfig 确认 **Main task affinity** 为 **CPU1**。

两个目标的镜像均为各自构建目录中的 `ac10x_bridge.bin`。应用分区为 `0x10000`，写入前核对芯片和板上实际分区。S31 默认配置沿用 Korvo-1 V1.1 的 16 MB Flash 布局和资源分区，S3 默认配置使用 4 MB Flash 布局。

## 测试

在仓库根目录运行 `npm ci` 安装 JavaScript 开发依赖，再从本目录执行：

```text
python tools/run_host_tests.py --gcc <host-gcc>
node tools/verify-default-profile.cjs
node tools/test_quickstart.cjs
```

默认寄存器表与仓库根目录的 Quick Start 共用参数模型。AEC 为可切换的录音处理模式，开机保持关闭。

## 依赖

ESP-SR 的 S3 和 S31 库及共用 AEC 头文件位于 `components/esp_aec_vendor`，FFT 源码位于 `components/dl_fft`。各组件的 `provenance.json` 记录来源和文件哈希，许可见[构建组件](docs/THIRD-PARTY.md)。

USB 中断热路径使用 IRAM，中断原子状态保存在内部 DRAM；硬件原子指令设置位于对应组件的 CMake 配置。

项目自有代码采用 [CC BY-NC-SA 4.0](../../LICENSE)。
