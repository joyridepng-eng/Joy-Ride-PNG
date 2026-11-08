const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path');
const root=process.argv[2] || path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'hooks/use-driving-route.ts'),'utf8');
const ts=require(require.resolve('typescript',{paths:[root]}));
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^import\s[\s\S]*?;\s*/gm,'').replace('export function useDrivingRoute','function useDrivingRoute');
const good={coordinates:[[147.18,-9.44],[147.175,-9.445],[147.17,-9.45]],distanceMeters:1500,durationSeconds:180};
const base={rideId:'a',origin:{latitude:-9.44,longitude:147.18},destination:{latitude:-9.45,longitude:147.17}};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
function harness(fetcher){
 let cursor=0,clock=0,id=0;const slots=[],effects=[],queue=[],timers=new Map();
 const ctx={AbortController,URLSearchParams,Math,Number,Error,Promise,
 driverFetch:fetcher,offlineTelemetryService:{enqueuePoint(){}},
 useState(v){const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},
 useRef(v){const i=cursor++;return slots[i]??(slots[i]={current:v})},
 useEffect(fn,deps){const i=cursor++;const old=effects[i];if(!old||deps.some((v,n)=>!Object.is(v,old.deps[n])))queue.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()}})},
 setTimeout(fn,ms){timers.set(++id,{fn,at:clock+ms});return id},clearTimeout(i){timers.delete(i)}};
 vm.createContext(ctx);vm.runInContext(js,ctx);
 return{slots,ctx,timers,render(opts=base){cursor=0;ctx.useDrivingRoute(opts);while(queue.length)queue.shift()()},stop(){for(const x of effects)x?.cleanup?.()},async advance(ms){const target=clock+ms;for(;;){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>target)break;clock=next[1].at;timers.delete(next[0]);next[1].fn();await flush()}clock=target;await flush()}};
}
(async()=>{
 let resolve,signals=[],calls=0;
 const h=harness((url,opts)=>{calls++;signals.push(opts.signal);return new Promise(r=>resolve=r)});h.render();
 for(let i=1;i<=4;i++){await h.advance(2000);h.render({...base,origin:{latitude:-9.44-i*.0001,longitude:147.18}})}
 assert.equal(calls,1);assert.equal(signals[0].aborted,false);resolve({ok:true,json:async()=>good});await flush();assert.equal(h.slots[0].coordinates.length,3);await h.advance(10000);assert.equal(calls,2);h.stop();assert.equal(signals[1].aborted,true);
 console.log('PASS Frequent GPS updates do not abort or overlap a slow route request.');
 let resolvers=[];const changed=harness((url,o)=>new Promise(r=>resolvers.push({r,signal:o.signal})));changed.render();changed.render({...base,destination:{latitude:-9.46,longitude:147.16}});assert(resolvers[0].signal.aborted);resolvers[0].r({ok:true,json:async()=>good});await flush();assert.equal(changed.slots[0],null);resolvers[1].r({ok:true,json:async()=>good});await flush();assert(changed.slots[0]);changed.stop();console.log('PASS Destination change ignores old route responses.');
 let count=0;const stationary=harness(async()=>{count++;return{ok:true,json:async()=>good}});stationary.render();await flush();await stationary.advance(60000);assert.equal(count,1);stationary.stop();console.log('PASS Stationary successful routes do not repeatedly request directions.');
 let timeoutCalls=0;const timeout=harness(()=>{timeoutCalls++;return new Promise(()=>{})});timeout.render();await timeout.advance(20000);assert.equal(timeout.slots[2],false);assert.match(timeout.slots[1],/timed out/);await timeout.advance(10000);assert.equal(timeoutCalls,2);timeout.stop();console.log('PASS Timeouts recover and retry even without another GPS update.');
 let n=0;const denied=harness(async()=>{n++;return n===1?{ok:false,status:403}:{ok:true,json:async()=>good}});denied.render();await flush();assert.match(denied.slots[1],/access was denied/);await denied.advance(10000);assert(denied.slots[0]);denied.render({...base,enabled:false});assert.equal(denied.slots[0],null);assert.equal(denied.timers.size,0);console.log('PASS Permission failures retry; disabled hooks stop and clear routes.');
 for(const bad of [{...good,coordinates:[[147,-9],[181,0]]},{...good,durationSeconds:null},{...good,distanceMeters:-1},{...good,coordinates:[[0,0]]}])assert.equal(denied.ctx.parseRoadRoute(bad),null);
 console.log('PASS Invalid geometry and metrics rejected.');
 const preview=harness(async()=>({ok:true,json:async()=>good}));preview.render({origin:base.origin,destination:base.destination,enabled:true});await flush();assert(preview.slots[0]);preview.stop();console.log('PASS Terminal route loads independently of driver GPS.');
})().catch(e=>{console.error(e);process.exitCode=1});
