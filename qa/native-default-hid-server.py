"""Bounded native HID acceptance backend; no browser or network service.

Requires an explicit test policy and output directory, never logs HID paths or
serials. Clock gating and firmware/reset commands are deliberately absent.
"""
import argparse, ctypes, json, sys, time
from pathlib import Path
from ctypes import wintypes

args=argparse.ArgumentParser()
args.add_argument('--policy',required=True)
args.add_argument('--hid-module-dir',required=True)
args=args.parse_args()
policy=json.loads(Path(args.policy).read_text(encoding='utf-8'))
max_writes=policy.get('maxWrites',150)
if type(max_writes)!=int or not 1<=max_writes<=600:raise RuntimeError('INVALID_WRITE_BUDGET')
sys.path.insert(0,args.hid_module_dir)
import hid

device=None
cache={}
fault=False
writes=0
started=time.monotonic()
commands=0

def caps(path):
    k=ctypes.WinDLL('kernel32',use_last_error=True)
    h=ctypes.WinDLL('hid',use_last_error=True)
    k.CreateFileW.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,ctypes.c_void_p,wintypes.DWORD,wintypes.DWORD,wintypes.HANDLE]
    k.CreateFileW.restype=wintypes.HANDLE
    k.CloseHandle.argtypes=[wintypes.HANDLE]
    h.HidD_GetPreparsedData.argtypes=[wintypes.HANDLE,ctypes.POINTER(ctypes.c_void_p)]
    h.HidD_GetPreparsedData.restype=ctypes.c_ubyte
    h.HidD_FreePreparsedData.argtypes=[ctypes.c_void_p]
    h.HidP_GetCaps.argtypes=[ctypes.c_void_p,ctypes.c_void_p]
    h.HidP_GetCaps.restype=wintypes.LONG
    handle=k.CreateFileW(path.decode('utf8'),0,3,None,3,0,None)
    if handle==ctypes.c_void_p(-1).value:raise RuntimeError('CAPS_OPEN_FAILED')
    ptr=ctypes.c_void_p()
    try:
        if not h.HidD_GetPreparsedData(handle,ctypes.byref(ptr)):raise RuntimeError('PREPARSED_FAILED')
        buf=ctypes.create_string_buffer(64)
        if h.HidP_GetCaps(ptr,buf)<0:raise RuntimeError('CAPS_FAILED')
        f=(ctypes.c_ushort*5).from_buffer_copy(buf.raw[:10])
        if list(f[:4])!=[1,0xff00,11,11]:raise RuntimeError('EXPECTED_VENDOR_10BYTE_REPORTS')
        return {'usage':f[0],'usagePage':f[1],'inputBytesWithReportId':f[2],'outputBytesWithReportId':f[3]}
    finally:
        if ptr:h.HidD_FreePreparsedData(ptr)
        k.CloseHandle(handle)

def exchange(q):
    global writes,commands,fault
    if fault:raise RuntimeError('FAULT_NO_REPLAY')
    if time.monotonic()-started>120 or commands>=6000:raise RuntimeError('TEST_DEADLINE')
    if len(q)!=10 or any(type(v)!=int or not 0<=v<=255 for v in q):raise RuntimeError('BAD_REPORT')
    command=q[0]
    if command not in (0,1,126):raise RuntimeError('NON_ACCEPTANCE_COMMAND_DENIED')
    if command in (0,1):
        a=q[4]
        if q[1:4]!=[1,0x66,0] or q[6:8]!=[0,1] or a not in policy['readAddresses']:raise RuntimeError('BAD_REGISTER_COMMAND')
        if command==0:
            mask=policy['masks'].get(str(a),0)
            if not mask or a in (0,1) or a not in cache:raise RuntimeError('WRITE_DENIED')
            if (cache[a]^q[5])&(~mask&255):raise RuntimeError('RESERVED_BITS_DENIED')
            if a==28 and q[5]>policy.get('maxDACValue',0):raise RuntimeError('DAC_LEVEL_DENIED')
            if writes>=max_writes:raise RuntimeError('WRITE_LIMIT')
            writes+=1
    commands+=1
    try:
        if device.write(bytes([0]+q)) not in (10,11):raise RuntimeError('OUTPUT_FAILED')
        until=time.monotonic()+1.5
        while time.monotonic()<until:
            r=list(device.read(11,max(1,int((until-time.monotonic())*1000))))
            if len(r)==11 and r[0]==0:r=r[1:]
            if len(r)!=10 or r[0]!=command:continue
            if command in (0,1):
                if r[1]!=1 or r[4:7]!=[0,a,1] or r[8 if command==1 else 7]!=0x66:continue
                if r[7 if command==1 else 8]!=1:raise RuntimeError('I2C_NACK')
                if command==1:cache[a]=r[2]
                else:cache[a]=q[5]
            elif r[1]!=1 or r[8]!=1:raise RuntimeError('STATUS_REJECTED')
            return r
        raise RuntimeError('INPUT_TIMEOUT')
    except Exception:
        fault=True
        raise

try:
    for line in sys.stdin:
        item=json.loads(line)
        try:
            op=item['op']
            if op=='open':
                if device is not None:raise RuntimeError('ALREADY_OPEN')
                found=[d for d in hid.enumerate(0x303a,0x4004) if d.get('usage_page')==0xff00 and d.get('usage')==1]
                if len(found)!=1:raise RuntimeError('EXPECTED_ONE_S31_CONTROL_HID')
                properties=caps(found[0]['path'])
                device=hid.device();device.open_path(found[0]['path']);device.set_nonblocking(1)
                for _ in range(16):
                    if not device.read(11):break
                device.set_nonblocking(0)
                value={'productName':found[0].get('product_string','S31'),**properties}
            elif op=='send':value=exchange(item['payload'])
            elif op=='close':
                if device:device.close();device=None
                value={'closed':True,'writes':writes,'commands':commands}
            else:raise RuntimeError('OPERATION_DENIED')
            print(json.dumps({'id':item['id'],'value':value}),flush=True)
            if op=='close':break
        except Exception as e:
            print(json.dumps({'id':item['id'],'error':str(e)}),flush=True)
finally:
    if device:device.close()
