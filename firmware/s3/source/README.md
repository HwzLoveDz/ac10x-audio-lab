# ESP32-S3 固件源码 0.3.0

默认提供 USB 声卡、人声清晰 EQ 和原始麦克风录音，可通过上位机切换 ESP-SR AEC。板型、接线和应用更新见[固件说明](../README.md)。

## 构建

使用 ESP-IDF 6.2 开发版（提交 `c712a0dde385d659a1470a136251980d31a70bc1`）及匹配的 Xtensa 工具链。导出 ESP-IDF 环境后运行：

```text
idf.py -B build build
idf.py -B build size
python tools/check_s3_image.py
```

Windows 也可运行 `tools/build.ps1`，通过 `IDF_PATH` 指定 SDK。工程使用八线 PSRAM 和 Newlib；构建时保留随源码提供的 `sdkconfig` 与 CMake 配置。

## 测试

在仓库根目录运行 `npm ci` 安装 JavaScript 开发依赖，再从本目录执行：

```text
python tools/run_host_tests.py --gcc <host-gcc>
node tools/verify-default-profile.cjs
node tools/test_s31_parity.cjs
node tools/test_web.cjs
```

默认寄存器表由 `profile-source` 模型生成。AEC 为可切换的录音处理模式，开机保持关闭。

## 依赖

ESP-SR 的 S3 预编译库和头文件位于 `components/esp_aec_vendor`，FFT 源码位于 `components/dl_fft`。各组件的 `provenance.json` 记录来源和文件哈希，许可见[构建组件](docs/THIRD-PARTY.md)。

USB 中断热路径使用 IRAM，中断原子状态保存在内部 DRAM；硬件原子指令设置位于对应组件的 CMake 配置。

项目自有代码采用 [CC BY-NC-SA 4.0](../../../LICENSE)。
