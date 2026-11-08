const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path');
const root=process.argv[2] || path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'services/background-gps.ts'),'utf8').replace(/\r\n/g, "\n").replace(/^import .*;\n/gm,'').replace(/export /g,'');
const ts=require(require.resolve('typescript',{paths:[root]}));
const code=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const flush=async()=>{for(let i=0;i<80;i++)await Promise.resolve()};
function harness(){
 let now=2000000000000,tid=0;const timers=new Map();class Clock extends Date{static now(){return now}};
 const state={session:{accessToken:'test-only',tokenType:'Bearer',expiresAt:now+600000,driver:{id:'driver-A'}},online:true,ride:null,storage:new Map(),started:false,posts:[],permission:true,watches:[],starts:0,http:0};
 const ctx={Date:Clock,Promise,Set,Error,JSON,Number,Math,AbortController,
 setTimeout:(fn,ms)=>{timers.set(++tid,{fn,ms});return tid},clearTimeout:id=>timers.delete(id),
 AsyncStorage:{getItem:async k=>state.storage.get(k)??null,setItem:async(k,v)=>state.storage.set(k,v),removeItem:async k=>state.storage.delete(k)},
 Constants:{executionEnvironment:'standalone'},Platform:{OS:'android'},AppState:{currentState:'active'},Alert:{alert:()=>{}},API_BASE_URL:'https://test.invalid',
 loadDriverSession:async()=>state.session,subscribeToDriverSession:fn=>{state.listener=fn},
 Location:{Accuracy:{High:4},hasStartedLocationUpdatesAsync:async()=>state.started,stopLocationUpdatesAsync:async()=>{state.started=false},startLocationUpdatesAsync:async()=>{state.started=true;state.starts++},requestForegroundPermissionsAsync:async()=>({granted:state.permission}),getBackgroundPermissionsAsync:async()=>({granted:true}),hasServicesEnabledAsync:async()=>true,
 watchPositionAsync:async(options,callback,error)=>{const watch={options,callback,error,removed:false};state.watches.push(watch);if(state.delayWatch)return new Promise(r=>state.finishWatch=()=>r({remove:()=>watch.removed=true}));return{remove:()=>watch.removed=true}}},
 TaskManager:{isTaskDefined:()=>false,defineTask:(name,fn)=>{state.task=fn},isAvailableAsync:async()=>true},
 fetch:async(url,opt)=>{let data,status=200;if(state.failNetwork)throw Error('private-response-must-not-display');
 if(url.endsWith('/drivers/me'))data={id:state.session?.driver.id,status:'APPROVED',isOnline:state.online};
 else if(url.endsWith('/rides/driver/me/active'))data=state.ride;
 else {if(state.http)status=state.http;else state.posts.push(JSON.parse(opt.body));data={driverId:state.session?.driver.id};}
 return{ok:status===200,status,text:async()=>JSON.stringify(data)};
 }};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 return{ctx,state,timers,sample:()=>({timestamp:++now,coords:{latitude:-9.45,longitude:147.18,accuracy:5,heading:10,speed:1}}),snapshot:()=>vm.runInContext("getBackgroundGPSSnapshot()",ctx),advance:ms=>now+=ms};
}
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
test('Start requests a fresh fix without waiting for movement',async()=>{const h=harness();await h.ctx.enableBackgroundGPS();assert.equal(h.state.watches.length,1);h.state.watches[0].callback(h.sample());await flush();assert(h.snapshot().latestLocation);assert.equal(h.state.posts.length,1);assert(h.state.watches[0].removed);await h.ctx.stopBackgroundGPS()});
test('Repeated Go Online preserves last accepted fix and service registration',async()=>{const h=harness();await h.ctx.enableBackgroundGPS();h.state.watches[0].callback(h.sample());await flush();const before=h.snapshot().latestLocation;await h.ctx.enableBackgroundGPS();assert.equal(h.snapshot().latestLocation,before);assert.equal(h.state.starts,1);assert.equal(h.state.watches.length,2);await h.ctx.stopBackgroundGPS()});
test('Resume requests fresh position and ignores cached samples',async()=>{const h=harness();await h.ctx.enableBackgroundGPS();h.state.watches[0].callback(h.sample());await flush();h.advance(60000);await h.ctx.restoreBackgroundGPS();const w=h.state.watches[1];const old=h.sample();old.timestamp-=60000;w.callback(old);await flush();assert.equal(h.state.posts.length,1);w.callback(h.sample());await flush();assert.equal(h.state.posts.length,2);await h.ctx.stopBackgroundGPS()});
test('Parallel resume calls use one first-fix watcher',async()=>{const h=harness();await h.ctx.enableBackgroundGPS();await Promise.all([h.ctx.restoreBackgroundGPS(),h.ctx.restoreBackgroundGPS()]);assert.equal(h.state.watches.length,1);await h.ctx.stopBackgroundGPS()});
test('Stop/offline removes watcher and ignores late coordinates',async()=>{const h=harness();await h.ctx.enableBackgroundGPS();await h.ctx.stopBackgroundGPS();h.state.watches[0].callback(h.sample());await flush();assert.equal(h.state.posts.length,0);assert.equal(h.snapshot().latestLocation,null);assert.equal(h.snapshot().enabled,false);assert(h.state.watches[0].removed)});
test('Logout and another account cannot receive old first-fix callback',async()=>{const h=harness();await h.ctx.enableBackgroundGPS();const old=h.state.watches[0];h.state.session={...h.state.session,accessToken:'other-test-only',driver:{id:'driver-B'}};h.state.listener(h.state.session);await flush();await h.ctx.enableBackgroundGPS();old.callback(h.sample());await flush();assert.equal(h.state.posts.length,0);assert.equal(h.snapshot().latestLocation,null);await h.ctx.stopBackgroundGPS()});
test('Late native watcher registration is removed after stop',async()=>{const h=harness();h.state.delayWatch=true;await h.ctx.enableBackgroundGPS();await h.ctx.stopBackgroundGPS();h.state.finishWatch();await flush();assert(h.state.watches[0].removed)});
test('GPS timeout exposes safe actionable message and cleans up',async()=>{const h=harness();await h.ctx.enableBackgroundGPS();const timer=[...h.timers.values()].find(x=>x.ms===30000);timer.fn();await flush();assert.match(h.snapshot().errorMessage,/No fresh GPS/);assert(h.state.watches[0].removed);await h.ctx.stopBackgroundGPS()});
test('Failed upload does not fabricate an accepted map position',async()=>{const h=harness();await h.ctx.enableBackgroundGPS();h.state.http=400;h.state.watches[0].callback(h.sample());await flush();assert.equal(h.snapshot().latestLocation,null);assert.match(h.snapshot().errorMessage,/location upload failed \(HTTP 400\)/);await h.ctx.stopBackgroundGPS()});
test('Server-offline driver stops tracking',async()=>{const h=harness();await h.ctx.enableBackgroundGPS();h.state.online=false;h.state.watches[0].callback(h.sample());await flush();assert.equal(h.snapshot().enabled,false);assert.equal(h.state.posts.length,0)});
test('Expired session and missing permission cannot upload',async()=>{const h=harness();h.state.permission=false;await h.ctx.enableBackgroundGPS();assert.equal(h.state.watches.length,0);h.state.permission=true;await h.ctx.enableBackgroundGPS();h.advance(700000);h.state.watches[0].callback(h.sample());await flush();assert.equal(h.state.posts.length,0);assert.equal(h.snapshot().enabled,false)});
test('Active ride association clears after completion',async()=>{const h=harness();await h.ctx.enableBackgroundGPS();h.state.ride={id:'ride-A',status:'IN_PROGRESS',driver:{id:'driver-A'}};h.state.watches[0].callback(h.sample());await flush();assert.equal(h.state.posts[0].rideId,'ride-A');h.state.ride=null;await h.ctx.receiveBackgroundLocations([h.sample()]);assert.equal(h.state.posts[1].rideId,undefined);await h.ctx.stopBackgroundGPS()});
(async()=>{for(const[name,fn]of tests){await fn();console.log('PASS '+name)}console.log(tests.length+' GPS regression checks passed (mock device and server).')})().catch(e=>{console.error(e.message);process.exitCode=1});
