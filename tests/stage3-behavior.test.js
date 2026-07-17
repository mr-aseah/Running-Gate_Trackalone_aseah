const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function makeElement(id='') {
  return {
    id, value: '', textContent: '', innerHTML: '', disabled: false, children: [], dataset: {}, style: {}, className: '',
    classList: { add(){}, remove(){}, toggle(){} },
    append(...xs){ this.children.push(...xs); }, appendChild(x){ this.children.push(x); return x; }, removeChild(){ return this.children.pop(); },
    prepend(x){ this.children.unshift(x); }, remove(){}, focus(){}, click(){},
    addEventListener(){}, closest(){ return null; }, tagName: 'DIV',
  };
}
function loadApp(storage={}) {
  const elements = new Map();
  const document = {
    body: makeElement('body'),
    getElementById(id){ if(!elements.has(id)) elements.set(id, makeElement(id)); return elements.get(id); },
    createElement(tag){ const e=makeElement(); e.tagName=tag.toUpperCase(); return e; },
    addEventListener(){},
  };
  const localStorage = {
    getItem(k){ return Object.prototype.hasOwnProperty.call(storage,k) ? storage[k] : null; },
    setItem(k,v){ storage[k]=String(v); },
    removeItem(k){ delete storage[k]; },
  };
  let perf = 0;
  const context = { console, require, document, localStorage, Blob: function(){}, URL:{createObjectURL(){return 'blob:'}, revokeObjectURL(){}},
    performance:{ now(){ return perf; } }, window:null, alert(){}, confirm(){return true;}, setTimeout(){return 1;}, clearTimeout(){}, setInterval(){return 1;}, clearInterval(){}, Date, addEventListener(){} };
  context.window = context;
  let html = fs.readFileSync('index.html','utf8');
  let script = html.slice(html.indexOf('<script>')+8, html.lastIndexOf('</script>'));
  script += `\nthis.__app={\n setPerf(v){ performance.now=()=>v; },\n setStudents(v){ students=v; initSessionData(); },\n get students(){return students}, get session(){return session}, setSessionConfig(v){ sessionConfig=v; },\n startRun, endRun, recordRfidKeyboardEvent, recordPassByStudentId, recordPassByTagId, undoLast, buildSessionSnapshot, applyRecoveredSessionSnapshot, saveSessionSnapshot, getSavedSessionSnapshot, exportCsv, makeCsv, parseRunCsvForAnalytics, calculateRecoveredElapsedMs, buildAcceptedScanProjectionRows\n};`;
  vm.runInNewContext(script, context, {filename:'index.html'});
  return { app: context.__app, context, storage };
}
function setup() { const h=loadApp(); h.app.setStudents([{id:'1001',name:'A',tagId:'1001'},{id:'1002',name:'B',tagId:'1002'}]); h.app.setSessionConfig({label:'3 × 800m',reps:3,repDistanceM:800}); h.app.startRun(); return h; }
function activeLaps(app){ return app.session.acceptedLaps.filter(l=>l.status==='ACTIVE'); }
function test(name, fn){ try{ fn(); console.log('PASS', name); } catch(e){ console.error('FAIL', name); console.error(e); process.exitCode=1; } }

test('accepted RFID scan links one raw event to one accepted lap and one projected split',()=>{ const {app}=setup(); app.setPerf(70000); app.recordRfidKeyboardEvent('1001',{wallTimeIso:'2026-07-17T00:01:10.000Z',perfMs:70000}); assert.equal(app.session.rawHardwareEvents.length,1); assert.equal(app.session.acceptedLaps.length,1); assert.equal(app.session.acceptedLaps[0].source_event_id, app.session.rawHardwareEvents[0].event_id); assert.deepEqual(app.session.dataById.get('1001').splits,[70000]); });

