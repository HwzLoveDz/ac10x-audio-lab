# AC10x Audio Lab

**中文** | [English](README.en.md)

**By mondraker**

用于 AC101S / AC102 的网页音频调试工具。在信号图上配置音频通路、调整 EQ 和读写寄存器，并测试 USB 播放与录音。支持中英文界面和浅色／暗色主题。

上位机 **0.8.16-rc.1** · 桥接固件 **0.4.0**

![AC10x Audio Lab 信号图](docs/audio-lab-dark.jpg)

## 开始使用

使用桌面版 Chrome / Edge 和 Python 3。在项目目录运行：

```powershell
python qa/launch-http.py
```

浏览器会打开 `http://127.0.0.1:47881/`。

1. 点击“连接 USB”，选择桥接器，等待读回参数。
2. 打开 **Quick Start**，按接线选择模拟或数字麦克风，再选择方案并点击“写入并核验”。
3. 在电脑上选择 **AC10x Duplex** 作为音频输出，调整音量后播放。
4. 需要进一步调整时，点击信号图中的模块，修改参数后在面板底部写入。

默认方案为 **USB 声卡＋人声清晰 EQ**，支持播放和独立麦克风录音。DAC 和 Line Out 均为 0 dB，麦克风监听、数字回环和 AEC 默认关闭。

## 功能

- **Quick Start**：9 种快捷配置，覆盖播放、录音、声道排查、数字回采和 AEC 免提通话。见[方案说明](EXAMPLES.md)。
- **EQ**：16 种预设、三段滤波器、频响曲线、旁路开关和 A/B 试听。
- **寄存器调试**：读取设备配置、按模块写入核验、比较配置、监视寄存器，以及撤销上次写入。
- **试听与录音**：选择声卡输入，查看波形和频谱，导出原始 WAV；可切换 A/B 比较浏览器 EQ 的处理效果。
- **信号图**：点击模块打开参数，右键拖动、滚轮缩放。详见[画布操作](VIEWPORT.md)。

参数先保存在草稿中，点击“写入并核验”后应用到设备。Quick Start 应用整套配置，EQ 预设用于调整 EQ 模块；固件更新见各板卡的烧录说明。

## 硬件与固件

ESP32-S3 和 ESP32-S31 使用同一套桥接固件和网页操作。USB 音频为 48 kHz 双向立体声。AC101S 可在 Quick Start 选择模拟麦克风或 48 kHz DMIC，两种输入都可使用人声清晰播放与 AEC。AEC 使用八线 PSRAM，内部以 16 kHz 处理语音。选择与芯片丝印一致的 AC101S 或 AC102 寄存器表。TI 适配器支持寄存器控制。

- [固件下载、接线与更新](firmware/README.md)
- [AC101S 板卡接线](HARDWARE-SETUP.md)
- [数字麦克风](DMIC.md) · [AEC 设置](AEC.md)
- [导入原工具配置](COMPARISON.md)

## 开发

使用 Node.js 18+ 和 Python 3：

```powershell
npm ci
npm run build
npm test
```

`npm run build` 生成包含脚本和样式的单文件 HTML。`npm test` 检查参数计算、传输协议、配置恢复、录音交互、语言和布局，测试使用模拟设备。可通过 `AC10X_PYTHON` 指定 Python 解释器。

## 下载

[0.8.16-rc.1 完整包](releases/AC10x-Audio-Lab-0.8.16-rc.1.zip) · [SHA-256](releases/SHA256SUMS.txt) · [历史版本](releases/)

## 许可

项目自有代码和文档采用 [CC BY-NC-SA 4.0](LICENSE)：保留署名、非商业性使用、相同方式共享。第三方组件沿用各自许可，见[第三方组件](THIRD-PARTY-NOTICES.md)。
