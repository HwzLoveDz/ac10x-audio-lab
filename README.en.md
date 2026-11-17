# AC10x Audio Lab

[中文](README.md) | **English**

**By mondraker**

A browser workbench for AC101S / AC102 audio configuration. One complete signal graph brings together Quick Start, register control, EQ, configuration comparison, diagnostics, playback and recording.

Web version **0.8.14-rc.1**, with **S31 0.3.3 / ESP32-S3 0.3.0** firmware. Chinese and English, light and dark themes. JavaScript and styles are bundled in the application.

![AC10x Audio Lab signal graph](docs/audio-lab-dark.jpg)

## Start

Use desktop Chrome / Edge and Python 3. From the repository root:

```powershell
python qa/launch-http.py
```

Open `http://127.0.0.1:47881/`.

1. Click **Connect USB**, select the bridge and read its configuration.
2. Open **Quick Start**, choose a setup, then **Write and verify**.
3. Click a graph module to edit its parameters and apply them from the panel.

The default is **USB soundcard + clear-vocal EQ**. DAC and Line Out are both 0dB; microphone recording is independent, with monitoring and digital return disabled. The EQ uses 180Hz −3dB, 2.5kHz +3dB and 8kHz +1.5dB, with −4dB pre-gain. Select AC10x Duplex as the computer output and adjust system volume for the amplifier and speaker.

## Tools

- **Quick Start:** default soundcard, flat playback, warm music, microphone recording, digital return, left channel, right channel and mute.
- **EQ:** sixteen presets, three-band editing, response plots and A/B listening; disabling EQ applies unity coefficients for bypass.
- **Device control:** readback, verified module writes, comparisons, register monitoring, undo and error recovery.
- **Recording:** capture PCM from a selected input, inspect its waveform and spectrum, and export WAV. Each new recording starts in the original/raw view.
- **Graph:** right-drag to pan and use the wheel to zoom. Arrow keys pan,± zoom, and 0 fits the graph. Each corner can be moved as far as the viewport center.

Quick Start applies codec parameters; firmware updates use the appropriate flashing tool. EQ presets load into the draft and take effect when the module is written. See [ready-to-use setups](EXAMPLES.md).

S3 firmware 0.3.0 adds **AEC hands-free calling** in Quick Start. The speech algorithm runs at16kHz while USB remains48kHz stereo. AEC is off at boot; the default preset restores raw microphone capture and clear-vocal playback. See [AEC setup](AEC.md).

## Hardware and firmware

| Bridge | VID:PID | Audio and control |
|---|---|---|
| TI adapter | 0451:4822 | Original adapter protocol, variable-length HID reports |
| S31 | 303A:4004 | 48kHz duplex USB audio and 10-byte HID |
| ESP32-S3 | 303A:4005 | Native Full Speed USB, 48kHz duplex audio and 10-byte HID |

S31 and S3 use 16-bit samples, two 32-bit I²S slots, a slave codec and a 12.288MHz reference MCLK. Select the AC101S or AC102 register profile using the chip marking.

- [AC101S board wiring](HARDWARE-SETUP.md)
- [S31 firmware and source](firmware/README.md)
- [S3 firmware, GPIO mapping and source](firmware/s3/README.md)
- [Bridge protocol and adapters](S3-INTEGRATION.md)

## Development

Node.js 18+ and Python 3:

```powershell
npm ci
npm run build
npm test
```

`npm test` uses isolated device models to check parameter calculations, protocol handling, transaction recovery, recording interactions, localization and layout. Set `AC10X_PYTHON` to select a Python interpreter.

## Downloads

- [0.8.14-rc.1 complete package](releases/AC10x-Audio-Lab-0.8.14-rc.1.zip)
- [ESP32-S3 0.3.0 firmware and source](releases/AC10x-S3-Default-Firmware-0.3.0.zip)
- [SHA-256 checksums](releases/SHA256SUMS.txt)

## License

Original project code and documentation use [CC BY-NC-SA 4.0](LICENSE): attribution, noncommercial use and ShareAlike. Retain attribution when sharing adaptations and follow the ShareAlike terms. Third-party components retain their own licenses; see [third-party notices](THIRD-PARTY-NOTICES.md).