test('debounced too-soon unknown malformed scans retain raw events without laps',()=>{ const {app}=setup(); app.setPerf(70000); app.recordRfidKeyboardEvent('1001',{wallTimeIso:'t1',perfMs:70000}); app.setPerf(71000); app.recordRfidKeyboardEvent('1001',{wallTimeIso:'t2',perfMs:71000}); app.setPerf(90000); app.recordRfidKeyboardEvent('1001',{wallTimeIso:'t3',perfMs:90000}); app.recordRfidKeyboardEvent('9999',{wallTimeIso:'t4',perfMs:91000}); app.recordRfidKeyboardEvent('xx',{wallTimeIso:'t5',perfMs:92000}); assert.equal(app.session.rawHardwareEvents.length,5); assert.equal(app.session.acceptedLaps.length,1); assert.deepEqual(app.session.rawHardwareEvents.map(e=>e.processing_status),['ACCEPTED','DEBOUNCED','TOO_SOON','UNKNOWN_TAG','MALFORMED']); });

test('tile tap creates MANUAL_TAP accepted lap and no raw event',()=>{ const {app}=setup(); app.setPerf(65000); app.recordPassByStudentId('1001',{source:'TAP'}); assert.equal(app.session.rawHardwareEvents.length,0); assert.equal(app.session.acceptedLaps[0].source_event_type,'MANUAL_TAP'); assert.equal(app.session.acceptedLaps[0].source_event_id,null); });

test('multiple laps keep unique IDs and cumulative/individual CSV-compatible splits',()=>{ const {app}=setup(); [70000,140000,210000].forEach(t=>{app.setPerf(t); app.recordPassByStudentId('1001',{source:'TAP'});}); const ids=app.session.acceptedLaps.map(l=>l.lap_id); assert.equal(new Set(ids).size,3); assert.deepEqual(app.session.dataById.get('1001').splits,[70000,140000,210000]); });

test('undo marks last lap undone, preserves raw event, recalculates, replacement gets new lap id',()=>{ const {app}=setup(); app.setPerf(70000); app.recordRfidKeyboardEvent('1001',{wallTimeIso:'t1',perfMs:70000}); app.setPerf(140000); app.recordRfidKeyboardEvent('1001',{wallTimeIso:'t2',perfMs:140000}); const rawBefore=JSON.stringify(app.session.rawHardwareEvents[1]); const undoneId=app.session.acceptedLaps[1].lap_id; app.undoLast(); assert.equal(app.session.acceptedLaps.find(l=>l.lap_id===undoneId).status,'LEGACY_UNDONE'); assert.equal(JSON.stringify(app.session.rawHardwareEvents[1]),rawBefore); assert.deepEqual(app.session.dataById.get('1001').splits,[70000]); app.setPerf(210000); app.recordRfidKeyboardEvent('1001',{wallTimeIso:'t3',perfMs:210000}); assert.notEqual(activeLaps(app).at(-1).lap_id,undoneId); });

test('global undo after another runner scan changes only latest runner lap',()=>{ const {app}=setup(); app.setPerf(70000); app.recordPassByStudentId('1001',{source:'TAP'}); app.setPerf(80000); app.recordPassByStudentId('1002',{source:'TAP'}); app.undoLast(); assert.equal(app.session.dataById.get('1001').splits.length,1); assert.equal(app.session.dataById.get('1002').splits.length,0); });

test('refresh recovery restores laps once and advances IDs',()=>{ const h=setup(); h.app.setPerf(70000); h.app.recordPassByStudentId('1001',{source:'TAP'}); const snap=h.app.buildSessionSnapshot('ACTIVE'); const h2=loadApp(); h2.app.applyRecoveredSessionSnapshot(snap); h2.app.applyRecoveredSessionSnapshot(h2.app.buildSessionSnapshot('ACTIVE')); assert.equal(h2.app.session.acceptedLaps.length,1); const old=h2.app.session.acceptedLaps[0].lap_id; h2.app.setPerf(140000); h2.app.recordPassByStudentId('1001',{source:'TAP'}); assert.notEqual(h2.app.session.acceptedLaps[1].lap_id,old); });

