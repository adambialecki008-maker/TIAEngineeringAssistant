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
        const open = async (tab, kind) => {
            await page.locator('[data-tab="' + tab + '"]').click();
            const group = page.locator("#" + kind + "-container > details").first();
            if (!(await group.evaluate(node=>node.open))) await group.locator(":scope > summary").click();
            await page.locator('tr[data-member-path="' + kind + '-field-0:0"],tr[data-member-path="'
                + kind + '-member-0:0"]').first()
                .locator("button.member-tree-toggle").click();
            return page.locator('tr[data-member-details="' + kind +
                (kind==="udt" ? '-field' : '-member') + '-0:0"] > td > .member-editor-form');
        };
        const save = editor => editor.locator(":scope > .action-row")
            .getByRole("button",{name:"Save",exact:true}).click();
        let editor = await open("udt","udt");
        const visible = editor.locator('input[type="checkbox"][id$="-visible"]');
        const accessible = editor.locator('input[type="checkbox"][id$="-accessible"]');
        const writable = editor.locator('input[type="checkbox"][id$="-writable"]');
        assert.equal(await editor.locator('select[id$="-visible"]').count(),0);
        assert.equal(await editor.locator('select[id$="-accessible"]').count(),0);
        assert.equal(await editor.locator('select[id$="-writable"]').count(),0);
        for(const el of [visible,accessible,writable]) {
            assert.equal(await el.evaluate(node=>node.indeterminate),true,
                "Legacy unset attributes must remain TIA default");
        }
        await visible.check();
        await accessible.check();
        await accessible.uncheck();
        await writable.check();
        await save(editor);
        let data = await state();
        assert.equal(data.udt.hmi_visible,true);
        assert.equal(data.udt.hmi_accessible,false);
        assert.equal(data.udt.hmi_writable,true);
        editor = await open("udt","udt");
        await editor.locator(".member-flag").first()
            .getByRole("button",{name:"Default"}).click();
        await save(editor);
        data = await state();
        assert.equal(data.udt.hmi_visible,null,"Default must restore unspecified state");
        assert.equal(data.udt.hmi_accessible,false);

        editor = await open("db","db");
        const dbVisible = editor.locator('input[id$="-visible"]');
        const dbAccessible = editor.locator('input[id$="-accessible"]');
        const dbWritable = editor.locator('input[id$="-writable"]');
        assert.equal(await dbVisible.isChecked(),true);
        assert.equal(await dbAccessible.isChecked(),false);
        assert.equal(await dbWritable.evaluate(node=>node.indeterminate),true);
        await editor.locator(".member-flag").first()
            .getByRole("button",{name:"Default"}).click();
        await dbAccessible.check();
        await dbWritable.check();
        await save(editor);
        data = await state();
        assert.equal(data.db.hmi_visible,null);
        assert.equal(data.db.hmi_accessible,true);
        assert.equal(data.db.hmi_writable,true);
        await page.reload();
        data = await state();
        assert.equal(data.udt.hmi_visible,null);
        assert.equal(data.udt.hmi_accessible,false);
        assert.equal(data.udt.hmi_writable,true);
        assert.equal(data.db.hmi_visible,null);
        assert.equal(data.db.hmi_accessible,true);
        assert.equal(data.db.hmi_writable,true);
        assert.equal(await page.locator(".member-row-checkbox").count(),0);
        assert.equal(await page.locator(".member-selection-toolbar").count(),0);
        console.log("member_flags_browser: PASS — TIA checkbox tri-state, persistence, no row selection");
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
