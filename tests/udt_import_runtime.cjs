const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const src=fs.readFileSync("gui/js/udt_import_converter.js","utf8")
    .replaceAll("export function ","function ");
const sandbox=vm.createContext({});
vm.runInContext(src+"\nthis.convert=convertTiaUdtDetail;",sandbox);
const convert=sandbox.convert;
const row=(path,type,metadata={},comment="")=>({
    name:path.split(".").at(-1),path,level:path.split(".").length-1,
    data_type:type,metadata,comment,
});
const detail=(members)=>({kind:"udt",name:"UDT_Motor",group_path:"Types",members});
let count=0;
const test=(name,fn)=>{fn();count++;console.log("PASS "+name);};
const fails=(rows,expected)=>assert.throws(()=>convert(detail(rows)),new RegExp(expected,"i"));
test("preserve scalar names, comments and HMI tri-state",()=>{
 const v=convert(detail([row("Run","Bool",{hmi_visible:"true",hmi_accessible:"false"},"Command")]));
 assert.equal(v.name,"UDT_Motor");assert.equal(v.fields[0].comment,"Command");
 assert.equal(v.fields[0].hmi_visible,true);
 assert.equal(v.fields[0].hmi_accessible,false);
 assert.equal(v.fields[0].hmi_writable,null);
});
test("nested Struct retains order, nesting and defaults",()=>{
 const x=convert(detail([row("Cmd","Struct"),row("Cmd.Run","Bool"),row("Cmd.Stop","Bool"),
 row("Cmd.Inner","Struct"),row("Cmd.Inner.Reset","Bool")]));
 assert.deepEqual(Array.from(x.fields[0].struct_members,m=>m.name),["Run","Stop","Inner"]);
 assert.equal(x.fields[0].struct_members[2].struct_members[0].name,"Reset");
});
test("array of UDT correctly decodes signed bounds",()=>{
 const x=convert(detail([row("Motors",'Array[-2..10] of "UDT_Motor"')]));
 assert.equal(x.fields[0].data_type,"Array");
 assert.equal(x.fields[0].array_lower_bound,-2);
 assert.equal(x.fields[0].array_upper_bound,10);
 assert.equal(x.fields[0].array_element_type,"UDT_Motor");
});
test("quoted external UDT references normalized",()=>{
 assert.equal(convert(detail([row("Control",'"Other_Type"')])).fields[0].data_type,
 "Other_Type");
});
test("missing members rejected",()=>fails([],"usable"));
test("DB is not treated as UDT",()=>assert.throws(()=>convert({
 kind:"db",name:"DB_X",members:[row("X","Bool")]}),/usable/));
test("unknown type blocked",()=>fails([row("X","Array of ??")],"array declaration"));
test("invalid array bounds blocked",()=>fails([row("X","Array[4..1] of Bool")],"bounds"));
test("out of range bounds blocked",()=>fails([row("X","Array[-33000..2] of Bool")],"bounds"));
test("nested Array expansion rejected instead of silently discarded",()=>{
 fails([row("Signals","Array[0..3] of Bool"),row("Signals[0]","Bool")],"path|nesting");
});
test("UDT arrays with child expansion are never treated as editable Struct",()=>{
 fails([row("Motors",'Array[0..1] of "UDT_Motor"'),
 row("Motors.Run","Bool")],"non-Struct");
});
test("duplicate member paths, regardless of case, blocked",()=>{
 fails([row("Start","Bool"),row("start","Bool")],"duplicate");
});
test("orphan nested member blocked",()=>{
 fails([row("Cmd.Run","Bool")],"nesting|parent");
});
test("unexpected metadata blocked to avoid data loss",()=>{
 fails([row("X","Bool",{at:"%I0.0"})],"unsupported TIA metadata");
});
test("remanence attribute not silently dropped",()=>{
 fails([row("X","Bool",{remanence:"Retain"})],"unsupported TIA metadata");
});
test("complex initial values are blocked",()=>{
 fails([row("X","Bool",{start_value:"<complex XML>"})],"complex");
});
test("invalid tri-state TIA flag blocked",()=>{
 fails([row("X","Bool",{hmi_visible:"default"})],"unsupported exported boolean");
});
test("do not mutate exported TIA rows",()=>{
 const input=detail([row("Cmd","Struct"),row("Cmd.X","Bool")]);
 const old=JSON.stringify(input);convert(input);assert.equal(JSON.stringify(input),old);
});
test("empty Struct cannot silently be accepted",()=>{
 fails([row("Cmd","Struct")],"empty Struct");
});
test("null start value remains undefined to TIA, not false",()=>{
 const value=convert(detail([row("X","Bool")])).fields[0];
 assert.equal(value.start_value,null);
});
console.log("TIA UDT read-only conversion: "+count+" passed, 0 failed");
