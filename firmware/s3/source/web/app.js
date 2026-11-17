(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const {HidBridge} = AudioHardwareTransport;
  let bridge = null, busy = false;
  const events = [];
  function record(event) {
    events.push({time:new Date().toISOString(), ...event});
    if (events.length > 1000) events.shift();
    $('log').textContent = events.map(e => JSON.stringify(e)).join('\n');
  }
  function controls() {
    const active = !!bridge?.connected && !bridge?.fault && !busy;
    $('connect').disabled = busy || !navigator.hid;
    $('disconnect').disabled = !bridge || busy;
    for (const id of ['query', 'readId', 'read']) $(id).disabled = !active;
    for (const id of ['write', 'gateOn', 'gateOff']) $(id).disabled = !active || !$('armed').checked;
  }
  function byte(id, max = 255) {
    const value = $(id).value.trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,2}$/i.test(value) || parseInt(value, 16) > max) throw Error('十六进制输入超出范围：' + id);
    return parseInt(value, 16);
  }
  function selectedAddress() {
    const value = byte('address', 0x77);
    if (value < 0x08) throw Error('I²C 7位地址需在 08–77 之间');
    bridge.i2cAddress = value;
  }
  async function action(fn) {
    if (busy) return;
    busy = true; controls();
    try { await fn(); $('result').className = ''; }
    catch (error) { $('result').textContent = error.message; $('result').className = 'err'; record({error:error.code || 'ERROR',message:error.message}); }
    finally { busy = false; controls(); }
  }
  async function status() {
    const s = await bridge.getStatus();
    if (s.protocolVersion !== '0.1') {
      const error = Error('当前工具仅核对了协议0.1，请停止写入并核对固件版本');
      error.code = 'PROTOCOL'; bridge.fail(error); throw error;
    }
    $('status').textContent = `${bridge.device.productName} · 协议 ${s.protocolVersion} · 时钟${s.clockGate?'开':'关'} · 播放${s.playbackActive?'活动':'空闲'} · 录音${s.captureActive?'活动':'空闲'} · I²C错误低8位 ${s.i2cErrorsLow8}`;
  }
  async function read(idOnly) {
    selectedAddress();
    const address = idOnly ? 0 : byte('register');
    const value = await bridge.readRegister(address);
    $('result').textContent = `寄存器 0x${address.toString(16).padStart(2,'0')} = 0x${value.toString(16).padStart(2,'0')}` + (idOnly ? '；ID本身不能区分所有同族型号。' : '');
  }
  $('connect').onclick = () => action(async () => {
    if (bridge) { await bridge.close(); bridge = null; }
    $('armed').checked = false;
    const devices = await navigator.hid.requestDevice({filters:[{vendorId:0x303a,productId:0x4005,usagePage:0xff00}]});
    if (!devices.length) { $('status').textContent = '已取消选择，未连接。'; return; }
    bridge = new HidBridge(devices[0], {onLog:record, onState:(state,error) => {
      if (state !== 'connected') { $('armed').checked = false; $('status').textContent = state === 'fault' ? '连接失步，请断开后重新连接。' : '已断开'; }
      if (error) record({state,error:error.message});
      controls();
    }});
    await bridge.open();
    await status(); // Read-only; no register writes or clock changes.
  });
  $('disconnect').onclick = () => action(async () => { if (bridge) await bridge.close(); bridge = null; $('armed').checked = false; });
  $('query').onclick = () => action(status);
  $('readId').onclick = () => action(() => read(true));
  $('read').onclick = () => action(() => read(false));
  $('write').onclick = () => action(async () => {
    if (!$('armed').checked) throw Error('尚未允许写入');
    selectedAddress();
    const address = byte('register'), expected = byte('value');
    const actual = await bridge.writeRegister(address, expected);
    if (actual !== expected) throw Error(`写入已发送，读回不一致：期望0x${expected.toString(16)}，实际0x${actual.toString(16)}；未自动重试。`);
    $('result').textContent = `写入并读回一致：0x${actual.toString(16).padStart(2,'0')}`;
  });
  for (const [id, enabled] of [['gateOn',true], ['gateOff',false]]) $(id).onclick = () => action(async () => {
    if (!$('armed').checked) throw Error('尚未允许切换时钟');
    const current = await bridge.getStatus();
    if (current.playbackActive || current.captureActive) throw Error('请先停止系统播放和录音，再切换时钟');
    await bridge.setMclk(enabled); await status();
  });
  $('armed').onchange = controls;
  $('export').onclick = () => {
    const blob = new Blob([JSON.stringify({tool:'AC10x S3 candidate 0.3.0',hardwareValidation:'not established by this page',events},null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href=url; link.download='ac10x-s3-debug.json'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  if (!navigator.hid) $('status').textContent = '需要支持 WebHID 的桌面 Chrome/Edge；此页仍可离线查看。';
  controls();
})();
