// Runs the actual patched service methods against a transaction/lock test double.
// This does not replace a PostgreSQL integration test or the two-phone acceptance test.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const base = process.argv[2] || path.resolve(__dirname, '..');
const local = fs.existsSync(path.join(base, 'rides.service.ts'));
const files = local ? ['driver-assignment-lock.ts','drivers.service.ts','rides.service.ts'] :
 ['src/common/driver-assignment-lock.ts','src/drivers/drivers.service.ts','src/rides/rides.service.ts'];
let ts;
try { ts = require(require.resolve('typescript', { paths: [base] })); } catch {}
const enums = new Proxy({}, {get: (_,key)=>String(key)});
class Decimal { constructor(n){this.n=Number(n)} times(n){return new Decimal(this.n*n)} toDecimalPlaces(n){return new Decimal(this.n.toFixed(n))} toString(){return String(this.n)} }
const ctx = vm.createContext({
 console, Set, Date, Math, Number, Boolean, Promise,
 Prisma: {TransactionIsolationLevel: enums, Decimal},
 RideStatus: enums, DriverStatus: enums, VehicleStatus: enums, ServiceStatus: enums,
 RideAuditActorType: enums, RideAuditEventType: enums, RideSettlementStatus: enums,
 BadRequestException: Error, NotFoundException: Error,
 haversineDistanceKm: ()=>0,
 assertRideStatusTransition: (from,to)=>{
   const allowed = {REQUESTED:['CANCELLED'], ACCEPTED:['DRIVER_ARRIVED','CANCELLED'], DRIVER_ARRIVED:['IN_PROGRESS','CANCELLED'], IN_PROGRESS:['COMPLETED','CANCELLED']};
   if (!allowed[from]?.includes(to)) throw new Error('Invalid transition');
 },
});
for (const file of files) {
 let source=fs.readFileSync(path.join(base,file),'utf8')
  .replace(/^import\s[\s\S]*?;\s*/gm,'').replace(/@Injectable\(\)\s*/g,'').replace(/\bexport /g,'');
 const js=ts ? ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText :
  require('node:module').stripTypeScriptTypes(source,{mode:'transform'});
 vm.runInContext(js,ctx,{filename:file});
}
const DriversService=vm.runInContext('DriversService',ctx), RidesService=vm.runInContext('RidesService',ctx);
const clone=v=>v==null?v:structuredClone(v);
function fixture() {
 const state={drivers:[{id:'d1',status:'APPROVED',isOnline:true,isAvailable:true,serviceZoneId:'z1',fullName:'Test',
 licenseNumber:'TEST',licenseClass:'TEST',licenseIssuedAt:new Date('2020-01-01'),licenseExpiresAt:new Date('2099-01-01'),dateOfBirth:new Date('1990-01-01'),emergencyContactName:'Test',emergencyContactPhone:'Test',emergencyContactRelationship:'Test'}],
 vehicles:[{id:'v1',driverId:'d1',status:'ACTIVE'}],rides:[],audits:[],notifications:[],settlements:[]};
 const locks=new Map();
 function match(row,where={}) {
  return Object.entries(where).every(([k,v])=>{
   if(v===undefined)return true;
   if(k==='vehicles')return state.vehicles.some(x=>x.driverId===row.id&&match(x,v.some));
   if(k==='OR')return v.some(x=>match(row,x));
   if(k==='locationPing'||k==='location'||k==='serviceZone')return true;
   if(v && typeof v==='object') { if(v.in)return v.in.includes(row[k]); if(v.not!==undefined)return row[k]!==v.not; }
   return row[k]===v;
  });
 }
 function readDriver(row,args={}) {
  if(!row)return null;
  return {...clone(row),locationPing:{latitude:0,longitude:0,recordedAt:new Date()}, vehicles:state.vehicles.filter(x=>x.driverId===row.id&&match(x,args.include?.vehicles?.where)).map(clone)};
 }
 function client(txState) {
  const write=(table,args)=>{
   if(!txState?.locked)throw new Error('Mutation without driver lock');
   const rows=state[table].filter(x=>match(x,args.where));
   for(const row of rows){const before=clone(row);txState.undo.push(()=>{for(const k of Object.keys(row))delete row[k];Object.assign(row,before)});for(const [k,v]of Object.entries(args.data))if(v!==undefined)row[k]=v;}
   return rows;
  };
  return {
   driver:{findUnique:async args=>readDriver(state.drivers.find(x=>match(x,args.where)),args),findMany:async args=>state.drivers.filter(x=>match(x,args.where)).map(x=>readDriver(x,args)),update:async args=>readDriver(write('drivers',args)[0],args),updateMany:async args=>({count:write('drivers',args).length})},
   vehicle:{updateMany:async args=>({count:write('vehicles',args).length})},
   ride:{findUnique:async args=>clone(state.rides.find(x=>match(x,args.where))||null),findFirst:async args=>clone(state.rides.find(x=>match(x,args.where))||null),findMany:async args=>clone(state.rides.filter(x=>match(x,args.where))),updateMany:async args=>({count:write('rides',args).length})},
   rideAuditEvent:{create:async({data})=>{state.audits.push(data);txState.undo.push(()=>state.audits.splice(state.audits.indexOf(data),1));}},
   rideSettlement:{upsert:async args=>{state.settlements.push(args);txState.undo.push(()=>state.settlements.splice(state.settlements.indexOf(args),1));}},
   $executeRaw:async(strings,key)=>{
    assert.match(strings.join(''),/pg_advisory_xact_lock/);assert.match(key,/^joyride:driver-assignment:/);
    const previous=locks.get(key)||Promise.resolve();let release;const tail=new Promise(resolve=>release=resolve);locks.set(key,tail);
    await previous;txState.locked=true;txState.release=release;
    return 1;
   },
  };
 }
 const db=client(null);
 db.$transaction=async(fn,options)=>{
  assert.equal(options.isolationLevel,'ReadCommitted');
  const t={undo:[],locked:false};try{return await fn(client(t))}catch(e){for(const undo of t.undo.reverse())undo();throw e}finally{t.release?.()}
 };
 const notifications={createDriverRideAssignedItem:async(tx,id,driverId)=>{state.notifications.push({id,driverId});}};
 const rides=new RidesService(db,{},notifications),drivers=new DriversService(db);
 const addRide=(id,status='REQUESTED',driverId=null)=>state.rides.push({id,status,driverId,vehicleId:driverId?'v1':null,serviceZoneId:'z1',estimatedFare:10,finalFare:null});
 return {state,db,rides,drivers,addRide};
}
const cases=[];const test=(name,fn)=>cases.push([name,fn]);
for(const status of ['ACCEPTED','DRIVER_ARRIVED','IN_PROGRESS']) {
 test('Blocks second assignment with stale available flag: '+status,async()=>{const f=fixture();f.addRide('a',status,'d1');f.addRide('b');await assert.rejects(()=>f.rides.assignDriver('b',{driverId:'d1'}),/not available/);assert.equal(f.state.rides[1].status,'REQUESTED');assert.equal(f.state.notifications.length,0);});
 test('Go Online/Mark Available stays busy: '+status,async()=>{const f=fixture();f.addRide('a',status,'d1');const d=await f.drivers.updateAvailability('d1',{isOnline:true,isAvailable:true});assert.equal(d.isOnline,true);assert.equal(d.isAvailable,false);});
}
test('Only one of two simultaneous assignments succeeds',async()=>{const f=fixture();f.addRide('a');f.addRide('b');const out=await Promise.allSettled([f.rides.assignDriver('a',{driverId:'d1'}),f.rides.assignDriver('b',{driverId:'d1'})]);assert.equal(out.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.state.notifications.length,1);assert.equal(f.state.drivers[0].isAvailable,false);});
test('Availability request racing with assignment cannot reopen driver',async()=>{const f=fixture();f.addRide('a');await Promise.all([f.rides.assignDriver('a',{driverId:'d1'}),f.drivers.updateAvailability('d1',{isOnline:true,isAvailable:true})]);assert.equal(f.state.drivers[0].isAvailable,false);});
test('Completion restores availability and permits next assignment, with receipt',async()=>{const f=fixture();f.addRide('a','IN_PROGRESS','d1');f.state.drivers[0].isAvailable=false;await f.rides.updateStatus('a',{status:'COMPLETED'},'d1');assert.equal(f.state.drivers[0].isAvailable,true);assert.equal(f.state.settlements.length,1);f.addRide('b');await f.rides.assignDriver('b',{driverId:'d1'});assert.equal(f.state.drivers[0].isAvailable,false);});
test('Completing one legacy duplicate keeps driver busy',async()=>{const f=fixture();f.addRide('a','IN_PROGRESS','d1');f.addRide('b','ACCEPTED','d1');await f.rides.updateStatus('a',{status:'COMPLETED'},'d1');assert.equal(f.state.drivers[0].isAvailable,false);});
for(const reason of ['offline','suspended','no-active-vehicle'])test('Completion does not release '+reason,async()=>{const f=fixture();f.addRide('a','IN_PROGRESS','d1');if(reason==='offline')f.state.drivers[0].isOnline=false;if(reason==='suspended')f.state.drivers[0].status='SUSPENDED';if(reason==='no-active-vehicle')f.state.vehicles[0].status='INACTIVE';await f.rides.updateStatus('a',{status:'COMPLETED'},'d1');assert.equal(f.state.drivers[0].isAvailable,false);});
test('Registry and driver status mask stale availability',async()=>{const f=fixture();f.addRide('a','IN_PROGRESS','d1');assert.equal((await f.drivers.findAll())[0].isAvailable,false);assert.equal((await f.drivers.findOne('d1')).isAvailable,false);});
test('Profile edit and reapproval cannot bypass busy state',async()=>{const f=fixture();f.addRide('a','IN_PROGRESS','d1');await f.drivers.update('d1',{isAvailable:true});assert.equal(f.state.drivers[0].isAvailable,false);await f.drivers.updateStatus('d1','APPROVED');assert.equal(f.state.drivers[0].isAvailable,false);});
test('Failed ride claim rolls back driver claim',async()=>{const f=fixture();f.addRide('a');const original=f.db.$transaction;f.db.$transaction=(fn,opts)=>original(tx=>{tx.ride.updateMany=async()=>({count:0});return fn(tx)},opts);await assert.rejects(()=>f.rides.assignDriver('a',{driverId:'d1'}),/no longer available/);assert.equal(f.state.drivers[0].isAvailable,true);assert.equal(f.state.notifications.length,0);});
test('Two completion requests do not duplicate receipt or release newly assigned driver',async()=>{const f=fixture();f.addRide('a','IN_PROGRESS','d1');const out=await Promise.allSettled([f.rides.updateStatus('a',{status:'COMPLETED'},'d1'),f.rides.updateStatus('a',{status:'COMPLETED'},'d1')]);assert.equal(out.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.state.settlements.length,1);});
test('Wrong driver cannot complete ride',async()=>{const f=fixture();f.addRide('a','IN_PROGRESS','d1');await assert.rejects(()=>f.rides.updateStatus('a',{status:'COMPLETED'},'another-driver'));assert.equal(f.state.rides[0].status,'IN_PROGRESS');});
test('Cancellation releases last ride without creating receipt',async()=>{const f=fixture();f.addRide('a','ACCEPTED','d1');await f.rides.updateStatus('a',{status:'CANCELLED'});assert.equal(f.state.drivers[0].isAvailable,true);assert.equal(f.state.settlements.length,0);});
test("Assignment and suspension races preserve active-ride protection",async()=>{
  for (const suspensionFirst of [false, true]) {
    const f=fixture();
f.addRide('a');
    const operations = suspensionFirst
      ? [f.drivers.updateStatus('d1','SUSPENDED'), f.rides.assignDriver('a',{driverId:'d1'})]
      : [f.rides.assignDriver('a',{driverId:'d1'}), f.drivers.updateStatus('d1','SUSPENDED')];
    const results = await Promise.allSettled(operations);
    const assignmentResult = results[suspensionFirst ? 1 : 0];
    const suspensionResult = results[suspensionFirst ? 0 : 1];
    const driver = f.state.drivers[0];

    assert.equal(results.filter(result =>
      result.status === "fulfilled").length, 1);
    assert.equal(results.filter(result =>
      result.status === "rejected").length, 1);
    assert.equal(driver.isAvailable, false);

    const assignedRide = f.state.rides.find(ride =>
      ride.driverId === driver.id && ride.status === "ACCEPTED");

    if (assignmentResult.status === "fulfilled") {
      assert.equal(suspensionResult.status, "rejected");
      assert.equal(driver.status, "APPROVED");
      assert.equal(driver.isOnline, true);
      assert.ok(assignedRide);
    } else {
      assert.equal(suspensionResult.status, "fulfilled");
      assert.equal(driver.status, "SUSPENDED");
      assert.equal(driver.isOnline, false);
      assert.equal(assignedRide, undefined);
    }
  }
});
(async()=>{for(const [name,fn]of cases){await fn();console.log('PASS '+name);}console.log(cases.length+' service regression checks passed (mock database).');})().catch(e=>{console.error('Regression failure: '+e.message);process.exitCode=1;});
