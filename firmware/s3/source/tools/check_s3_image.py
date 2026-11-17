"""Inspect the linked S3 ELF/image/descriptors. Offline only; no serial access."""
from pathlib import Path
from elftools.elf.elffile import ELFFile
import hashlib
import json
import struct

root = Path(__file__).resolve().parents[1]
build = root / 'build'
config = json.loads((build/'config/sdkconfig.json').read_text())
with (build/'ac10x_s3_bridge.elf').open('rb') as f:
    elf = ELFFile(f)
    assert elf['e_machine'] == 'EM_XTENSA'
    symbols = elf.get_section_by_name('.symtab')

    def data(name):
        entries = symbols.get_symbol_by_name(name)
        assert entries, ('missing symbol', name)
        s = entries[0]
        sec = elf.get_section(s['st_shndx'])
        offset = s['st_value'] - sec['sh_addr']
        return sec.data()[offset:offset+s['st_size']]

    def u16(blob, at):
        return int.from_bytes(blob[at:at+2], 'little')

    profile = json.loads((root/'DEFAULT-FIRMWARE.json').read_text(encoding='utf-8'))
    expected_table = bytes(value for p in profile['registerPatches']
                           for value in [p['address'],p['mask'],p['single'],p['differential']])
    assert data('codec_default_patches') == expected_table, 'Linked profile differs from Quick Start'
    assert data('esp_app_desc')[16:48].rstrip(b'\0') == b'0.3.0', 'Wrong linked app version'

    device = data('device_descriptor')
    assert len(device) == 18 and u16(device, 2) == 0x0200
    assert (u16(device, 8), u16(device, 10), u16(device, 12)) == (0x303a, 0x4005, 0x0200)
    assert not symbols.get_symbol_by_name('config_hs')
    assert not symbols.get_symbol_by_name('qualifier')
    assert not symbols.get_symbol_by_name('pattern'), 'Synthetic source must not be linked'
    blob = data('config_fs')
    assert u16(blob, 2) == len(blob) and blob[4] == 4
    descriptors = []
    pos = 0
    while pos < len(blob):
        size = blob[pos]
        assert size >= 2 and pos + size <= len(blob)
        descriptors.append(blob[pos:pos+size])
        pos += size
    interfaces = [d for d in descriptors if d[1] == 4]
    assert [(d[2], d[3], d[4]) for d in interfaces] == [(0,0,0),(1,0,0),(1,1,2),(2,0,0),(2,1,1),(3,0,2)]
    eps = {d[2]: d for d in descriptors if d[1] == 5}
    assert set(eps) == {0x01, 0x82, 0x83, 0x04, 0x84}
    for address in [0x01, 0x83]:
        assert u16(eps[address], 4) == 196 and eps[address][6] == 1 and eps[address][3] == 5
        assert u16(eps[address], 4) == (48+1) * 4
    assert eps[0x82][3] == 0x11 and u16(eps[0x82], 4) == 4
    assert u16(eps[0x84], 4) == 10 and u16(eps[0x04], 4) == 10
    assert next(d for d in descriptors if d[1] == 11)[2:4] == bytes([0,3])
    clocks = [d for d in descriptors if d[1] == 0x24 and d[2] == 0x0a]
    assert len(clocks) == 1 and clocks[0][3:6] == bytes([4,1,5])
    formats = [d for d in descriptors if d[1] == 0x24 and d[2] == 2 and len(d) == 6]
    assert len(formats) == 2 and all(d[3:] == bytes([1,2,16]) for d in formats)
    for name in ['i2s_channel_enable', 'i2s_channel_write', 'i2s_channel_read']:
        assert symbols.get_symbol_by_name(name), ('missing real I2S path', name)
    for name in ['codec_default_bootstrap', 'codec_default_initialize']:
        assert symbols.get_symbol_by_name(name), ('missing default boot initialization', name)
    for name in ['lin_buf_in', 'lin_buf_out']:
        assert len(data(name)) >= 196
    hot = {}
    for name in ['dcd_int_handler', 'audiod_xfer_isr', 'audio_pipe_playback',
                 'audio_pipe_capture', 'usbd_edpt_xfer', 'tud_hid_set_report_cb']:
        s = symbols.get_symbol_by_name(name)[0]
        address = s['st_value']
        assert 0x40370000 <= address < 0x403e0000, ('hot path not internal S3 IRAM', name, hex(address))
        hot[name] = hex(address)
    for name in ['tud_descriptor_device_cb', 'tud_descriptor_configuration_cb',
                 'tud_audio_get_req_entity_cb', 'tud_audio_set_itf_cb',
                 'tud_audio_feedback_params_cb', 'tud_hid_set_report_cb',
                 'tud_event_hook_cb', 'bridge_usb_task_step', 'audio_pipe_usb_sync',
                 'audio_pipe_usb_pump']:
        assert symbols.get_symbol_by_name(name)[0]['st_info']['bind'] == 'STB_GLOBAL', ('weak callback', name)
    for name in ['aec_create_from_config','aec_process','aec_service_set','aec_service_capture','aec_decimate','aec_interpolate']:
        assert symbols.get_symbol_by_name(name), ('missing AEC path',name)
    for name in ['epoch','g_stats','session_epoch','enabled']:
        for s in symbols.get_symbol_by_name(name):
            assert 0x3fc80000 <= s['st_value'] < 0x3fce0000, ('atomic state outside internal DRAM',name)
    assert not config.get('SPIRAM_ALLOW_BSS_SEG_EXTERNAL_MEMORY',False)
    report = data('hid_report')
    assert bytes([0x95, 10]) in report and 0x85 not in report

