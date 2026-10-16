"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

(async () => {
 const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try {
  const page = await browser.newPage({acceptDownloads:true});
  let running = false, exportCalls = 0;
  await page.route("**/api/v1/tia/processes", route => route.fulfill({
   contentType:"application/json",
   body:JSON.stringify(running ? [{process_id:321}] : [])
  }));
  await page.route("**/api/v1/code-review/export-tia-project-for-llm?process_id=321", route => {
   exportCalls++;
   assert.equal(route.request().method(),"POST");
   return route.fulfill({status:200,contentType:"application/zip",
    headers:{"Content-Disposition":'attachment; filename="TIA_Portal_Entire_Project_LLM_Review.zip"'},
    body:Buffer.from([0x50,0x4b,0x03,0x04,0x41])});
  });
  await page.goto(process.env.APP_URL || "http://127.0.0.1:8765/");
  assert.equal(await page.locator('[data-tab="review"]').count(),0);
  for (const id of ["review-tia-analyze","review-tia-status","review-results",
   "review-files","review-folder","review-analyze","review-status"]) {
   assert.equal(await page.locator("#"+id).count(),0,id);
  }
  assert.equal(await page.locator("#tia-create-plc-button").count(),1);
  await page.locator('[data-tab="libraries"]').click();
  const section = page.locator("#data-libraries-root > details.card")
    .filter({has:page.locator("summary", {hasText:"Export for LLM Review"})});
  assert.equal(await section.count(),1);
  assert.equal(await section.evaluate(el=>el.open),false);
  assert.equal(await page.locator("#review-export-llm").isVisible(),false);
  await section.locator(":scope > summary").click();
  assert.equal(await page.locator("#review-export-llm").isVisible(),true);
  await page.locator("#review-export-llm").click();
  assert.match(await page.locator("#review-export-llm-status").innerText(),/Select a running TIA Portal process/);
  assert.equal(exportCalls,0);
  running = true;
  await page.locator("#tia-process").evaluate(select=>{
   const option=document.createElement("option");
   option.value="321"; option.textContent="TIA 321";
   select.append(option); select.value="321";
   select.dispatchEvent(new Event("change",{bubbles:true}));
  });
  await page.locator("#overview-project-name").evaluate(el=>{el.textContent="Plant_Main";});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(()=>
   document.getElementById("tia-llm-connection-status")?.textContent?.includes("PID 321 running"));
  assert.match(await page.locator("#tia-llm-connection-status").innerText(),/Plant_Main/);
  page.on("dialog",dialog=>dialog.accept());
  const downloadStarted = page.waitForEvent("download");
  await page.locator("#review-export-llm").click();
  const download = await downloadStarted;
  assert.equal(download.suggestedFilename(),"TIA_Portal_Entire_Project_LLM_Review.zip");
  const bytes=fs.readFileSync(await download.path());
  assert.equal(bytes.subarray(0,2).toString(),"PK");
  assert.match(await page.locator("#review-export-llm-status").innerText(),/Exported the open TIA project/);
  assert.equal(exportCalls,1);
  running=false;
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(()=>
   document.getElementById("overview-tia-live-status")?.textContent?.includes("connection LOST"));
  await page.locator("#review-export-llm").click();
  assert.match(await page.locator("#review-export-llm-status").innerText(),/no longer running/);
  assert.equal(exportCalls,1);
  console.log("TIA LLM export moved; monitor and removed PLC review UI: PASS");
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
