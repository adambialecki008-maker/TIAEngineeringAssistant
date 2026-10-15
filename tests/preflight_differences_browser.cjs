"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const artifacts = process.env.PLAYWRIGHT_ARTIFACTS_DIR || "test-results/playwright";

(async () => {
    const browser = await chromium.launch({
        headless:true, executablePath:process.env.CHROME_PATH,
    });
    let context, page, tracing=false;
    try {
        context = await browser.newContext({acceptDownloads:true});
        await context.tracing.start({screenshots:true,snapshots:true,sources:true});
        tracing = true;
        page = await context.newPage();
        const methods = [];
        const differences = [
            {path:"cmd.start",property:"data_type",expected:"bool",actual:"int",kind:"changed"},
            {path:"cmd.stop",property:"declaration",expected:"bool",actual:"(missing)",kind:"missing"},
            {path:"cmd.extra",property:"declaration",expected:"(not declared)",actual:"bool",kind:"unexpected"},
        ];
        await page.route("**/api/v1/tia/**", route => {
            const req = route.request();
            const url = new URL(req.url());
            methods.push({path:url.pathname, method:req.method()});
            if (url.pathname === "/api/v1/tia/plc-structure-import/plan") {
                return route.fulfill({json:{
                    project_name:"Mock_TIA_Copy",device_name:"Station",
                    plc_name:"PLC_1", token:"a".repeat(64),
                    counts:{create:0,imported:0,identical:0,compatible:0,
                        unknown:0,conflict:1,blocked:0},
                    can_apply:false, will_create:[], auto_dependencies:[],
                    items:[{
                        kind:"udt",name:"UDT_Test",status:"conflict",
                        reason:"Member cmd.start: required type bool; TIA type int. "
                            +"No existing object will be overwritten.",
                        source:'TYPE "UDT_Test"\nVERSION : 0.1',
                        declaration_differences:differences,
                    }],
                }});
            }
            return route.fulfill({status:503,json:{
                detail:"TIA unavailable in mocked browser regression",
            }});
        });
        await page.addInitScript(() => {
            localStorage.setItem("tiaEngineeringAssistant.activeTab", "preview");
            localStorage.setItem("tiaEngineeringAssistant.projectConfig",
                JSON.stringify({
                    plc_family:"",tia_target:null,
                    udts:[{name:"UDT_Test",fields:[
                        {name:"Start",data_type:"Bool"},
                    ]}],
                    dbs:[],
                }));
        });
        await page.goto(process.env.APP_URL || "http://127.0.0.1:8765/");
        await page.evaluate(async () => {
            const {projectConfig,saveProjectConfig} = await import("/gui/js/state.js");
            projectConfig.tia_target = {device_name:"Station",plc_name:"PLC_1"};
            saveProjectConfig();
            const process = document.getElementById("tia-process");
            process.add(new Option("Mock test process", "3544"));
            process.value = "3544";
        });
        await page.locator('[data-tab="preview"]').click();
        await page.locator("#source-import-plan-button").click();
        const report = page.locator("#source-import-report");
        await report.waitFor({state:"visible"});
        assert.equal(await page.locator("#source-import-apply-button").isDisabled(),
            true, "Conflicts must never enable the TIA write action");
        const row = page.locator("#source-import-report-rows tr").first();
        await row.locator("summary").click();
        const table = row.locator("table.source-declaration-differences");
        assert.equal(await table.locator("tbody tr").count(),3);
        assert.match(await table.innerText(),/cmd\.start/);
        assert.match(await table.innerText(),/cmd\.stop/);
        assert.match(await table.innerText(),/cmd\.extra/);
        assert.match(await table.innerText(),/Existing TIA/);
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.locator("#source-import-report-download").click(),
        ]);
        const csv = await fs.readFile(await download.path(),"utf8");
        assert.match(csv,/Declaration differences/);
        assert.match(csv,/cmd\.start \| data_type \| requested=bool \| TIA=int/);
        assert.equal(methods.filter(x => /\/(apply|import)$/.test(x.path)).length,0);
        assert.equal(methods.filter(x => x.path.endsWith("/plan")).length,1);
        console.log("preflight_differences_browser: PASS — complete read-only diff and CSV");
    } catch(error) {
        await fs.mkdir(artifacts,{recursive:true});
        if(page) await page.screenshot({
            path:path.join(artifacts,"preflight-diff-failure.png"),fullPage:true,
        }).catch(()=>undefined);
        if(context && tracing) await context.tracing.stop({
            path:path.join(artifacts,"preflight-diff-trace.zip"),
        }).catch(()=>undefined);
        await fs.writeFile(path.join(artifacts,"preflight-diff-failure.txt"),
            String(error.stack||error));
        console.error(error);
        process.exitCode=1;
    } finally {
        await browser.close();
    }
})();
