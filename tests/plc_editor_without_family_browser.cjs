"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const base = process.env.APP_URL || "http://127.0.0.1:8765/";
const artifactsDir = process.env.PLAYWRIGHT_ARTIFACTS_DIR || "test-results/playwright";
(async () => {
    const browser = await chromium.launch({
        headless: true, executablePath: process.env.CHROME_PATH,
    });
    let context, page, tracing = false;
    try {
        context = await browser.newContext();
        await context.tracing.start({screenshots:true, snapshots:true, sources:true});
        tracing = true;
        page = await context.newPage();
        await page.goto(base);
        assert.equal(await page.evaluate(async () => {
            const {projectConfig} = await import("/gui/js/state.js");
            return projectConfig.plc_family;
        }), "", "Test must start with NO selected PLC family");

        // A locally created UDT is allowed without configuring Create PLC.
        await page.locator('[data-tab="udt"]').click();
        await page.locator("#new-udt-name").fill("UDT_Local");
        await page.locator("#add-udt-button").click();
        await page.locator("#udt-container > details > summary").click();
        await page.locator("#udt-container .member-add-toggle").first().click();
        let form = page.locator("#udt-container .member-add-area:not([hidden]) .member-editor-form").first();
        let select = form.locator('select[id$="-type"]').first();
        for (const kind of ["Bool","Int","Real","Array","Struct"]) {
            assert.equal(await select.locator('option[value="' + kind + '"]').count(), 1,
                "Missing " + kind + " without PLC family");
        }
        await form.locator('input[id$="-name"]').first().fill("Ready");
        await select.selectOption("Bool");
        await form.getByRole("button", {name:"Add",exact:true}).click();

        // DBs likewise support primitive scalars, nested arrays and UDT refs.
        await page.locator('[data-tab="db"]').click();
        await page.locator("#new-db-name").fill("DB_Local");
        await page.locator("#add-db-button").click();
        await page.locator("#db-container > details > summary").click();
        await page.locator("#db-container .member-add-toggle").first().click();
        form = page.locator("#db-container .member-add-area:not([hidden]) .member-editor-form").first();
        select = form.locator('select[id$="-type"]').first();
        await form.locator('input[id$="-name"]').first().fill("Counter");
        await select.selectOption("Int");
        await form.getByRole("button",{name:"Add",exact:true}).click();

        // Re-open the add form if the list renderer recreated it.
        if (!(await page.locator("#db-container .member-add-area").first().isVisible()))
            await page.locator("#db-container .member-add-toggle").first().click();
        form = page.locator("#db-container .member-add-area:not([hidden]) .member-editor-form").first();
        select = form.locator('select[id$="-type"]').first();
        await form.locator('input[id$="-name"]').first().fill("Motors");
        await select.selectOption("Array");
        await form.locator('select[id$="-array-type"]').selectOption("UDT_Local");
        await form.locator('input[id$="-array-lower"]').fill("1");
        await form.locator('input[id$="-array-upper"]').fill("3");
        await form.getByRole("button",{name:"Add",exact:true}).click();

        const read = () => page.evaluate(async () => {
            const {projectConfig} = await import("/gui/js/state.js");
            return {family:projectConfig.plc_family,
                udts:projectConfig.udts, dbs:projectConfig.dbs};
        });
        const state = await read();
        assert.equal(state.family, "");
        assert.equal(state.udts[0].fields[0].data_type,"Bool");
        assert.equal(state.dbs[0].members[0].data_type,"Int");
        assert.equal(state.dbs[0].members[1].array_element_type,"UDT_Local");
        assert.equal(state.dbs[0].members[1].array_upper_bound,3);

        await page.reload();
        const persisted = await read();
        assert.deepEqual(persisted, state, "UDT and DB must persist without PLC family");
        console.log("plc_editor_without_family_browser: PASS — Bool, Int, Array, UDT, persistence");
    } catch (error) {
        await fs.mkdir(artifactsDir, {recursive:true});
        if (page) await page.screenshot({
            path:path.join(artifactsDir,"plc-family-optional-failure.png"),
            fullPage:true,
        }).catch(() => undefined);
        if (context && tracing) await context.tracing.stop({
            path:path.join(artifactsDir,"plc-family-optional-trace.zip"),
        }).catch(() => undefined);
        await fs.writeFile(
            path.join(artifactsDir,"plc-family-optional-failure.txt"),
            String(error.stack || error),
        );
        console.error(error);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
})();
