# AC10x Audio Lab

[中文](README.md) | **English**

**By mondraker**

A browser-based audio tool for AC101S and AC102 codecs. Configure signal routing, tune EQ, read and write registers, and test USB playback and recording from a signal graph. Available in Chinese and English, with light and dark themes.

Web app **0.8.14-rc.1** · S31 firmware **0.3.3** · ESP32-S3 firmware **0.3.0**

![AC10x Audio Lab signal graph](docs/audio-lab-dark.jpg)

## Getting started

Use desktop Chrome or Edge and Python 3. Run this command from the project directory:

```powershell
python qa/launch-http.py
```

The browser opens `http://127.0.0.1:47881/`.

1. Click **Connect USB**, select your bridge, and wait for the configuration to load.
2. Open **Quick Start**, choose a setup, and click **Write & verify**.
3. Select **AC10x Duplex** as your computer's audio output, adjust the volume, and start playback.
4. To make further changes, click a graph module, edit its parameters, and apply them from the panel.

The default setup provides **USB audio with clear-vocal EQ** and independent microphone recording. DAC and Line Out are both at 0 dB. Microphone monitoring, digital loopback, and AEC are off by default.

## Features

- **Quick Start:** nine setups for playback, recording, channel checks, digital loopback capture, and S3 hands-free calling with AEC. See [setup details](EXAMPLES.md).
- **EQ:** sixteen presets, three filters, response plots, bypass, and A/B listening.
- **Register tools:** read device configuration, apply and verify module settings, compare configurations, monitor registers, and undo the last write.
- **Playback and recording:** select an audio input, inspect waveforms and spectra, and export the original WAV. Switch between A and B to compare the browser EQ effect.
- **Signal graph:** click a module to edit it, right-drag to pan, and use the wheel to zoom. See [graph controls](VIEWPORT.md).

Edits stay in the draft until you click **Write & verify**. Quick Start applies a complete setup; EQ presets adjust the EQ module. Firmware updates use the flashing instructions for each board.

## Hardware and firmware

| Bridge | VID:PID | Audio and control |
|---|---|---|
| TI adapter | 0451:4822 | Original adapter protocol, variable-length HID reports |
| S31 | 303A:4004 | 48 kHz duplex USB audio, 10-byte HID reports |
| ESP32-S3 | 303A:4005 | Full Speed USB, 48 kHz duplex audio, 10-byte HID reports |

S31 and S3 use 16-bit samples, two 32-bit I²S slots, and a 12.288 MHz MCLK, with the codec in slave mode. Select the AC101S or AC102 register profile to match the chip marking.

S3 firmware 0.3.0 provides AEC for hands-free calls using octal PSRAM. It processes speech at 16 kHz while USB capture remains 48 kHz stereo. See [AEC setup](AEC.md).

- [AC101S board wiring](HARDWARE-SETUP.md)
- [S31 firmware and source](firmware/README.md)
- [S3 firmware, wiring, and source](firmware/s3/README.md)
- [USB bridge protocol](S3-INTEGRATION.md)
- [Importing settings from the original tools](COMPARISON.md)

## Development

Use Node.js 18+ and Python 3:

```powershell
npm ci
npm run build
npm test
```

`npm run build` generates a single HTML file with scripts and styles included. `npm test` checks parameter calculations, protocol handling, configuration recovery, recording interactions, localization, and layout using simulated devices. Set `AC10X_PYTHON` to choose a Python interpreter.

## Downloads

- [0.8.14-rc.1 complete package](releases/AC10x-Audio-Lab-0.8.14-rc.1.zip)
- [ESP32-S3 0.3.0 firmware and source](releases/AC10x-S3-Default-Firmware-0.3.0.zip)
- [SHA-256 checksums](releases/SHA256SUMS.txt)

## License

Original project code and documentation are licensed under [CC BY-NC-SA 4.0](LICENSE): retain attribution, use the work for noncommercial purposes, and share adaptations under the same license. Third-party components retain their own licenses; see [third-party notices](THIRD-PARTY-NOTICES.md).
