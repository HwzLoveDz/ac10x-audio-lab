"""Finite audio-only acoustic acquisition; HID is owned by the calling JS session."""
import array,json,math,sys,time,wave
from pathlib import Path
sys.path.insert(0,r'D:\user_app\AC10x-UI-Checks\hardware-audio')
import sounddevice as sd
out=Path(sys.argv[1]);out.mkdir(exist_ok=False)
fs=48000;phases=[];values=[]
def phase(name,seconds,hz=None):
 start=len(values)
 for i in range(round(fs*seconds)):
  t=i/fs;env=max(0,min(1,t/.025,(seconds-t)/.025));values.append(round(4096*env*math.sin(2*math.pi*hz*t)) if hz else 0)
 phases.append(dict(name=name,startFrame=start,frames=len(values)-start,hz=hz))
phase('quiet_before',1.5)
for f in [997,1500,2500,4000,8000]:phase(str(f),1.5,f);phase('gap_'+str(f),.2)
phase('continuity',8,1500);phase('quiet_after',1.5)
pcm=array.array('h',(v for v in values for _ in range(2))).tobytes();seconds=len(values)/fs
with wave.open(str(out/'stimulus.wav'),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(fs);w.writeframes(pcm)
result=dict(status='STARTING',label=sys.argv[2],sampleRate=fs,seconds=seconds,phases=phases,warnings=[],codecWrites=0,endpointChanges=0)
position=0;abort=False;timing={};buffers={'external':[],'ECM':[]};rates={}
def stamp(name,info,output=False):
 if name not in timing:timing[name]=time.monotonic()+getattr(info,'outputBufferDacTime' if output else 'inputBufferAdcTime')-info.currentTime
def capture(name):
 def cb(data,frames,info,status):
  global abort
  stamp(name,info);b=bytes(data);buffers[name].append(b)
  if status:result['warnings'].append({'source':name,'status':str(status)});abort=True
  if max(map(abs,array.array('h',b)),default=0)>=31128:result['warnings'].append({'source':name,'status':'NEAR_CLIP'});abort=True
 return cb
def output(data,frames,info,status):
 global position,abort
 stamp('output',info,True)
 if status:result['warnings'].append({'source':'output','status':str(status)});abort=True
 b=pcm[position:position+len(data)] if not abort else b'';data[:]=b+bytes(len(data)-len(b));position+=len(data)
try:
 apis=sd.query_hostapis();devs=[(i,d) for i,d in enumerate(sd.query_devices()) if apis[d['hostapi']]['name']=='Windows WASAPI']
 ext=[x for x in devs if x[1]['max_input_channels']>=2 and 'USB AUDIO' in x[1]['name']]
 rec=[x for x in devs if x[1]['max_input_channels']>=2 and 'AC10x' in x[1]['name']]
 dst=[x for x in devs if x[1]['max_output_channels']>=2 and 'AC10x' in x[1]['name']]
 assert all(len(x)==1 for x in [ext,rec,dst]);assert int(dst[0][1]['default_samplerate'])==fs
 rates={'external':int(ext[0][1]['default_samplerate']),'ECM':int(rec[0][1]['default_samplerate'])}
 result['endpoints']={name:v[0][1]['name'] for name,v in [('external',ext),('ECM',rec),('output',dst)]}
 settings=sd.WasapiSettings(exclusive=False);started=time.monotonic()
 with sd.RawInputStream(device=ext[0][0],samplerate=rates['external'],channels=2,dtype='int16',extra_settings=settings,callback=capture('external')):
  with sd.RawInputStream(device=rec[0][0],samplerate=rates['ECM'],channels=2,dtype='int16',extra_settings=settings,callback=capture('ECM')):
   with sd.RawOutputStream(device=dst[0][0],samplerate=fs,channels=2,dtype='int16',extra_settings=settings,callback=output):
    while position<len(pcm) and not abort and time.monotonic()-started<seconds+10:time.sleep(.02)
   if abort or position<len(pcm):raise RuntimeError('Audio stop condition or deadline')
 result['status']='AUDIO_CAPTURE_COMPLETED'
except Exception as e:result.update(status='STOPPED',error=repr(e));raise
finally:
 for name,chunks in buffers.items():
  if chunks:
   with wave.open(str(out/(name+'_stereo_raw.wav')),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(rates[name]);w.writeframes(b''.join(chunks))
 result.update(timingMonotonic=timing,inputRates=rates,framesSubmitted=min(position//4,len(pcm)//4),allAudioHandlesClosed=True)
 (out/'audio.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8')
 print(json.dumps({'status':result['status'],'label':result['label'],'seconds':seconds,'warnings':result['warnings']}),flush=True)
