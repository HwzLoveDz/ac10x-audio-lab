# AC10x Audio Lab

AC101S / AC102 的浏览器音频调试工作台。当前版本 **0.8.5-rc.1**，仓库初始可见性为私有。

一张完整信号路径图、一个 Quick Start，配合寄存器读回、局部写入核验、诊断、配置比较和试听／录音工具。支持中文／English、浅色／暗色主题；运行入口不依赖 CDN 或远程字体。

![暗色总图](docs/audio-lab-dark.jpg)

## 本地运行

需要桌面版 Chrome / Edge，以及 Python 3。始终使用本地 HTTP。

```powershell
python qa/launch-http.py
```

默认打开 `http://127.0.0.1:47881/`。若该端口已由另一份项目占用，先核对原服务，或为本副本指定新端口：

```powershell
python qa/launch-http.py --port 47882
```

这是仅绑定 `127.0.0.1` 的静态服务，没有设备操作后端。正常入口为 `AC10x-Audio-Lab.html`；未连接硬件也可查看总图、编辑草稿和比较配置。

1. **连接 USB**：首次连接只读寄存器。
2. **Quick Start**：明确点击后，写入并核验独立录音与低音量播放的基础配置；不会自动播放或申请录音权限。
3. **自由编辑**：在总图点击模块，编辑草稿，再点击当前面板底部的应用按钮。导航、主题切换和草稿编辑本身不下发。

右键拖动平移，滚轮缩放；支持方向键、±、0 和适合窗口。图的四角最多拖到视区中心。连线流动表示读回配置中的启用方向，不是实际音频活动的测量。

Quick Start：模拟 MIC、12 dB PGA、0 dB ADC；DAC −30 dB、Line Out −18 dB；关闭 HPF／AGC／EQ、本地监听及数字回环。S31 / S3 使用 48 kHz、16 bit、32×2、I²S 从机和 12.288 MHz 参考；TI 保留并校验设置的时钟。实际外部时钟需与配置一致。

## 开发与软件回归

需要 Node.js 18 或以上；建议使用支持内置 `fetch` 的当前 LTS，以及可运行的 Python 3。

```powershell
npm ci
npm run build
npm test
```

`npm run build` 将模块源码打包为两份等价单文件入口。`npm test` 使用假设备、合成 DOM 和临时本地 HTTP 服务，不访问真实 HID、USB、串口、麦克风或音频设备。独立的原生硬件验收脚本不在默认测试中。

HTTP 回归默认兼容原工作站 Python 路径；在其他机器上，可显式指定 Python：

```powershell
$env:AC10X_PYTHON = (Get-Command python).Source
npm test
```

当前软件验收：287 项检查／34 个套件；另有 104 个属性生成用例、110 个异步调度用例、24 组真实 HTTP 界面状态、58 次模块入口点击，以及 256 组新旧连接与寄存器计划对照。详见 [验收摘要](docs/validation-0.8.5-rc.1.json) 与完整归档内的 `acceptance/`。这些结果不等于实机或声学验收，S3 仍为软件候选。

## 结构和归档

- 根目录 `index.html`、JavaScript、CSS：可维护源码。
- `AC10x-Audio-Lab.html` 和带版本号 HTML：当前独立运行入口。
- `qa/`：离线回归、假设备、构建和本地 HTTP 启动器。
- `docs/`：界面截图与精简验收摘要。
- [0.8.5-rc.1 完整包](releases/AC10x-Audio-Lab-0.8.5-rc.1.zip)：已封存的 149 文件发布候选包，含原始 `MANIFEST.json`、逐文件校验和与完整验收记录。
- [完整包 SHA-256](releases/SHA256SUMS.txt)。

完整包 SHA-256：`e00b5c7d5931ffc0c57212b30d8dfaf0fbe8f22caf83bb2d57faaa17ee9b6bac`。

本仓库保留原厂协议对比说明，不收录原商业上位机、厂商驱动／手册、用户录音、个人配置、开发依赖或个人 Codex 技能。笔记本部署状态不随 GitHub 上传自动改变。

项目尚未指定开源许可证，`package.json` 保持 `private: true` / `UNLICENSED`。来源和依赖许可见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
