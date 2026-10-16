const {openSection} = require("./ui_disclosures.cjs");
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const base = process.env.APP_URL || "http://127.0.0.1:8765/";
const output = process.env.PLAYWRIGHT_ARTIFACTS_DIR || "test-results/playwright";
const item = (pathName, data_type, remanence = undefined) => ({
    section:"Static", path:pathName, name:pathName.split(".").at(-1),
    level:pathName.split(".").length - 1, data_type, offset:"",
    comment:"", metadata:remanence === undefined ? {} : {remanence},
});
(async () => {
    const browser = await chromium.launch({headless:true,
        executablePath:process.env.CHROME_PATH});
    let context, page, tracing = false;
    try {
        context = await browser.newContext();
        await context.tracing.start({screenshots:true,snapshots:true,sources:true});
        tracing = true;
        page = await context.newPage();
        const fixture = {
            data_blocks:[
                {name:"DB_Station",number:12,group_path:"DBs",block_kind:"GlobalDB",is_consistent:true},
                {name:"DB_UnknownRetain",number:13,group_path:"",block_kind:"GlobalDB",is_consistent:true},
                {name:"DB_ExplicitNonRetain",number:17,group_path:"",block_kind:"GlobalDB",is_consistent:true},
                {name:"DB_Missing",number:14,group_path:"",block_kind:"GlobalDB",is_consistent:true},
                {name:"DB_Instance",number:15,group_path:"",block_kind:"InstanceDB",is_consistent:true},
                {name:"DB_Inconsistent",number:16,group_path:"",block_kind:"GlobalDB",is_consistent:false},
            ],
            udts:[
                {name:"UDT_Parent",group_path:"Types",type_kind:"PlcStruct",is_consistent:true},
                {name:"UDT_Child",group_path:"Types",type_kind:"PlcStruct",is_consistent:true},
            ],
        };
        const details = {
            DB_Station: {kind:"db",name:"DB_Station",group_path:"DBs", members:[
                item("Motors",'Array[1..4] of "UDT_Parent"', "Retain"),
                item("Config","Struct","Retain"),
                item("Config.Ready","Bool"),
            ]},
            DB_UnknownRetain: {kind:"db",name:"DB_UnknownRetain",group_path:"",members:[
                item("Ready","Bool"),
            ]},
            DB_ExplicitNonRetain: {kind:"db",name:"DB_ExplicitNonRetain",group_path:"",members:[
                item("Ready","Bool","NonRetain"),
            ]},
            DB_Missing: {kind:"db",name:"DB_Missing",group_path:"",members:[
                item("Dependency",'"UDT_NotFound"',"NonRetain"),
            ]},
            UDT_Parent: {kind:"udt",name:"UDT_Parent",group_path:"Types",members:[
                item("Child",'"UDT_Child"'),
                item("Values","Array[0..2] of Real"),
            ]},
            UDT_Child: {kind:"udt",name:"UDT_Child",group_path:"Types",members:[
                item("Enabled","Bool"),
            ]},
        };
        await page.route("**/api/v1/tia/**", route => {
            const url = new URL(route.request().url());
            const endpoint = url.pathname;
            let data = null;
            if (endpoint === "/api/v1/tia/plc-structures")
                data = fixture;
            else if (endpoint === "/api/v1/tia/plc-structure") {
                const name = url.searchParams.get("name");
                data = details[name] || null;
            }
            return route.fulfill({status:data ? 200 : 503,
                contentType:"application/json",
                body:JSON.stringify(data || {detail:"TIA blocked in browser regression"})});
        });
        await page.goto(base);
        // The regression deliberately replaces TIA inventory and never starts
        // the Windows Openness adapter or connects to a real PLC.
        await page.evaluate(async () => {
            const {projectConfig,saveProjectConfig} = await import("/gui/js/state.js");
            projectConfig.plc_family = ""; // read-only import must work without Create PLC family
            projectConfig.tia_target = {device_name:"Device_1",plc_name:"PLC_1",
                type_identifier:"System:Device.S71500"};
            saveProjectConfig();
            const process = document.getElementById("tia-process");
            process.add(new Option("Test TIA 3544", "3544"));
            process.value = "3544";
        });
        page.on("dialog", dialog => dialog.accept());
        await page.locator('[data-tab="db"]').click();
        await openSection(page, "db-import");
        await page.locator("#tia-db-scan").click();
        await page.waitForFunction(() => document.querySelectorAll(
            "#tia-db-select option").length === 4);
        assert.equal(await page.locator("#tia-db-select option").count(), 4);
        await page.locator("#tia-db-select").selectOption("0");
        // A same-named local UDT with an incompatible structure is never reused.
        await page.evaluate(async () => {
            const {projectConfig,saveProjectConfig} = await import("/gui/js/state.js");
            projectConfig.udts.push({name:"UDT_Parent",
                fields:[{name:"Different",data_type:"Bool"}]});
            saveProjectConfig();
        });
        await page.locator("#tia-db-load").click();
        await page.waitForFunction(() => /differs from the active TIA/.test(
            document.getElementById("tia-db-import-status").textContent));
        let blocked = await page.evaluate(async () => {
            const {projectConfig,saveProjectConfig} = await import("/gui/js/state.js");
            const dbCount = projectConfig.dbs.length;
            projectConfig.udts.pop();
            saveProjectConfig();
            return dbCount;
        });
        assert.equal(blocked, 0, "UDT conflict must abort the entire DB import");
        await page.locator("#tia-db-load").click();
        await page.waitForFunction(() => document.getElementById(
            "tia-db-import-status").textContent.includes("imported into the local editor"));
        const read = () => page.evaluate(async () => {
            const {projectConfig} = await import("/gui/js/state.js");
            return {dbs:projectConfig.dbs,udts:projectConfig.udts};
        });
        let data = await read();
        assert.equal(data.dbs.length, 1);
        assert.equal(data.dbs[0].name, "DB_Station");
        assert.equal(data.dbs[0].retain, true);
        assert.equal(data.dbs[0].members[0].array_element_type, "UDT_Parent");
        assert.deepEqual(data.udts.map(udt => udt.name), ["UDT_Child","UDT_Parent"]);
        assert.equal(data.dbs[0].tia_source.name, "DB_Station");
        assert.equal(data.udts[1].fields[0].data_type, "UDT_Child");

        await page.locator("#tia-db-load").click();
        assert.match(await page.locator("#tia-db-import-status").textContent(), /already exists/);
        data = await read();
        assert.equal(data.dbs.length, 1);
        await page.locator("#tia-db-select").selectOption({label:"DB_UnknownRetain [root]"});
        await page.locator("#tia-db-load").click();
        await page.waitForFunction(() => /does not clearly establish/i.test(
            document.getElementById("tia-db-import-status").textContent));
        assert.equal((await read()).dbs.length, 1,
            "Unknown retain must not silently modify local project");
        assert.equal(await page.locator("#tia-db-retain").count(), 0,
            "DB import UI must match UDT import without a retain selector");

        await page.locator("#tia-db-select").selectOption({label:"DB_ExplicitNonRetain [root]"});
        await page.locator("#tia-db-load").click();
        await page.waitForFunction(() => document.getElementById(
            "tia-db-import-status").textContent.includes("DB_ExplicitNonRetain imported"));
        assert.equal((await read()).dbs[1].retain, false);

        await page.locator("#tia-db-select").selectOption({label:"DB_Missing [root]"});
        await page.locator("#tia-db-load").click();
        await page.waitForFunction(() => /missing.*UDT/i.test(
            document.getElementById("tia-db-import-status").textContent));
        assert.match(await page.locator("#tia-db-import-status").textContent(), /missing.*UDT/i);
        assert.equal((await read()).dbs.length, 2);

        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem(
            "tiaEngineeringAssistant.projectConfig.profile.default")));
        assert.equal(stored.dbs.length, 2);
        await page.reload();
        const reloaded = await page.evaluate(async () => {
            const {projectConfig} = await import("/gui/js/state.js");
            return {dbs:projectConfig.dbs.length,udts:projectConfig.udts.length};
        });
        assert.deepEqual(reloaded,{dbs:2,udts:2});
        console.log("db_import_browser: PASS — local-only DB/UDT dependency read, retain, duplicates, missing UDT");
    } catch (error) {
        await fs.mkdir(output,{recursive:true});
        if (page) await page.screenshot({path:path.join(output,"db-import-failure.png"),
            fullPage:true}).catch(() => undefined);
        if (tracing) await context.tracing.stop({
            path:path.join(output,"db-import-trace.zip")}).catch(() => undefined);
        await fs.writeFile(path.join(output,"db-import-failure.txt"),String(error.stack||error));
        console.error(error);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
})();
