const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const src = fs.readFileSync("gui/js/io_mapping_engine.js", "utf8")
    .replaceAll("export function ", "function ");
const context = vm.createContext({});
vm.runInContext(src + "\nthis.api={templateIoLanes,allocateTemplateByDevice};", context);
const {allocateTemplateByDevice:allocate} = context.api;
const signal = (key, io_type="Input", data_type="Bool") =>
    ({id:key, key, io_type, data_type, tag_pattern:key+"_{device}"});
const group = (id, qty=2) => ({id,template_id:"motor",prefix:id,start_index:1,quantity:qty,digits:1});
const ch = (n, {station="ET200",mod="DI1",io="Input",width=1}={}) => ({
    device_name:station,item_path:station+"/"+mod,item_name:mod,
    channel_number:n,io_type:io,channel_address_bits:n,channel_width_bits:width,
});
const key = a=>[a.device_name,a.item_path,a.channel_number,a.io_type,a.channel_address_bits].join("::");
const widthOf = t=>({Bool:1,Word:16,Real:32,Int:16})[t]||null;
const compatible = (a,s)=>a.io_type===s.io_type&&a.channel_width_bits===widthOf(s.data_type)
    &&(a.channel_address_bits%8===0 || widthOf(s.data_type)===1);
const addressOf=(a,t)=> {
    const p=a.io_type==="Input"?"I":"Q",n=Math.floor(a.channel_address_bits/8);
    return widthOf(t)===1?"%"+p+n+"."+(a.channel_address_bits%8):
        "%"+p+(widthOf(t)===16?"W":"D")+n;
};
const basics=(overrides={})=>{
    const signals=[signal("Run"),signal("Stop"),signal("Reset")];
    const channels=Array.from({length:16},(_,i)=>ch(3088+i));
    return {groups:[group("Motor")],templates:[{id:"motor",signals}],channels,
        mappings:[{group_id:"Motor",signal_id:"@lane:Input:1",start_channel_key:key(ch(3088))}],
        widthOf,compatible,keyOf:key,addressOf,tagNameOf:(g,s,o)=>s.key+"_"+g.prefix+(o+1),
        deviceNameOf:(g,o)=>({name:g.prefix+(o+1)}),...overrides};
};
let executed=0;
const test=(name,fn)=>{fn(); executed++;console.log("PASS "+name);};
test("device major order: Run/Stop/Reset for each device",()=>{
    const p=allocate(basics());
    assert.equal(p.errors.length,0);
    assert.deepEqual(Array.from(p.rows, x=>x.tag_name),["Run_Motor1","Stop_Motor1","Reset_Motor1",
        "Run_Motor2","Stop_Motor2","Reset_Motor2"]);
    assert.deepEqual(Array.from(p.rows, x=>x.logical_address),
        ["%I386.0","%I386.1","%I386.2","%I386.3","%I386.4","%I386.5"]);
});
test("one template instance",()=>{const p=allocate(basics({groups:[group("Motor",1)]}));
 assert.equal(p.errors.length,0);assert.equal(p.rows.length,3);});
