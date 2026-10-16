"use strict";
const assert = require("node:assert/strict");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const {openSection} = require("./ui_disclosures.cjs");
(async () => {
    const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH});
    try {
        const page = await browser.newPage();
        await page.addInitScript(() => {
            localStorage.setItem("tiaEngineeringAssistant.activeTab","project");
            localStorage.setItem("tiaEngineeringAssistant.sections.v1",JSON.stringify({"overview-help":false}));
            localStorage.setItem("tiaEngineeringAssistant.projectConfig",JSON.stringify({
                plc_family:"S7-1500",
                udts:[{name:"UDT_One",fields:[{name:"Ready",data_type:"Bool"}]}],
                dbs:[{name:"DB_One",retain:false,members:[{name:"Ready",data_type:"Bool"}]}],
                device_config:{templates:[{id:"only",name:"Only template",signals:[]}],
                    groups:[],mappings:[],mapping_mode:"device"},
            }));
        });
        await page.goto(process.env.APP_URL || "http://127.0.0.1:8765/");
        const help = page.locator('[data-ui-section="overview-help"]');
        assert.equal(await help.locator(":scope > .hint").isVisible(),true);
        assert.equal(await help.locator(":scope > summary").count(),0);
        await page.locator('[data-tab="udt"]').click();
        await openSection(page,"udt-editor");
        assert.equal(await page.locator("#udt-container > details").count(),0);
        assert.equal(await page.locator("#udt-container > section.single-engineering-item > h4").innerText(),
            "UDT_One (1 fields, General)");
        assert.equal(await page.locator("#udt-container .member-tree").isVisible(),true);
        await page.locator("#new-udt-name").fill("UDT_Two");
        await page.locator("#add-udt-button").click();
        assert.equal(await page.locator("#udt-container > details").count(),2);
        await page.locator("#udt-container > details").first().locator(":scope > summary").click();
        assert.equal(await page.locator("#udt-container > details").first().evaluate(el=>el.open),true);
        await page.locator('[data-tab="db"]').click();
        await openSection(page,"db-editor");
        assert.equal(await page.locator("#db-container > details").count(),0);
        assert.equal(await page.locator("#db-container > section.single-engineering-item > h4").innerText(),
            "DB_One (1 members, General)");
        assert.equal(await page.locator("#db-container .member-declaration-section > h4").innerText(),
            "Static (1 variables)");
        assert.equal(await page.locator("#db-container .member-tree").isVisible(),true);
        await page.locator("#new-db-name").fill("DB_Two");
        await page.locator("#add-db-button").click();
        assert.equal(await page.locator("#db-container > details").count(),2);
        await page.locator('[data-tab="devices"]').click();
        const section = page.locator('details.device-section').first();
        if (!(await section.evaluate(el=>el.open))) await section.locator(":scope > summary").click();
        assert.equal(await page.locator("#device-template-container > details").count(),0);
        assert.equal(await page.locator("#device-template-container > .single-engineering-item > h4").innerText(),
            "Only template (0 signals)");
        assert.equal(await page.locator("#device-template-container .single-engineering-item > .details-content").isVisible(),true);
        console.log("single_engineering_items_browser: PASS");
    } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
