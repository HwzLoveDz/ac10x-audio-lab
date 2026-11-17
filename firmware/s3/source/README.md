# ESP32-S3 固件源码

版本0.2.1。启动建立USB音频、初始化AC101S并装载默认人声清晰配置。

## 构建

使用ESP-IDF6.2开发版及匹配的Xtensa工具链，在导出的开发环境中运行：

```text
idf.py -B build build
idf.py -B build size
python tools/check_s3_image.py
```

Windows可使用`tools/build.ps1`并通过`IDF_PATH`指定SDK。默认target为ESP32-S3，分区为4MB DIO80MHz，音频使用内部Full Speed PHY、48kHz/S16LE及32bit×2 I²S时隙。

## 测试

```text
python tools/run_host_tests.py --gcc <host-gcc>
node tools/verify-default-profile.cjs
node tools/test_s31_parity.cjs
node tools/test_web.cjs
```

JavaScript测试使用仓库根目录安装的开发依赖。固件寄存器表由`profile-source`中的配置模型生成。GPIO及更新方法见[固件说明](../README.md)。

项目自有代码使用[项目许可](../../../LICENSE)，第三方许可见[licenses](licenses)。