test("zero and negative quantity are invalid",()=>{
 for(const qty of [0,-1,1.5,NaN,Infinity]){
    const p=allocate(basics({groups:[group("Motor",qty)]}));
    assert.equal(p.rows.length,0);assert.ok(p.errors.some(x=>/quantity/.test(x)));
 }
});
test("cannot silently select free channels when no manual anchor",()=>{
 const p=allocate(basics({mappings:[]}));assert.equal(p.rows.length,0);
 assert.match(p.errors.join(" "),/select the first physical/);
});
test("missing or stale start anchor",()=>{
 const p=allocate(basics({mappings:[{group_id:"Motor",signal_id:"@lane:Input:1",
    start_channel_key:"missing"}]}));
 assert.equal(p.rows.length,0); assert.match(p.errors.join(" "),/missing or incompatible/);
});
test("conflict between two anchored groups is rejected",()=>{
 const x=basics();x.groups=[group("Motor"),group("Pump")];
 x.mappings.push({group_id:"Pump",signal_id:"@lane:Input:1",start_channel_key:key(ch(3088))});
 const p=allocate(x);assert.equal(p.rows.length,6);
 assert.match(p.errors.join(" "),/already mapped/);
});
test("insufficient channels never use another station",()=>{
 const x=basics();x.channels=Array.from({length:4},(_,i)=>ch(3088+i))
 .concat(Array.from({length:20},(_,i)=>ch(3092+i,{station:"DIFF"})));
 const p=allocate(x);assert.equal(p.rows.length,0);assert.match(p.errors.join(" "),/not enough/);
});
test("address hole across modules is blocked, not skipped",()=>{
 const x=basics();x.channels=[...Array.from({length:3},(_,i)=>ch(3088+i)),
 ...Array.from({length:10},(_,i)=>ch(3092+i,{mod:"DI2"}))];
 const p=allocate(x);assert.match(p.errors.join(" "),/non-contiguous/);
});
test("contiguous channels across two modules are allowed",()=>{
 const x=basics();x.channels=[...Array.from({length:3},(_,i)=>ch(3088+i)),
 ...Array.from({length:10},(_,i)=>ch(3091+i,{mod:"DI2"}))];
 const p=allocate(x);assert.equal(p.errors.length,0);assert.equal(p.rows.length,6);
});
test("interleaved DI/DO signals use separate manual anchors and streams",()=>{
 const x=basics();
 x.templates=[{id:"motor",signals:[signal("Run"),signal("Enable","Output"),
 signal("Stop"),signal("Reset","Output")]}];
 x.channels=[...Array.from({length:8},(_,i)=>ch(3088+i)),
 ...Array.from({length:8},(_,i)=>ch(3200+i,{io:"Output",mod:"DO1"}))];
 x.mappings.push({group_id:"Motor",signal_id:"@lane:Output:1",
 start_channel_key:key(ch(3200,{io:"Output",mod:"DO1"}))});
 const p=allocate(x);assert.equal(p.errors.length,0);
 assert.deepEqual(Array.from(p.rows, r=>r.tag_name),["Run_Motor1","Enable_Motor1",
 "Stop_Motor1","Reset_Motor1","Run_Motor2","Enable_Motor2",
 "Stop_Motor2","Reset_Motor2"]);
});
test("mixed lanes require their own start anchors",()=>{
 const x=basics();x.templates=[{id:"motor",signals:[signal("Run"),
 signal("Enable","Output")]}];
 const p=allocate(x);assert.equal(p.rows.length,2);
 assert.match(p.errors.join(" "),/Output:1.*select the first/);
});
test("unknown width is blocked",()=>{
 const x=basics();x.templates=[{id:"motor",signals:[signal("Run","Input","String")]}];
 const p=allocate(x);assert.equal(p.rows.length,0);
 assert.match(p.errors.join(" "),/unsupported/);
});
test("non-boolean signals must match physical width, including 16/32 bits",()=>{
 const x=basics();x.templates=[{id:"motor",signals:[signal("Analog","Input","Word")]}];
 x.channels=[ch(3072,{width:16}),ch(3088,{width:16})];
 x.mappings=[{group_id:"Motor",signal_id:"@lane:Input:16",
 start_channel_key:key(ch(3072,{width:16}))}];
 const p=allocate(x);assert.equal(p.errors.length,0);
 assert.deepEqual(Array.from(p.rows, r=>r.logical_address),["%IW384","%IW386"]);
});
test("reject safety channel width mismatch instead of treating it as ordinary DI",()=>{
 const x=basics();x.channels=Array.from({length:8},(_,i)=>ch(3088+i,{width:8}));
 const p=allocate(x);assert.equal(p.rows.length,0);
 assert.match(p.errors.join(" "),/missing or incompatible/);
});
test("duplicate generated PLC tag name is blocked",()=>{
 const x=basics();x.tagNameOf=()=>"COLLISION";
 const p=allocate(x);assert.equal(p.rows.length,1);
 assert.match(p.errors.join(" "),/Duplicate generated tag name/);
});
test("empty template has no tags or fabricated channels",()=>{
 const x=basics();x.templates=[{id:"motor",signals:[]}];
 const p=allocate(x);assert.equal(p.rows.length,0);assert.equal(p.errors.length,0);
});
test("template signal-only mode remains independent",()=>{
 const a=basics();a.mappings=[{group_id:"Motor",signal_id:"Run",start_channel_key:key(ch(3088))}];
 const p=allocate(a);assert.equal(p.rows.length,0);
 assert.match(p.errors.join(" "),/select the first physical/);
});
test("no mutation of existing settings or selected channels",()=>{
 const x=basics(),before=JSON.stringify(x);
 allocate(x);assert.equal(JSON.stringify(x),before);
});
console.log("IO device-template allocation: "+executed+" passed, 0 failed");
