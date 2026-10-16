"use strict";
const assert = require("node:assert/strict");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const {openSection} = require("./ui_disclosures.cjs");

(async () => {
    const browser = await chromium.launch({
        headless:true, executablePath:process.env.CHROME_PATH,
    });
    try {
        const page = await browser.newPage();
        await page.goto(process.env.APP_URL || "http://127.0.0.1:8765/");
        const names = [
            ["project", "overview-help"],
            ["plc", "plc-tags"], ["plc", "plc-program"],
            ["plc", "plc-structures"], ["plc", "plc-create"],
            ["udt", "udt-editor"], ["udt", "udt-import"],
            ["db", "db-editor"], ["db", "db-import"],
            ["fb", "fb-editor"], ["fb", "fb-import"],
            ["fb", "fc-editor"], ["fb", "fc-import"],
            ["fb", "program-dependencies"], ["fb", "instance-db-inventory"],
            ["preview", "preview-selection"], ["preview", "preview-source"],
            ["preview", "preview-import"],
        ];
        for (const [tab,id] of names) {
            const panel = page.locator('[data-tab-panel="' + tab + '"]');
            const el = panel.locator('[data-ui-section="' + id + '"]');
            assert.equal(await el.count(),1, "Exactly one disclosure: "+id);
            assert.equal(await el.locator(":scope > summary h3").count(),1,
                "Exactly one semantic heading: "+id);
            assert.equal(await el.locator(":scope > .ui-disclosure-body").count(),1);
        }
        const styles = await page.evaluate(() => {
            const computed = selector => {
                const value = getComputedStyle(document.querySelector(selector));
                return {fontFamily:value.fontFamily,fontSize:value.fontSize,fontWeight:value.fontWeight};
            };
            return {
                overviewProfile:computed("#overview-profile-management > details > summary"),
                overviewTia:computed("#overview-tia-controls > details > summary"),
                overviewHelp:computed('[data-ui-section="overview-help"] > summary h3'),
                fbHeader:computed('[data-ui-section="fb-editor"] > summary h3'),
                udtHeader:computed('[data-ui-section="udt-editor"] > summary h3'),
                dbHeader:computed('[data-ui-section="db-editor"] > summary h3'),
                plcHeader:computed('[data-ui-section="plc-program"] > summary h3'),
                previewHeader:computed('[data-ui-section="preview-import"] > summary h3'),
                pageTitle:computed('[data-tab-panel="project"] .panel-header h2'),
                fbPageTitle:computed('[data-tab-panel="fb"] .panel-header h2'),
            };
        });
        const sectionHead = styles.overviewProfile;
        for (const [name,value] of Object.entries(styles)) {
            if (name.endsWith("PageTitle") || name === "pageTitle") continue;
            assert.deepEqual(value, sectionHead, name+" must use one heading style");
        }
        assert.deepEqual(styles.pageTitle, styles.fbPageTitle,
            "Every tab must share the same page-heading typography");
        assert.notEqual(sectionHead.fontSize, styles.pageTitle.fontSize);
        await page.locator('[data-tab="fb"]').click();
        const editor = page.locator('[data-ui-section="fb-editor"]');
        assert.equal(await editor.evaluate(el => el.open),false);
        assert.equal(await page.locator("#new-fb-name").isVisible(),false);
        await editor.locator(":scope > summary").focus();
        await page.keyboard.press("Enter");
        assert.equal(await editor.evaluate(el => el.open),true);
        assert.equal(await page.locator("#new-fb-name").isVisible(),true);
        await page.reload();
        await page.locator('[data-tab="fb"]').click();
        assert.equal(await editor.evaluate(el => el.open),true,
            "Section expansion preference must survive a full refresh");
        await openSection(page, "fc-editor");
        assert.equal(await page.locator("#new-fc-name").isVisible(),true);
        console.log("Engineering disclosure topology, keyboard, persistence and headings: PASS");
    } finally {
        await browser.close();
    }
})().catch(error => {console.error(error);process.exitCode=1});
