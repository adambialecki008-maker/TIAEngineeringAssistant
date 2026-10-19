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
        let failNextPresencePoll = false;
        let processAbsent = false;
        await page.route("**/api/v1/tia/**", async route => {
            const parsed = new URL(route.request().url());
            const action = parsed.pathname;
            requests.push({method:route.request().method(),action});
            if (action === "/api/v1/tia/processes") {
                if (failNextPresencePoll) {
                    failNextPresencePoll = false;
                    return route.fulfill({status:503,json:{detail:"Openness busy"}});
                }
                return route.fulfill({json:processAbsent ? [] : [{process_id:123}]});
            }
            if (action === "/api/v1/tia/project-inventory") {
                // The process is visible before Openness has confirmed the
                // project. Keep that interval observable for the header test.
                await new Promise(resolve => setTimeout(resolve, 200));
                return route.fulfill({json:{project_name:"TIA_Demo_Copy",plcs:[{
                    device_name:"Station_1",plc_name:"PLC_1",
                    plc_type_identifier:"S7-1500",
                }]}});
            }
            if (action === "/api/v1/tia/project-context") {
                // Resource/HMI discovery is deliberately slower than the
                // lightweight PLC inventory. The PLC Use control must appear
                // before the detailed request completes.
                await new Promise(resolve => setTimeout(resolve, 1700));
                return route.fulfill({json:{project_name:"TIA_Demo_Copy", plcs:[{
                    device_name:"Station_1",plc_name:"PLC_1",
                    plc_type_identifier:"S7-1500",online_state:"Offline",
                    block_count:2,resource_rows:[],resource_attributes:[],
                }],hmis:[]}});
            }
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
        assert.deepEqual(await page.locator(".header-context > div").evaluateAll(
            els => els.map(el => el.id)
        ), ["header-tia-live-status","active-plc-summary","header-profile-summary",
            "tia-project-load-header"]);
        // The one detected TIA PID may already be auto-selected while the
        // page loads. Verify either valid initial state, not a race-dependent label.
        const initialTiaLabel = await page.locator("#header-tia-live-status").innerText();
        assert.match(initialTiaLabel, /^(TIA: not connected|TIA Portal PID 123)$/);
        const initialTiaOnline = await page.locator("#header-tia-live-status")
            .evaluate(el => el.classList.contains("connection-online"));
        if (initialTiaLabel === "TIA Portal PID 123") assert.equal(initialTiaOnline,false,
            "a PID alone must stay red until Openness confirms an open project");
        else assert.equal(initialTiaOnline,false);
        assert.equal(await page.locator("#active-plc-summary")
            .evaluate(el => el.classList.contains("connection-offline")),true);
        assert.equal(await page.locator("#active-plc-summary").innerText(),
            "Active PLC: not selected");
        assert.equal(await page.locator("#header-profile-summary")
            .evaluate(el => el.classList.contains("connection-online")),true);
        assert.equal(await page.locator('#overview-profile-management #project-profile-selector').count(),1);
        assert.equal(await page.locator('#overview-tia-controls #tia-process').count(),1);
        assert.equal(await page.locator('[data-tab-panel="plc"] #tia-process').count(),0);
        assert.equal(await page.locator('[data-tab-panel="hmi"] #tia-hmi-process').count(),0);
        // Both Overview control groups are collapsed on initial render.
        // Test the actual visible interaction rather than bypassing it.
        for (const section of ["Connection to TIA Portal", "Choose Active PLC"]) {
            await page.locator("#overview-tia-controls > details")
                .filter({has: page.locator("summary", {hasText: section})})
                .locator(":scope > summary").click();
        }
        await page.locator('#tia-process option[value="123"]').waitFor({state:"attached"});
        await page.locator("#tia-process").selectOption("123");
        await page.locator('#tia-existing-plcs-body').getByRole("button",{name:"Use"})
            .waitFor({state:"visible",timeout:700});
        // The fast list is ready but the optional detailed read is still
        // running. Surface a truthful phase plus live elapsed time in BOTH
        // header and Overview rather than a silent, locked Refresh button.
        const progress = page.locator("#tia-project-load-overview");
        assert.equal(await progress.isVisible(),true);
        assert.equal(await progress.getAttribute("data-state"),"running");
        assert.match(await progress.locator("[data-load-phase]").innerText(),
            /PLC list available.*Reading detailed PLC resources and HMI/i);
        assert.equal(await page.locator("#tia-project-load-header").isVisible(),true);
        assert.match(await progress.locator("[data-load-elapsed]").innerText(),
            /^\d{2}:\d{2}$/);
        await page.waitForFunction(() => document.querySelector(
            "#tia-project-load-overview [data-load-elapsed]"
        )?.textContent !== "00:00");
        assert.match(await page.locator("#overview-project-name").innerText(),/TIA_Demo_Copy/,
            "the fast inventory must synchronize the actual TIA project name");
        await page.waitForFunction(() => document.getElementById("header-tia-live-status")
            ?.classList.contains("connection-online"));
        await page.waitForFunction(() => document.getElementById("header-tia-live-status")
            ?.textContent.includes("TIA Portal PID 123"));
        assert.equal(await page.locator("#header-tia-live-status").innerText(),
            "TIA Portal PID 123");
        assert.equal(await page.locator("#header-tia-live-status")
            .evaluate(el => el.classList.contains("connection-online")),true);
        await page.locator('#tia-existing-plcs-body').getByRole("button",{name:"Use"}).click();
        await page.waitForFunction(() => document.getElementById("project-active-plc")
            .textContent.trim() === "PLC_1");
        await page.waitForFunction(() =>
            document.getElementById("tia-project-load-overview")?.dataset.state === "done");
        assert.match(await progress.locator("[data-load-phase]").innerText(),
            /Project loaded: 1 PLC\(s\), 0 HMI\(s\)/);
        assert.equal(await page.locator("#tia-status").isVisible(),false,
            "Selecting a PLC must not leave the redundant green success banner visible");
        await page.waitForFunction(() => document.getElementById("overview-project-name")
            ?.textContent.includes("TIA_Demo_Copy"));
        assert.match(await page.locator("#overview-project-name").innerText(),/TIA_Demo_Copy/);
        assert.equal(await page.locator("#active-plc-summary")
            .evaluate(el => el.classList.contains("connection-online")),true);

        // A temporary adapter failure is NOT evidence that the open TIA
        // project disappeared. The PID indicator must remain green.
        failNextPresencePoll = true;
        const failedPoll = page.waitForResponse(res =>
            new URL(res.url()).pathname === "/api/v1/tia/processes"
            && res.status() === 503);
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await failedPoll;
        assert.equal(await page.locator("#header-tia-live-status")
            .evaluate(el => el.classList.contains("connection-online")),true,
            "Openness busy/timeout must not make a verified PID red");
        assert.match(await page.locator("#header-tia-live-status")
            .getAttribute("title"), /latest process status check failed/i);

        // Conversely a *successful* list that excludes the PID is explicit
        // evidence of disconnection, and must still show red.
        processAbsent = true;
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await page.waitForFunction(() => document.getElementById("header-tia-live-status")
            ?.classList.contains("connection-offline"));
        processAbsent = false;
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await page.waitForFunction(() => document.getElementById("header-tia-live-status")
            ?.classList.contains("connection-online"));

        const profiles = page.locator("#project-profile-selector");
        const initial = await profiles.inputValue();
        const old = await page.evaluate(async () => {
            const {projectConfig} = await import("/gui/js/state.js");
            return projectConfig.udts.length;
        });
        assert.equal(old,1);
        await page.locator("#overview-profile-management > details > summary").click();
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
        assert.equal(await page.locator("#active-plc-summary")
            .evaluate(el => el.classList.contains("connection-offline")),true);
        assert.equal(await page.locator("#active-plc-summary").innerText(),
            "Active PLC: not selected");
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
