# ESP32-S3 固件源码 0.3.0

默认USB声卡、人声清晰EQ及原始麦克风录音；可通过配套上位机切换ESP-SR AEC。板型要求、GPIO和应用更新见[固件说明](../README.md)。

## 构建

ESP-IDF6.2开发版，提交`c712a0dde385d659a1470a136251980d31a70bc1`，匹配的Xtensa工具链。导出开发环境后：

```text
idf.py -B build build
idf.py -B build size
python tools/check_s3_image.py
```

Windows可使用`tools/build.ps1`，通过`IDF_PATH`指定SDK。配置包含八线PSRAM、Newlib及组件级硬件原子指令；USB热路径和中断原子状态位于内部内存。保留随源码提供的sdkconfig及CMake配置。

## 测试

```text
python tools/run_host_tests.py --gcc <host-gcc>
node tools/verify-default-profile.cjs
node tools/test_s31_parity.cjs
node tools/test_web.cjs
```

JavaScript测试使用仓库根目录安装的开发依赖。默认寄存器表由`profile-source`模型生成；AEC不替换原始默认配置。

ESP-SR的S3预编译库、头文件和独立许可证位于`components/esp_aec_vendor`；FFT源码位于`components/dl_fft`，各组件provenance.json记录来源及哈希。项目自有代码采用[CC BY-NC-SA 4.0](../../../LICENSE)，组件版权和许可见[构建组件](docs/THIRD-PARTY.md)。
