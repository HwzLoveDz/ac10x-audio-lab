# AC10x Audio Lab

**中文** | [English](README.en.md)

**By mondraker**

面向 AC101S / AC102 的浏览器音频调试工作台。当前版本 **0.8.12-rc.1**，默认固件 **0.3.3**。

一张完整信号图、一个 Quick Start，配合寄存器读回、局部写入核验、配置比较、诊断和试听／录音。支持中文 / English、浅色 / 暗色主题；运行入口不依赖 CDN 或远程字体。

![完整信号图](docs/audio-lab-dark.jpg)

## 开始使用

需要桌面版 Chrome / Edge、Python 3。使用本地 HTTP 启动：

```powershell
python qa/launch-http.py
```

打开 `http://127.0.0.1:47881/`。服务仅绑定本机，无设备操作后端。需要独立端口时运行 `python qa/launch-http.py --port 47882`；先核对该端口没有其他服务。

1. 点击“设备与连接”，选择 USB 桥。首次连接只读，不自动应用参数。
2. 点击 **Quick Start**，选择方案并“写入并核验”。只恢复芯片参数，不刷固件，也不自动播放或录音。
3. 直接点击总图模块自由编辑，确认后在面板底部写入并核验。浏览、导航、切换语言或主题均不下发参数。

默认方案为 **USB 声卡 + 人声清晰 EQ**：DAC 和 Line Out 均 0 dB，麦克风独立录音，关闭录音监听和数字回环。EQ 为 180 Hz −3 dB、2.5 kHz +3 dB、8 kHz +1.5 dB，前级 −4 dB。初次连接功放从较低电脑音量开始；无声时同时检查系统输出设备、静音和音量。

Quick Start 的8种方案：默认固件·USB声卡、纯净播放、温暖音乐、独立录音、播放数字回采、仅左声道、仅右声道、静音待机。另有16种模块 EQ 预设。EQ关闭使用平直系数真正旁路，并保留预设供恢复。

右键拖动、滚轮缩放；方向键平移，± 缩放，0 适合窗口。图的四角最多拖到视区中心。连线流动表示设备读回中的启用方向，不是音频活动测量。

## 支持范围

| 桥接器 | 当前范围 |
|---|---|
| TI 原桥 | 保留原协议及可变报告长度；软件回归覆盖 |
| S31 音频桥 | 真实 WebHID 写入读回、USB 录放与扬声器通路已验证 |
| ESP32-S3 候选桥 | 软件回归通过；本版未做 S3 实板验收 |

S31 / S3 候选使用 48 kHz、16 bit 数据、32 bit × 2 I²S 时隙，Codec 从机，参考 MCLK 为12.288 MHz；实际外部时钟必须匹配。TI 保留并校验其设置的时钟。

实测板标记为 AC101S；ID 0x12 本身不能区分 AC101S 与 AC102。接线见 [HARDWARE-SETUP.md](HARDWARE-SETUP.md)。[默认固件](firmware/README.md)仅适用于已确认的 S31 应用分区，不是任意 S3 或任意板卡的通用镜像。

## 开发与回归

需要 Node.js 18+ 和 Python 3：

```powershell
npm ci
npm run build
npm test
```

若自动测试没有找到 Python，可显式指定：

```powershell
$env:AC10X_PYTHON = (Get-Command python).Source
npm test
```

`npm test` 使用假设备、合成 DOM 和临时本地 HTTP，不访问真实 HID、USB、串口、麦克风或音频设备。原生硬件验收脚本需要独立安排，不在默认测试中执行。

当前软件验收 **327项 / 39套件**；另有104个属性案例、110个异步调度案例。修正版8种方案通过原生S31事务核验；最终实际网页应用数字回采、取得两路有效音频，再恢复默认并核对104寄存器、83项掩码，差异为零。

完整网页用户流程在0.8.11-rc.2验证；本版最后复验覆盖修正后的回采和默认恢复。迷点实际拾音确认网页 A/B 及扬声器输出；这些是功能及相对变化证据，不是校准 THD / SNR / 声压指标。详见 [验收摘要](docs/validation-0.8.12-rc.1.json)。

## 文件与版本

- `index.html`、JavaScript、CSS：可维护源码。
- `AC10x-Audio-Lab.html`、带版本号HTML：同源构建的独立入口，经本地HTTP访问。
- `qa/`：离线测试、协议夹具、构建和HTTP启动器。
- `firmware/`：S31默认固件及对应源码，依赖许可保留。
- [0.8.12-rc.1 完整包](releases/AC10x-Audio-Lab-0.8.12-rc.1.zip)与[SHA-256](releases/SHA256SUMS.txt)。旧版0.8.5归档保留。

仓库不收录原厂商业上位机、用户录音、个人配置、开发依赖或个人 Codex 技能。项目尚未指定开源许可证；`package.json` 保持 `private: true` / `UNLICENSED`。依赖和来源见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
