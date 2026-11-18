"""Verify one AC10x ESP-IDF output without opening a USB device."""
import argparse
import hashlib
import json
import struct
from pathlib import Path

from elftools.elf.elffile import ELFFile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("build", type=Path)
parser.add_argument("target", choices=("esp32s3", "esp32s31"))
args = parser.parse_args()
build = args.build
s31 = args.target == "esp32s31"
root = Path(__file__).resolve().parents[1]
version = "0.4.0"
config = json.loads((build / "config/sdkconfig.json").read_text())
assert config["IDF_TARGET"] == args.target
assert config["SPIRAM"] and config["SPIRAM_MODE_OCT"] and config["LIBC_NEWLIB"]
assert not config.get("SPIRAM_ALLOW_BSS_SEG_EXTERNAL_MEMORY")
assert config["I2S_ISR_IRAM_SAFE"]
assert config["SOC_CPU_CORES_NUM"] == 2
if s31:
    assert config.get("ESP_MAIN_TASK_AFFINITY_CPU1"), "S31 I2S DMA and PCM workers must share Core 1"
pins = [config[f"BRIDGE_{name}_GPIO"] for name in ("MCLK", "BCLK", "LRCK", "DOUT", "DIN", "SDA", "SCL")]
assert len(set(pins)) == 7

def u16(data, offset):
    return struct.unpack_from("<H", data, offset)[0]

def check_usb_configuration(blob, *, high_speed):
    assert u16(blob, 2) == len(blob) and blob[4] == 4
    descriptors = []
    offset = 0
    while offset < len(blob):
        size = blob[offset]
        assert size >= 2 and offset + size <= len(blob)
        descriptors.append(blob[offset:offset + size])
        offset += size
    assert [(d[2], d[3], d[4]) for d in descriptors if d[1] == 4] == [
        (0, 0, 0), (1, 0, 0), (1, 1, 2), (2, 0, 0), (2, 1, 1), (3, 0, 2)
    ]
    endpoints = {d[2]: d for d in descriptors if d[1] == 5}
    assert set(endpoints) == {0x01, 0x82, 0x83, 0x04, 0x84}
    for address in (0x01, 0x83):
        assert (u16(endpoints[address], 4), endpoints[address][6]) == (28 if high_speed else 196, 1)
    assert (u16(endpoints[0x82], 4), endpoints[0x82][6]) == (4, 1)
    for address in (0x04, 0x84):
        assert (u16(endpoints[address], 4), endpoints[address][6]) == (10, 4 if high_speed else 1)
    formats = [d for d in descriptors if d[1] == 0x24 and d[2] == 2 and len(d) == 6]
    assert len(formats) == 2 and all(d[3:] == bytes([1, 2, 16]) for d in formats)

with (build / "ac10x_bridge.elf").open("rb") as stream:
    elf = ELFFile(stream)
    assert elf["e_machine"] == ("EM_RISCV" if s31 else "EM_XTENSA")
    symbols = elf.get_section_by_name(".symtab")

    def symbol(name):
        entries = symbols.get_symbol_by_name(name)
        assert entries, name
        return entries[0]

    def linked_data(name):
        item = symbol(name)
        section = elf.get_section(item["st_shndx"])
        offset = item["st_value"] - section["sh_addr"]
        return section.data()[offset:offset + item["st_size"]]

    assert linked_data("esp_app_desc")[16:48].rstrip(b"\0") == version.encode()
    defaults = json.loads((root.parents[1] / "DEFAULT-FIRMWARE.json").read_text(encoding="utf-8"))
    rows = defaults["registerPatches"]
    assert len(rows) == 83
    expected = bytes(row[key] for row in rows for key in ("address", "mask", "single", "differential"))
    assert linked_data("codec_default_patches") == expected
    assert linked_data("device_descriptor")[8:14] == struct.pack("<HHH", 0x303A, 0x4004 if s31 else 0x4005, 0x0302 if s31 else 0x0200)
    check_usb_configuration(linked_data("config_fs"), high_speed=False)
    if s31:
        check_usb_configuration(linked_data("config_hs"), high_speed=True)
        assert linked_data("qualifier")[1] == 6
    else:
        assert not symbols.get_symbol_by_name("config_hs")
    assert bytes([0x95, 10]) in linked_data("hid_report")
    for name in ("aec_process", "aec_create_from_config", "aec_service_available",
                 "i2s_channel_enable", "audio_pipe_playback", "audio_pipe_capture"):
        symbol(name)
    for name in ("dcd_int_handler", "audiod_xfer_isr", "usbd_edpt_xfer"):
        section = elf.get_section(symbol(name)["st_shndx"])
        assert section.name.startswith(".iram"), (name, section.name)

image = (build / "ac10x_bridge.bin").read_bytes()
assert image[0] == 0xE9 and u16(image, 12) == (32 if s31 else 9)
table = (build / "partition_table/partition-table.bin").read_bytes()
partitions = {}
for offset in range(0, len(table), 32):
    entry = table[offset:offset + 32]
    if entry[:2] != b"\xaa\x50":
        break
    _, kind, subtype, address, size, label, flags = struct.unpack("<HBBII16sI", entry)
    partitions[label.rstrip(b"\0").decode()] = (kind, subtype, address, size)
assert partitions["nvs"][2:] == (0x9000, 0x6000)
assert partitions["phy_init"][2:] == (0xF000, 0x1000)
app_size = 0x800000 if s31 else 0x1F0000
assert partitions["factory"] == (0, 0, 0x10000, app_size)
if s31:
    assert partitions["coffee_pjpg"][2:] == (0x810000, 0x600000)
assert len(image) < app_size
assert sum(1 for entry in partitions.values() if entry[0] == 0) == 1
print(json.dumps({"target": args.target, "version": version, "appBytes": len(image),
                  "appSHA256": hashlib.sha256(image).hexdigest(), "appFreeBytes": app_size - len(image),
                  "usbConfigurations": ["FS", "HS"] if s31 else ["FS"], "gpio": pins,
                  "partitions": partitions, "defaultMasks": len(rows), "result": "PASS"}, indent=2))
