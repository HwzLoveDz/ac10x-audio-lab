"""Build/run the production C logic with host mocks; never opens hardware."""
from pathlib import Path
import argparse
import json
import os
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--gcc', default=shutil.which('gcc') or 'gcc')
parser.add_argument('--sanitize', action='store_true', help='Only for a host GCC with ASan/UBSan runtimes')
args = parser.parse_args()
out = root / 'build/host-tests'
out.mkdir(parents=True, exist_ok=True)
env = dict(os.environ, PATH=str(Path(args.gcc).parent) + os.pathsep + os.environ['PATH'])
log = []


def run(command, *, expect_failure=False):
    p = subprocess.run([str(v) for v in command], cwd=root, env=env, text=True,
                       encoding='utf-8', errors='replace', capture_output=True, timeout=90)
    log.append('$ ' + ' '.join(str(v) for v in command) + '\n' + p.stdout + p.stderr)
    if expect_failure:
        if p.returncode == 0:
            raise AssertionError('Invalid board profile unexpectedly compiled')
    elif p.returncode:
        raise RuntimeError(log[-1])
    print(p.stdout, end='')
    return p


cfg = (root / 'main/tusb_config.h').read_text()
cfg = cfg.replace('#include "sdkconfig.h"', '').replace('#include "esp_attr.h"', '')
cfg = cfg.replace('OPT_OS_FREERTOS', 'OPT_OS_NONE').replace('DRAM_ATTR', '')
cfg += '\n#define CFG_TUSB_MCU OPT_MCU_NONE\n#define TUP_DCD_ENDPOINT_MAX 8\n'
(out / 'host_config.h').write_text(cfg)
pins = ['MCLK', 'BCLK', 'LRCK', 'DOUT', 'DIN', 'SDA', 'SCL']
defaults = {f'CONFIG_BRIDGE_{n}_GPIO': 8+i for i, n in enumerate(pins)}


def pin_config(overrides=None, target='ESP32S3'):
    values = {f'CONFIG_IDF_TARGET_{target}': 1, **defaults, **(overrides or {})}
    (out / 'sdkconfig.h').write_text('\n'.join(f'#define {k} {v}' for k, v in values.items()) + '\n')


pin_config()
flags = ['-std=c11', '-Wall', '-Wextra', '-Werror', '-g', '-pthread']
if args.sanitize:
    flags += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
elif os.name == 'nt':
    flags += ['-static']
vendor = 'components/tinyusb/src'
includes = ['-Itools/host/include', '-Imain', '-I' + str(out), '-I' + vendor,
            '-DCFG_TUSB_CONFIG_FILE="host_config.h"']
try:
    version = run([args.gcc, '--version']).stdout.splitlines()[0]
    run([args.gcc, *flags, '-Imain', 'main/bridge_protocol.c', 'tools/test_protocol.c',
         '-o', out / 'test_protocol.exe'])
    run([out / 'test_protocol.exe'])
    run([args.gcc, *flags, '-Imain', 'main/codec_default.c', 'tools/test_codec_default.c',
         '-o', out / 'test_codec_default.exe'])
    run([out / 'test_codec_default.exe'])
    run([args.gcc, *flags, *includes, '-include', 'tools/host/include/fifo_hook.h', '-c',
         vendor + '/common/tusb_fifo.c', '-o', out / 'fifo.o'])
    run([args.gcc, *flags, *includes, 'main/audio_pipe.c', 'main/usb_owner.c',
         'main/usb_descriptors.c', 'tools/host/queue.c', 'tools/test_audio_pipe.c',
         out / 'fifo.o', '-o', out / 'test_audio_pipe.exe'])
    run([out / 'test_audio_pipe.exe'])
    (out / 'pins.c').write_text('#include "board_pins.h"\nint main(void){return 0;}\n')
    command = [args.gcc, '-std=c11', '-Wall', '-Wextra', '-Werror', '-Imain', '-I'+str(out),
               '-c', out / 'pins.c', '-o', out / 'pins.o']
    run(command)
    invalid = [{'CONFIG_BRIDGE_MCLK_GPIO': p} for p in [0, 3, 19, 20, 22, 26, 35, 43, 44, 45, 46, 49]]
    invalid.append({'CONFIG_BRIDGE_SCL_GPIO': 13})
    for profile in invalid:
        pin_config(profile)
        p = run(command, expect_failure=True)
        assert 'static assertion failed' in p.stderr, p.stderr
    pin_config(target='ESP32S31')
    run(command)
    for pin in (7, 15):
        pin_config({'CONFIG_BRIDGE_MCLK_GPIO': pin}, target='ESP32S31')
        p = run(command, expect_failure=True)
        assert 'static assertion failed' in p.stderr, p.stderr
    pin_config()
    result = {'result': 'PASS', 'host_compiler': version, 'sanitizers': bool(args.sanitize),
              'firmwareVersion': '0.4.0',
              'rawCaptureBlocks': 2000,
              'checks': ['actual C register protocol', '83 masked defaults / both output modes / every-operation fault injection / startup fade', 'production FIFO reset guard',
                         'audio queue generation/reset/suspend/alt-setting',
                         '2000 signed full-range stereo blocks preserve exact capture PCM',
                         '20000 worker + 3000 USB owner interleavings',
                         'S3 and S31 GPIO profiles + 15 invalid configurations'],
              'hardware': 'NOT RUN'}
    (root / 'evidence/host-tests.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
finally:
    (root / 'evidence/host-tests.log').write_text('\n'.join(log), encoding='utf-8')