image = (build/'ac10x_s3_bridge.bin').read_bytes()
assert image[0] == 0xe9 and u16(image, 12) == 9
assert len(image) < 0x1f0000
parts = []
table = (build/'partition_table/partition-table.bin').read_bytes()
for offset in range(0, len(table), 32):
    entry = table[offset:offset+32]
    if entry[:2] != b'\xaa\x50':
        break
    magic, kind, subkind, start, size, name, flags = struct.unpack('<HBBII16sI', entry)
    parts.append({'name': name.rstrip(b'\0').decode(), 'type':kind, 'subtype':subkind, 'offset':start, 'bytes':size})
factory = next(p for p in parts if p['name'] == 'factory')
assert factory['offset'] == 0x10000 and factory['bytes'] == 0x1f0000
assert all(p['offset'] + p['bytes'] <= 4*1024*1024 for p in parts)
config = json.loads((build/'config/sdkconfig.json').read_text())
assert config['IDF_TARGET'] == 'esp32s3' and config.get('SPIRAM', False) and config['SPIRAM_MODE_OCT'] and config['LIBC_NEWLIB']
assert config['ESP_CONSOLE_UART_DEFAULT'] and config['ESP_CONSOLE_SECONDARY_NONE']
assert config['I2S_ISR_IRAM_SAFE']
pins = {n:config['BRIDGE_'+n+'_GPIO'] for n in ['MCLK','BCLK','LRCK','DOUT','DIN','SDA','SCL']}

# Same PIO allocation formula as this vendored dcd_dwc2.c / dwc2_esp32.h.
# EP0 + feedback + capture + HID IN; shared RX uses the largest OUT packet.
rx_words = 13 + 1 + 2 * ((196 // 4) + 1) + 2*7
tx_words = 64//4 + sum((u16(d, 4)+3)//4 for a,d in eps.items() if a & 0x80)
assert rx_words + tx_words <= 256
assert 1 + sum(1 for a in eps if a & 0x80) <= 5
result = {
    'result':'PASS', 'target':'esp32s3', 'elf_machine':'EM_XTENSA',
    'bytes':len(image), 'sha256':hashlib.sha256(image).hexdigest(),
    'usb':'Full Speed only, UAC2 48kHz stereo S16LE duplex + HID10',
    'vid_pid':'303A:4005 (local development only)', 'hid_protocol':'0.1',
    'firmware_version':'0.3.0', 'default_profile':'USB soundcard / clear vocals',
    'linked_default_profile':'83 rows exactly match generated JSON',
    'canonical_config_sha256':profile['canonicalConfigSHA256'],
    'app_partition_free_bytes':0x1f0000-len(image),
    'descriptors':'PASS', 'strong_callbacks':'PASS', 'hot_path_internal_iram':hot,
    'psram_required_for_aec':True, 'psram_required_for_default_soundcard':False, 'gpio_profile':pins,
    'pio_fifo_calculation':{'words_total':256,'shared_rx':rx_words,'all_in_tx':tx_words,'unused':256-rx_words-tx_words},
    'partitions':parts, 'evidence_scope':'linked image / descriptors / generated default table',
}
(root/'evidence/image-check.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