test('Stage 2 and Stage 1 snapshot migration reconstruct once and link unambiguous raw events',()=>{ const raw={event_id:'rfid_a',student_id:'1001',processing_status:'ACCEPTED',accepted_split_index:0,captured_wall_time_iso:'t',captured_perf_ms:70000}; const snap={schema:'runTimingSessionV2Stage1',schemaVersion:1,savedAtWallTimeIso:'save',status:'COMPLETED',session:{sessionId:'s',started:false,elapsedMsAtSave:70000},sessionConfig:{label:'x',reps:4,repDistanceM:800},students:[{id:'1001',name:'A',tagId:'1001'}],dataById:{1001:{splits:[70000,140000]}},rawHardwareEvents:[raw]}; const h=loadApp(); h.app.applyRecoveredSessionSnapshot(snap); assert.equal(h.app.session.acceptedLaps[0].source_event_id,'rfid_a'); assert.equal(h.app.session.acceptedLaps[1].source,'LEGACY'); h.app.applyRecoveredSessionSnapshot(h.app.buildSessionSnapshot('COMPLETED')); assert.equal(h.app.session.acceptedLaps.length,2); const s1={...snap, rawHardwareEvents:undefined}; const h1=loadApp(); h1.app.applyRecoveredSessionSnapshot(s1); assert.equal(h1.app.session.acceptedLaps.every(l=>l.source==='LEGACY'),true); });

test('raw-event immutability across undo migration and recovery',()=>{ const {app}=setup(); app.setPerf(70000); app.recordRfidKeyboardEvent('1001',{wallTimeIso:'t1',perfMs:70000}); const before=JSON.stringify(app.session.rawHardwareEvents[0]); app.undoLast(); const snap=app.buildSessionSnapshot('ACTIVE'); const h2=loadApp(); h2.app.applyRecoveredSessionSnapshot(snap); assert.equal(JSON.stringify(app.session.rawHardwareEvents[0]),before); assert.equal(JSON.stringify(h2.app.session.rawHardwareEvents[0]),before); });

test('CSV and analytics compatibility smoke test',()=>{ const {app,context}=setup(); let downloaded=''; context.download=(name,text)=>{downloaded=text}; app.setPerf(70000); app.recordPassByStudentId('1001',{source:'TAP'}); app.endRun(); app.exportCsv(); assert(downloaded.includes('session_label,reps,rep_distance_m')); assert(downloaded.includes('70000')); assert(downloaded.split(/\n/).length >= 2); });

test('Stage 1 recovery active gap and completed no gap',()=>{ const h=loadApp(); const now=Date.now(); const snap={status:'ACTIVE',savedAtWallTimeIso:new Date(now-5000).toISOString()}; assert(h.app.calculateRecoveredElapsedMs(snap,1000)>=6000); assert.equal(h.app.calculateRecoveredElapsedMs({...snap,status:'COMPLETED'},1000),1000); });

test('persistence failure keeps raw event and accepted lap in memory and save reports false',()=>{ const h=setup(); h.context.localStorage.setItem=()=>{throw new Error('quota')}; h.app.setPerf(70000); h.app.recordRfidKeyboardEvent('1001',{wallTimeIso:'t1',perfMs:70000}); assert.equal(h.app.session.rawHardwareEvents.length,1); assert.equal(h.app.session.acceptedLaps.length,1); assert.equal(h.app.session.persistenceFailed,true); assert.equal(h.app.saveSessionSnapshot('ACTIVE'),false); });


test('schema compatibility: leading-zero identity snapshots survive roster edits',()=>{ const h=loadApp(); h.app.setStudents([{id:'0007',runner_no:'R007',name:'Original',tagId:'0007',runner_class:'4F',start_offset_seconds:3}]); h.app.setSessionConfig({label:'3 × 800m',reps:3,repDistanceM:800}); h.app.startRun(); h.app.setPerf(70000); h.app.recordRfidKeyboardEvent('0007',{wallTimeIso:'2026-07-17T00:01:10.000Z',perfMs:70000}); h.app.students[0].name='Edited'; h.app.students[0].tagId='9999'; h.app.students[0].runner_class='5G'; const lap=h.app.session.acceptedLaps[0]; assert.equal(lap.tag_id,'0007'); assert.equal(lap.name,'Original'); assert.equal(lap.runner_class,'4F'); assert.equal(lap.start_offset_seconds,3); });

