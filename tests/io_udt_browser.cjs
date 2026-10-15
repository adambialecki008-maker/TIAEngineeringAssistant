// Integration smoke: actual Chromium GUI, fake read-only TIA inventory,
// real local FastAPI UDT model validation, and NO TIA write endpoints.
const assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright");
const key="tiaEngineeringAssistant.projectConfig";
const primitive=(id,key,io="Input")=>({
    id,key,tag_pattern:key+"_{device}",io_type:io,data_type:"Bool",
});
const channels=Array.from({length:8},(_,i)=>({
    device_name:"ET200SP",item_path:"ET200SP/DI1",
    item_name:"DI1",type_identifier:"ET200SP_DI",
    channel_number:i,io_type:"Input",channel_type:"digital",
    channel_address_bits:3088+i,channel_width_bits:1,
}));
const initial={plc_family:"S7-1500",udts:[],dbs:[],tia_target:{
    device_name:"CPU_1",plc_name:"PLC_1",type_identifier:"S7-1500",
},device_config:{
    templates:[{id:"motor",name:"Motor",signals:[
        primitive("run","Run"),primitive("stop","Stop"),primitive("reset","Reset"),
    ]}],
    groups:[{id:"motor-group",template_id:"motor",prefix:"Motor",
        start_index:1,quantity:2,digits:1}],
    mappings:[],mapping_mode:"device",
}};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage(),calls=[];
  page.on("dialog",d=>d.accept());
  await page.addInitScript(({key,initial})=>localStorage.setItem(key,JSON.stringify(initial)),
      {key,initial});
  await page.route("**/api/v1/tia/**",route=>{
    const url=new URL(route.request().url()),p=url.pathname;
    calls.push({method:route.request().method(),path:p});
    if(p==="/api/v1/tia/processes")
      return route.fulfill({json:[{process_id:123}]});
    if(p==="/api/v1/tia/io")
      return route.fulfill({json:{project_name:"Test_Copy",items:[],addresses:[],
          profinet_device_names:{},channels}});
    if(p==="/api/v1/tia/plcs")return route.fulfill({json:[]});
    if(p==="/api/v1/tia/plc-structures")
      return route.fulfill({json:{data_blocks:[],udts:[{
          group_path:"Types",name:"UDT_ImportedMotor",
          type_kind:"PlcType",is_consistent:true,
      }]}});
    if(p==="/api/v1/tia/plc-structure")
      return route.fulfill({json:{
        kind:"udt",group_path:"Types",name:"UDT_ImportedMotor",
        members:[
            {section:"Static",path:"Cmd",name:"Cmd",data_type:"Struct",level:0,
             metadata:{},comment:""},
            {section:"Static",path:"Cmd.Run",name:"Run",data_type:"Bool",level:1,
             metadata:{hmi_visible:"true"},comment:"Run request"},
        ],
      }});
    return route.fulfill({status:503,json:{detail:"Blocked Siemens access in test"}});
  });
  await page.goto(process.env.APP_URL||"http://127.0.0.1:8765/");
  await page.locator('[data-tab="devices"]').click();
  await assert.equal((await page.locator('[data-tab="devices"]').innerText()).trim(),
    "I/O Engineering");
  await page.locator("#device-mapping-mode").waitFor();
  assert.equal(await page.locator("#device-mapping-mode").inputValue(),"device");
  await page.locator("#tia-process option[value='123']").waitFor({state:"attached"});
  await page.locator("#tia-process").selectOption("123");
  await page.locator("#refresh-hardware-button").click();
  await page.locator("#device-io-mapping-body select").first().selectOption({index:1});
  const addressRows=page.locator("#generated-plc-tags-body tr");
  assert.equal(await addressRows.count(),6);
  const expected=[
    ["Motor1","Run","%I386.0"],["Motor1","Stop","%I386.1"],
    ["Motor1","Reset","%I386.2"],["Motor2","Run","%I386.3"],
    ["Motor2","Stop","%I386.4"],["Motor2","Reset","%I386.5"],
  ];
  for(let i=0;i<expected.length;i++){
    const cells=addressRows.nth(i).locator("td");
    assert.equal(await cells.nth(0).innerText(),expected[i][0]);
    assert.equal(await cells.nth(1).innerText(),expected[i][1]);
    assert.equal(await cells.nth(4).innerText(),expected[i][2]);
  }
  const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.equal(before.device_config.mappings[0].signal_id,"@lane:Input:1");
  await page.locator("#device-mapping-mode").selectOption("signal");
  assert.equal(await page.locator("#device-io-mapping-body tr").count(),3);
  await page.locator("#device-mapping-mode").selectOption("device");
  assert.equal(await addressRows.count(),6);
  const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.equal(after.device_config.mappings.length,1);
  assert.equal(after.device_config.mappings[0].start_channel_key,
    before.device_config.mappings[0].start_channel_key);
  await page.locator('[data-tab="udt"]').click();
  await page.locator("#tia-udt-scan").click();
  await page.locator("#tia-udt-load:not([disabled])").waitFor();
  await page.locator("#tia-udt-load").click();
  await page.getByText("UDT_ImportedMotor imported into the local editor",
    {exact:false}).waitFor();
  const data=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.equal(data.udts.length,1);
  assert.equal(data.udts[0].name,"UDT_ImportedMotor");
  assert.equal(data.udts[0].fields[0].struct_members[0].hmi_visible,true);
  assert.equal(calls.filter(c=>c.method!=="GET").length,0,
    "Imported UDT must never write via Openness");
  console.log("I/O template mapping and read-only TIA UDT import GUI: PASS");
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
