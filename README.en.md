# AC10x Audio Lab

[中文](README.md) | **English**

**By mondraker**

A browser-based audio tool for AC101S and AC102 codecs. Configure signal routing, tune EQ, read and write registers, and test USB playback and recording from a signal graph. Available in Chinese and English, with light and dark themes.

Web app **0.8.16-rc.1** · bridge firmware **0.4.0**

![AC10x Audio Lab signal graph](docs/audio-lab-dark.jpg)

## Getting started

Use desktop Chrome or Edge and Python 3. Run this command from the project directory:

```powershell
python qa/launch-http.py
```

The browser opens `http://127.0.0.1:47881/`.

1. Click **Connect USB**, select your bridge, and wait for the configuration to load.
2. Open **Quick Start**, choose AMIC or DMIC to match the wiring, then choose a setup and click **Write & verify**.
3. Select **AC10x Duplex** as your computer's audio output, adjust the volume, and start playback.
4. To make further changes, click a graph module, edit its parameters, and apply them from the panel.

The default setup provides **USB audio with clear-vocal EQ** and independent microphone recording. DAC and Line Out are both at 0 dB. Microphone monitoring, digital loopback, and AEC are off by default.

## Features

- **Quick Start:** nine setups for playback, recording, channel checks, digital loopback capture, and hands-free calling with AEC. See [setup details](EXAMPLES.md).
- **EQ:** sixteen presets, three filters, response plots, bypass, and A/B listening.
- **Register tools:** read device configuration, apply and verify module settings, compare configurations, monitor registers, and undo the last write.
- **Playback and recording:** select an audio input, inspect waveforms and spectra, and export the original WAV. Switch between A and B to compare the browser EQ effect.
- **Signal graph:** click a module to edit it, right-drag to pan, and use the wheel to zoom. See [graph controls](VIEWPORT.md).

Edits stay in the draft until you click **Write & verify**. Quick Start applies a complete setup; EQ presets adjust the EQ module. Firmware updates use the flashing instructions for each board.

## Hardware and firmware

ESP32-S3 and ESP32-S31 share bridge firmware and use the same browser controls. USB audio runs at 48 kHz in both directions. For AC101S, Quick Start lets you choose an analog microphone or 48 kHz DMIC. Both inputs support clear-vocal playback and AEC. AEC uses octal PSRAM and processes speech at 16 kHz. Select the AC101S or AC102 register profile to match the chip marking. The TI adapter provides register control.

- [Firmware download, wiring, and updates](firmware/README.md#english)
- [AC101S board wiring](HARDWARE-SETUP.md)
- [Digital microphone](DMIC.en.md) · [AEC setup](AEC.md)
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

[0.8.16-rc.1 complete package](releases/AC10x-Audio-Lab-0.8.16-rc.1.zip) · [SHA-256](releases/SHA256SUMS.txt) · [Previous releases](releases/)

## License

Original project code and documentation are licensed under [CC BY-NC-SA 4.0](LICENSE): retain attribution, use the work for noncommercial purposes, and share adaptations under the same license. Third-party components retain their own licenses; see [third-party notices](THIRD-PARTY-NOTICES.md).