test('schema compatibility: scan_number is permanent per-runner and not reused after undo',()=>{ const {app}=setup(); app.setPerf(70000); app.recordPassByStudentId('1001',{source:'TAP'}); app.setPerf(140000); app.recordPassByStudentId('1001',{source:'TAP'}); const second=app.session.acceptedLaps[1]; assert.deepEqual(app.session.acceptedLaps.map(l=>l.scan_number),[1,2]); app.undoLast(); assert.equal(second.scan_number,2); assert.equal(second.voided,true); app.setPerf(210000); app.recordPassByStudentId('1001',{source:'TAP'}); assert.equal(app.session.acceptedLaps[2].scan_number,3); assert.notEqual(app.session.acceptedLaps[2].lap_id,second.lap_id); });

test('schema compatibility: equal-time laps order by scan_number and lap numbers recalculate',()=>{ const {app}=setup(); app.setPerf(70000); app.recordPassByStudentId('1001',{source:'TAP'}); app.setPerf(140000); app.recordPassByStudentId('1001',{source:'TAP'}); app.session.acceptedLaps[0].adjusted_elapsed_ms=100000; app.session.acceptedLaps[0].raw_elapsed_ms=100000; app.session.acceptedLaps[1].adjusted_elapsed_ms=100000; app.session.acceptedLaps[1].raw_elapsed_ms=100000; app.session.acceptedLaps[0].lap_id='z_lap'; app.session.acceptedLaps[1].lap_id='a_lap'; app.session.acceptedLaps[0].scan_number=1; app.session.acceptedLaps[1].scan_number=2; app.session.lastActionStack.push({studentId:'1001',lapId:'z_lap',removedSplit:100000,index:0,source:'TAP'}); app.undoLast(); const rows=app.buildAcceptedScanProjectionRows('1001'); const active=rows.find(r=>r.scan_number===2); const undone=rows.find(r=>r.scan_number===1); assert.equal(active.lap_number,1); assert.equal(undone.lap_number,null); assert.deepEqual(app.session.dataById.get('1001').splits,[100000]); });

test('schema compatibility: clean-scan projection lap time seconds are derived',()=>{ const {app}=setup(); [70000,140000,230000].forEach(t=>{ app.setPerf(t); app.recordPassByStudentId('1001',{source:'TAP'}); }); const rows=app.buildAcceptedScanProjectionRows('1001').filter(r=>!r.voided); assert.deepEqual(rows.map(r=>r.lap_number),[1,2,3]); assert.deepEqual(rows.map(r=>r.elapsed_time_seconds),[70,140,230]); assert.deepEqual(rows.map(r=>r.lap_time_seconds),[70,70,90]); });

test('schema compatibility: Stage 1/2 migration and restore advance scan numbers',()=>{ const snap={schema:'runTimingSessionV2Stage1',schemaVersion:1,savedAtWallTimeIso:'save',status:'ACTIVE',session:{sessionId:'s',started:true,elapsedMsAtSave:140000},sessionConfig:{label:'x',reps:4,repDistanceM:800},students:[{id:'0007',name:'Lead Zero',tagId:'0007',runner_class:'4F'}],dataById:{'0007':{splits:[70000,140000]}},rawHardwareEvents:[]}; const h=loadApp(); h.app.applyRecoveredSessionSnapshot(snap); assert.deepEqual(h.app.session.acceptedLaps.map(l=>l.scan_number),[1,2]); assert.equal(h.app.session.acceptedLaps[0].tag_id,'0007'); h.app.setPerf(210000); h.app.recordPassByStudentId('0007',{source:'TAP'}); assert.equal(h.app.session.acceptedLaps[2].scan_number,3); const snap2=h.app.buildSessionSnapshot('ACTIVE'); const h2=loadApp(); h2.app.applyRecoveredSessionSnapshot(snap2); h2.app.setPerf(280000); h2.app.recordPassByStudentId('0007',{source:'TAP'}); assert.equal(h2.app.session.acceptedLaps[3].scan_number,4); });

test('schema compatibility: quick Undo voids accepted lap and preserves raw event',()=>{ const {app}=setup(); app.setPerf(70000); app.recordRfidKeyboardEvent('1001',{wallTimeIso:'t1',perfMs:70000}); const before=JSON.stringify(app.session.rawHardwareEvents[0]); app.undoLast(); assert.equal(app.session.acceptedLaps[0].status,'LEGACY_UNDONE'); assert.equal(app.session.acceptedLaps[0].voided,true); assert.equal(JSON.stringify(app.session.rawHardwareEvents[0]),before); });
