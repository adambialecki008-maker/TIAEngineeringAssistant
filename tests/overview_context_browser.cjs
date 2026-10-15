"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const artifactsDir = process.env.PLAYWRIGHT_ARTIFACTS_DIR || "test-results/playwright";

(async () => {
    const browser = await chromium.launch({
        headless:true, executablePath:process.env.CHROME_PATH,
    });
    let page, context, tracing = false;
    try {
        context = await browser.newContext();
        await context.tracing.start({screenshots:true,snapshots:true,sources:true});
        tracing = true;
        page = await context.newPage();
        page.on("dialog", d => d.accept());
        const requests = [];
        await page.route("**/api/v1/tia/**", route => {
            const parsed = new URL(route.request().url());
            const action = parsed.pathname;
            requests.push({method:route.request().method(),action});
            if (action === "/api/v1/tia/processes")
                return route.fulfill({json:[{process_id:123}]});
            if (action === "/api/v1/tia/project-context")
                return route.fulfill({json:{project_name:"TIA_Demo_Copy", plcs:[{
                    device_name:"Station_1",plc_name:"PLC_1",
                    plc_type_identifier:"S7-1500",online_state:"Offline",
                    block_count:2,resource_rows:[],resource_attributes:[],
                }],hmis:[]}});
            return route.fulfill({status:503,json:{detail:"read-only TIA fixture"}});
        });
        await page.addInitScript(() => {
            localStorage.setItem("tiaEngineeringAssistant.activeTab", "project");
            localStorage.setItem("tiaEngineeringAssistant.projectConfig", JSON.stringify({
                plc_family:"", udts:[{name:"UDT_Seed",fields:[
                    {name:"Ready",data_type:"Bool"},
                ]}], dbs:[],tia_target:null,
            }));
        });
        await page.goto(process.env.APP_URL || "http://127.0.0.1:8765/");
        assert.equal(await page.locator('[data-tab-panel="project"]').isVisible(),true);
        assert.equal(await page.locator('#overview-profile-management #project-profile-selector').count(),1);
        assert.equal(await page.locator('#overview-tia-controls #tia-process').count(),1);
        assert.equal(await page.locator('[data-tab-panel="plc"] #tia-process').count(),0);
        assert.equal(await page.locator('[data-tab-panel="hmi"] #tia-hmi-process').count(),0);
        await page.locator('#tia-process option[value="123"]').waitFor({state:"attached"});
        await page.locator("#tia-process").selectOption("123");
        await page.locator('#tia-existing-plcs-body').getByRole("button",{name:"Use"}).click();
        await page.waitForFunction(() => document.getElementById("project-active-plc")
            .textContent.trim() === "PLC_1");
        assert.match(await page.locator("#overview-project-name").innerText(),/TIA_Demo_Copy/);

        const profiles = page.locator("#project-profile-selector");
        const initial = await profiles.inputValue();
        const old = await page.evaluate(async () => {
            const {projectConfig} = await import("/gui/js/state.js");
            return projectConfig.udts.length;
        });
        assert.equal(old,1);
        await page.locator('#overview-profile-management input[placeholder="New project name"]')
            .fill("Station B");
        await page.locator("#overview-profile-management")
            .getByRole("button",{name:"Create project"}).click();
        const second = await profiles.locator("option",{hasText:"Station B"})
            .getAttribute("value");
        await profiles.selectOption(second);
        await page.waitForFunction(() => document.getElementById("header-profile-summary")
            .textContent.includes("Station B"));
        assert.equal(await page.locator("#tia-process").inputValue(),"");
        assert.equal(await page.locator("#project-active-plc").innerText(),"Not selected");
        assert.equal(await page.locator("#overview-profile-name").innerText(),"Station B");
        assert.equal(await page.evaluate(async () => {
            const {projectConfig} = await import("/gui/js/state.js");
            return projectConfig.udts.length;
        }),0, "new profile must not inherit previous UDTs");

        await profiles.selectOption(initial);
        assert.equal(await page.evaluate(async () => {
            const {projectConfig} = await import("/gui/js/state.js");
            return projectConfig.udts[0]?.name;
        }),"UDT_Seed", "original UDT definitions must survive profile switches");
        assert.equal(await page.locator("#project-active-plc").innerText(),"Not selected",
            "TIA target must be reconfirmed after a profile switch");
        assert.equal(requests.filter(req=>req.method!=="GET").length,0,
            "changing profile and TIA context must not issue TIA write calls");
        console.log("overview_context_browser: PASS — shared context, profile isolation, TIA target clearing");
    } catch (error) {
        await fs.mkdir(artifactsDir,{recursive:true});
        if (page) await page.screenshot({
            path:path.join(artifactsDir,"overview-context-failure.png"),fullPage:true,
        }).catch(()=>undefined);
        if (context && tracing) await context.tracing.stop({
            path:path.join(artifactsDir,"overview-context-trace.zip"),
        }).catch(()=>undefined);
        await fs.writeFile(path.join(artifactsDir,"overview-context-failure.txt"),
            String(error.stack || error));
        console.error(error);
        process.exitCode=1;
    } finally {
        await browser.close();
    }
})();
