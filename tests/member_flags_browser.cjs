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
    let context, page, tracing = false;
    try {
        context = await browser.newContext();
        await context.tracing.start({screenshots:true,snapshots:true,sources:true});
        tracing = true;
        page = await context.newPage();
        await page.addInitScript(() => {
            localStorage.setItem("tiaEngineeringAssistant.projectConfig",
                JSON.stringify({
                    plc_family:"",
                    udts:[{name:"UDT_Station",fields:[{
                        name:"Enabled",data_type:"Bool",comment:null,
                        hmi_visible:null,hmi_accessible:null,hmi_writable:null,
                    }]}],
                    dbs:[{name:"DB_Station",retain:false,members:[{
                        name:"Ready",data_type:"Bool",comment:null,
                        hmi_visible:true,hmi_accessible:false,hmi_writable:null,
                    }]}],
                }));
            localStorage.setItem("tiaEngineeringAssistant.activeTab","project");
        });
        await page.goto(process.env.APP_URL || "http://127.0.0.1:8765/");
        const state = () => page.evaluate(async () => {
            const {projectConfig} = await import("/gui/js/state.js");
            return {udt:projectConfig.udts[0].fields[0],
                db:projectConfig.dbs[0].members[0]};
        });
        async function openTab(tab) {
            await page.locator('[data-tab="' + tab + '"]').click();
            const details = page.locator("#" + tab + "-container > details").first();
            if (!(await details.evaluate(el => el.open)))
                await details.locator(":scope > summary").click();
        }
        const checkbox = (owner, name, flag) => page.locator(
            'tr[data-member-path="' + owner + ':0"] input.member-attribute-checkbox'
            + '[aria-label="' + flag + ' ' + name + '"]');
        await openTab("udt");
        const udt = "udt-field-0";
        const visible = checkbox(udt, "Enabled", "Visible in HMI");
        const accessible = checkbox(udt, "Enabled", "Accessible from HMI/OPC UA");
        const writable = checkbox(udt, "Enabled", "Writable from HMI/OPC UA");
        const retain = checkbox(udt, "Enabled", "Retain");
        assert.equal(await retain.count(),0, "UDT declarations cannot set DB Retain");
        assert.equal(await page.locator("#udt-container .member-flag").count(),0);
        for(const el of [visible,accessible,writable]) {
            assert.equal(await el.evaluate(node => node.indeterminate),true,
                "Old unset attributes must remain TIA default");
        }
        await visible.check();
        await accessible.check();
        await accessible.uncheck();
        await writable.check();
        let data = await state();
        assert.equal(data.udt.hmi_visible,true);
        assert.equal(data.udt.hmi_accessible,false);
        assert.equal(data.udt.hmi_writable,true);
        await visible.click({button:"right"});
        data = await state();
        assert.equal(data.udt.hmi_visible,null,"Context menu restores unspecified state");

        await openTab("db");
        const key = "db-member-0";
        const dbVisible = checkbox(key, "Ready", "Visible in HMI");
        const dbAccessible = checkbox(key, "Ready", "Accessible from HMI/OPC UA");
        const dbWritable = checkbox(key, "Ready", "Writable from HMI/OPC UA");
        const dbRetain = checkbox(key, "Ready", "Retain");
        assert.equal(await page.locator("#db-container .member-declaration-section > summary")
            .innerText(),"Static (1 variables)");
        assert.equal(await dbVisible.isChecked(),true);
        assert.equal(await dbAccessible.isChecked(),false);
        assert.equal(await dbWritable.evaluate(node => node.indeterminate),true);
        assert.equal(await dbRetain.isChecked(),false);
        await dbVisible.click({button:"right"});
        await dbAccessible.check();
        await dbWritable.check();
        await dbRetain.check();
        data = await state();
        assert.equal(data.db.hmi_visible,null);
        assert.equal(data.db.hmi_accessible,true);
        assert.equal(data.db.hmi_writable,true);
        assert.equal(data.db.retain,true);
        await dbRetain.click({button:"right"});
        data = await state();
        assert.equal(data.db.retain,null, "Right-click restores DB-level default");

        await page.reload();
        data = await state();
        assert.equal(data.udt.hmi_visible,null);
        assert.equal(data.udt.hmi_accessible,false);
        assert.equal(data.udt.hmi_writable,true);
        assert.equal(data.db.hmi_visible,null);
        assert.equal(data.db.hmi_accessible,true);
        assert.equal(data.db.hmi_writable,true);
        assert.equal(data.db.retain,null);
        assert.equal(await page.locator(".member-row-checkbox").count(),0);
        assert.equal(await page.locator(".member-selection-toolbar").count(),0);
        console.log("member_flags_browser: PASS — inline checkbox columns, explicit/inherited Retain and reload");
    } catch (error) {
        await fs.mkdir(artifacts,{recursive:true});
        if(page) await page.screenshot({
            path:path.join(artifacts,"member-flags-failure.png"),fullPage:true,
        }).catch(()=>undefined);
        if(context && tracing) await context.tracing.stop({
            path:path.join(artifacts,"member-flags-trace.zip"),
        }).catch(()=>undefined);
        await fs.writeFile(path.join(artifacts,"member-flags-failure.txt"),
            String(error.stack || error));
        console.error(error);
        process.exitCode=1;
    } finally {
        await browser.close();
    }
})();
