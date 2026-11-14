# 来源与依赖

应用沿用本机 AC10x Audio Lab 源码。没有发现为本项目授予再分发权的既有 LICENSE 文件，因此本候选包不擅自指定开源许可证；package.json 使用 private/UNLICENSED 防止误发到包仓库。用户后续正式公开发布时需确定自己的项目许可。

协议和寄存器事实继承源任务对原 AC102_SW.exe、配套 ac102.c/h 与 AC102 User Manual v1.0 的核对记录。本轮已核验92个内容文件，并对COMPARISON.md列出的原程序方法、参数、表格和桥接描述符做了静态比较；未执行原程序，不声称动态穷尽全部功能。候选包不附带原商业程序、驱动、厂商手册、厂商图标或用户录音。

运行时为项目内嵌 JavaScript/CSS，使用浏览器原生 WebHID、Web Audio、SVG 等接口，无 CDN、远程字体或运行依赖下载。

离线开发测试使用 jsdom 26.1.0（MIT）及其传递依赖，通过 pnpm-lock.yaml 固定；这些依赖不打进单文件 HTML。安装开发依赖时，原始许可随各包保留。

可选原生硬件验收后端使用当前机器已安装的 Python hidapi 模块，未把 Python、hidapi DLL 或其他第三方程序打进候选包。S31 固件及其 ESP-IDF/TinyUSB 许可不由本 UI 包重新分发或变更。

本版开发测试另外使用@resvg/resvg-js 2.6.2（MPL-2.0）及对应平台的原生渲染模块，仅把本项目生成的SVG转换成布局审阅PNG；不打进单文件运行入口，不用于浏览器观测。开发依赖固定在pnpm-lock.yaml，node_modules不随候选包分发。
