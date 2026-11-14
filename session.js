/* Serialized hardware transactions, guarded recovery, and explicit undo. */
(function(root){
  'use strict';
  const C=typeof module!=='undefined'&&module.exports?require('./codec.js'):root.AudioCodec;
  class SessionError extends Error{constructor(code,message,details={}){super(message);this.name='SessionError';this.code=code;this.details=details;}}
  const copy=x=>JSON.parse(JSON.stringify(x));
  const clockAddresses=new Set([4,5,7,8,9,10,11,12,13,14,15]);
  class RegisterSession{
    constructor(bridge,{onProgress=()=>{}}={}){
      this.bridge=bridge;this.onProgress=onProgress;this.snapshot=null;this.readAt=null;
      this.stale=true;this.busy=false;this.cancelled=false;this.lastTransaction=null;this.history=[];
    }
    cancel(){this.cancelled=true;}
    check(){if(this.cancelled)throw new SessionError('CANCELLED','已取消后续操作');if(!this.bridge.connected)throw new SessionError('DISCONNECTED','USB 已断开');}
    async own(work){if(this.busy)throw new SessionError('BUSY','已有硬件操作正在进行');this.busy=true;this.cancelled=false;try{return await work();}finally{this.busy=false;}}
    async readFresh(){
      const next={};
      for(let i=0;i<C.READ_ADDRESSES.length;i++){
        this.check();const address=C.READ_ADDRESSES[i];next[address]=await this.bridge.readRegister(address);
        if(address===0&&next[0]!==0x12)throw new SessionError('CHIP_ID','芯片 ID 与当前参数表不匹配，停止写入',{chipId:next[0]});
        this.onProgress({phase:'read',completed:i+1,total:C.READ_ADDRESSES.length,address});
      }
      return next;
    }
    accept(snapshot){this.snapshot=snapshot;this.readAt=new Date().toISOString();this.stale=false;}
    async readAll(){return this.own(async()=>{try{const next=await this.readFresh();this.accept(next);return next;}catch(e){this.stale=true;throw e;}});}
    async recover(backup,live,clock){
      const restored=[],restoreFailed=[],conflicts=[],addresses=[...backup.keys()];
      if(!addresses.length)return{restored,restoreFailed};
      if(!this.bridge.connected||this.bridge.fault)return{restored,restoreFailed:addresses.map(address=>({address,message:'连接不可用，未重放恢复写入'}))};
      try{
        // Recovery reads bypass only the cancellation flag; connection and ID remain guarded.
        if(await this.bridge.readRegister(0)!==0x12)throw new Error('恢复前芯片 ID 不匹配');
        const current={...live};
        for(const address of new Set([...addresses,7,0x1c,0x31,0x4f]))current[address]=await this.bridge.readRegister(address);
        // Rollback owns only this transaction's bits. Do not erase an intervening writer.
        for(const address of addresses){
          const p=backup.get(address),actual=current[address]&p.mask;
          const known=[p.value,p.expected,p.verified].filter(Number.isInteger).map(value=>value&p.mask);
          if(!known.includes(actual))conflicts.push({address,mask:p.mask,actual:current[address]});
        }
        if(conflicts.length)throw new SessionError('RECOVERY_CONFLICT','恢复前目标位已被其他操作修改，已停止恢复，未覆盖新值');
        const recoveryExpected={...current};
        const steps=addresses.map(address=>{const p=backup.get(address);return{address,mask:p.mask,value:p.value,groups:clock?['clock']:['manual']};}).filter(p=>(current[p.address]&p.mask)!==(p.value&p.mask));
        // Use the same mute / GEN / EQ / dynamics ordering for recovery as for commit.
        const sequence=C.sequence({steps},current);
        for(const p of sequence){
          const before=await this.bridge.readRegister(p.address),mask=backup.get(p.address)?.mask??p.mask;
          if((before&mask)!==(recoveryExpected[p.address]&mask)){
            conflicts.push({address:p.address,mask,actual:before});
            throw new SessionError('RECOVERY_CONFLICT','恢复期间目标位发生变化，已停止恢复，未覆盖新值');
          }
          const wanted=C.patchValue(before,p);
          const actual=await this.bridge.writeRegister(p.address,wanted);
          if((actual&p.mask)!==(wanted&p.mask))throw new Error('恢复读回不匹配：0x'+p.address.toString(16));
          current[p.address]=actual;recoveryExpected[p.address]=actual;
        }
        for(const address of addresses){
          const p=backup.get(address),actual=await this.bridge.readRegister(address);
          if((actual&p.mask)!==(p.value&p.mask))throw new Error('恢复最终核验不匹配：0x'+address.toString(16));
          restored.push(address);
        }
      }catch(e){for(const address of addresses)if(!restored.includes(address))restoreFailed.push({address,message:e.message});}
      return{restored,restoreFailed,...(conflicts.length?{recoveryConflicts:conflicts}:{})};
    }
    async commit(plan,live,{kind='apply',clock=false}={}){
      const backup=new Map(),written=[],sequence=C.sequence(plan,live),startedAt=new Date().toISOString();
      this.onProgress({phase:'plan',completed:0,total:sequence.length,plan,steps:sequence});
      try{
        for(let i=0;i<sequence.length;i++){
          this.check();const p=sequence[i],before=await this.bridge.readRegister(p.address);
          if(p.address===0x26&&((before^live[p.address])&0x10))throw new SessionError('CONCURRENT_CHANGE','Line Out 输出模式在事务中发生变化，请重新读回');
          const wanted=C.patchValue(before,p);
          if(wanted!==before){
            if(!backup.has(p.address))backup.set(p.address,{value:before,mask:0,expected:before,verified:before});
            const owned=backup.get(p.address),newMask=p.mask&~owned.mask;
            owned.value=(owned.value&~newMask)|(before&newMask);
            owned.expected=(owned.expected&~newMask)|(before&newMask);
            owned.verified=(owned.verified&~newMask)|(before&newMask);
            owned.mask|=p.mask;owned.expected=C.patchValue(owned.expected,p);
            const actual=await this.bridge.writeRegister(p.address,wanted);written.push(p.address);live[p.address]=actual;
            if((actual&p.mask)!==(wanted&p.mask))throw new SessionError('VERIFY','寄存器写后核验失败',{address:p.address,expected:wanted,actual,mask:p.mask});
            owned.verified=C.patchValue(owned.verified,{mask:p.mask,value:actual});
          }else live[p.address]=before;
          this.onProgress({phase:'write',completed:i+1,total:sequence.length,address:p.address,label:p.label});
        }
        const final=await this.readFresh();
        for(const p of plan.expected||plan.steps)if((final[p.address]&p.mask)!==(p.after&p.mask))throw new SessionError('VERIFY','最终读回不匹配',{address:p.address,expected:p.after,actual:final[p.address]});
        this.accept(final);
        if(written.length){
          const transaction={kind,startedAt,completedAt:new Date().toISOString(),clock,
            fields:[...backup].map(([address,p])=>({address,mask:p.mask,before:p.value,after:final[address]})),writes:written.length};
          this.history.push(copy(transaction));if(this.history.length>20)this.history.shift();
          this.lastTransaction=kind==='undo'?null:transaction;
        }else if(kind==='undo')this.lastTransaction=null;
        return{snapshot:final,plan,writes:written.length,verified:true};
      }catch(e){
        const recovery=await this.recover(backup,live,clock);this.stale=true;
        this.history.push({kind,status:'failed',startedAt,completedAt:new Date().toISOString(),errorCode:e.code||'ERROR',attempted:[...backup.keys()],written,...recovery});if(this.history.length>20)this.history.shift();
        e.details={...(e.details||{}),attempted:[...backup.keys()],written,...recovery};throw e;
      }
    }
    async apply(config,options={}){return this.own(async()=>{
      // Freeze both model and scope before the first read yields to the caller.
      config=copy(config);options=copy(options);
      let live;
      try{
        const groups=options.groups||['routing','eq','dynamics'];C.assertAdapterClock(config,{...options,groups},this.bridge.device);
        live=await this.readFresh();
        if(!groups.includes('clock')&&groups.some(g=>g==='eq'||g==='dynamics')){
          const fs=C.inferFs(live,options.mclkHz||config.clock.fs*256);
          if(fs!==config.clock.fs)throw new SessionError('SAMPLE_RATE','设备采样率与草稿不一致；请先导入设备标量或配置时钟');
        }
        const plan=C.makePlan(config,live,options);
        for(const p of plan.steps)C.assertAdapterRegister(p.address,p.after,this.bridge.device);
        return await this.commit(plan,live,{kind:'apply',clock:groups.includes('clock')});
      }catch(e){if(!e.details?.attempted&&live)this.accept(live);else this.stale=true;throw e;}
    });}
    async restoreLast(){return this.own(async()=>{
      try{
        if(!this.lastTransaction)throw new SessionError('NO_UNDO','本次连接没有可恢复的已核验写入');
        const t=copy(this.lastTransaction),live=await this.readFresh();
        for(const p of t.fields)if((live[p.address]&p.mask)!==(p.after&p.mask))throw new SessionError('CONCURRENT_CHANGE','设备已偏离上次事务结果，未执行恢复',{address:p.address});
        const steps=t.fields.map(p=>({...p,value:p.before,after:C.patchValue(live[p.address],{mask:p.mask,value:p.before}),groups:t.clock?['clock']:['manual']}));
        return await this.commit({steps,notes:['仅恢复上次写入拥有的位；保留其他位']},live,{kind:'undo',clock:t.clock});
      }catch(e){this.stale=true;throw e;}
    });}
    async readOne(address){return this.own(async()=>{try{this.check();const value=await this.bridge.readRegister(address);if(this.snapshot)this.snapshot[address]=value;return value;}catch(e){this.stale=true;throw e;}});}
    async writeOne(address,value){return this.own(async()=>{
      try{
        this.check();const mask=C.masks[address];if(!mask)throw new SessionError('READ_ONLY','复位、供电电压、只读和保留地址不开放写入');
        if(!Number.isInteger(value)||value<0||value>255)throw new SessionError('ARGUMENT','寄存器值必须是0–255整数');
        C.assertAdapterRegister(address,value,this.bridge.device);
        const live=await this.readFresh(),before=live[address],wanted=C.patchValue(before,{mask,value});
        const clock=clockAddresses.has(address),steps=before===wanted?[]:[{address,mask,value:wanted,before,after:wanted,groups:clock?['clock']:['manual']}];
        const result=await this.commit({steps,expected:[{address,mask,after:wanted}],notes:[]},live,{kind:'single',clock});
        return{address,before,actual:result.snapshot[address],mask,verified:true,writes:result.writes};
      }catch(e){this.stale=true;throw e;}
    });}
  }
  const api={SessionError,RegisterSession};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AudioHardwareSession=api;
})(typeof globalThis!=='undefined'?globalThis:this);
