"use strict";
const assert = require("node:assert/strict");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

(async () => {
    const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH});
    try {
        const page = await browser.newPage();
        await page.route("**/api/v1/code-review/analyze-files", route => route.fulfill({contentType:"application/json", body:JSON.stringify({files:[{source_file:"FB.scl",name:"FB_Test",block_type:"FUNCTION_BLOCK",language:"SCL",declarations:[],networks:["network 1"],network_details:[{number:1,language:"LAD",nodes:[{uid:"23",kind:"Part",name:"Contact",symbol:"",scope:""}],wires:[{uid:"27",endpoints:[{kind:"NameCon",uid:"23",port:"out"},{kind:"OpenCon",uid:"",port:""}]}],warnings:[],verification_status:"topology only — not logic-verified"}],dependencies:[],parsing_warnings:[],verification_status:"parsed"}],findings:[],file_warnings:[],read_only:true})}));
        await page.route("**/api/v1/code-review/ollama", route => route.fulfill({contentType:"application/json", body:JSON.stringify({files:[],findings:[{source_file:"FB.scl",block:"FB_Test",language:"SCL",location:"line 1",severity:"warning",category:"Style",explanation:"Review suggestion.",suggested_fix:"",evidence:"",detection_method:"AI",verification_status:"AI suggestion — unverified",confidence:0.4}],file_warnings:[],read_only:true})}));
        await page.addInitScript(() => localStorage.setItem("tiaEngineeringAssistant.projectConfig", JSON.stringify({
            plc_family:"", udts:[], dbs:[], fcs:[], instance_dbs:[], device_config:{templates:[],groups:[],mappings:[],mapping_mode:"device"}, tia_target:null,
            fbs:[{name:"FB_FromTia", language:"LAD", source_mode:"tia_read_only", source_xml:"<SW.Blocks.FB Name=\"FB_FromTia\"><CompileUnit/></SW.Blocks.FB>", interface_verified:true}],
        })));
        await page.goto(process.env.APP_URL || "http://127.0.0.1:8765/");
        await page.locator('[data-tab="review"]').click();
        assert.equal(await page.locator("#review-files").isVisible(), true);
        assert.equal(await page.locator("#review-ai").isDisabled(), true);
        await page.locator("#review-files").setInputFiles({name:"FB.scl", mimeType:"text/plain", buffer:Buffer.from("FUNCTION_BLOCK FB_Test")});
        await page.locator("#review-analyze").click();
        await page.waitForSelector("text=Read-only deterministic analysis complete");
        assert.equal(await page.locator("#review-ai").isDisabled(), false);
        await page.locator("#review-results details").first().click();
        const topology = page.locator("#review-results .review-network-topology");
        assert.equal(await topology.count(), 1);
        assert.match(await topology.innerText(), /Network 1/);
        assert.match(await topology.innerText(), /Contact/);
        assert.match(await topology.innerText(), /NameCon 23.out → OpenCon/);
        const markdownTopology = page.waitForEvent("download");
        await page.locator("#review-download-markdown").click();
        const topologyDownload = await markdownTopology;
        const topologyText = require("node:fs").readFileSync(await topologyDownload.path(), "utf-8");
        assert.match(topologyText, /LAD\/FBD network topology/);
        assert.match(topologyText, /Wire 27: NameCon 23\.out → OpenCon/);
        await page.locator("#review-ai").click();
        await page.waitForSelector("text=AI review complete");
        assert.equal((await page.locator("#review-results").innerText()).includes("Review suggestion."), true);
        const markdownDownload = page.waitForEvent("download");
        await page.locator("#review-download-markdown").click();
        assert.equal((await markdownDownload).suggestedFilename(), "plc-code-review.md");
        await page.locator("#review-tia-analyze").click();
        await page.waitForSelector("text=loaded TIA snapshot(s) analyzed");
        assert.match(await page.locator("#review-status").innerText(), /loaded TIA snapshots complete/);
        console.log("PLC code review Analyze Files and optional local AI review: PASS");
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
