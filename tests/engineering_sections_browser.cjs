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
            ["plc", "plc-tags"], ["plc", "plc-program"],
            ["plc", "plc-structures"],
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
        assert.equal(await page.locator('[data-ui-section="plc-create"]').count(), 0);
        assert.equal(await page.locator("#tia-create-plc-button").count(), 0);
        assert.equal(await page.locator("#tia-load-models-button").count(), 0);
        const help = page.locator('[data-ui-section="overview-help"]');
        assert.equal(await help.count(), 1);
        assert.equal(await help.evaluate(el => el.tagName), "DIV");
        assert.equal(await help.locator(":scope > summary").count(), 0);
        assert.equal(await help.locator(":scope > h3").innerText(),
            "Engineering context — getting started");
        assert.equal(await help.locator(":scope > .hint").isVisible(), true);
        const styles = await page.evaluate(() => {
            const computed = selector => {
                const value = getComputedStyle(document.querySelector(selector));
                return {fontFamily:value.fontFamily,fontSize:value.fontSize,fontWeight:value.fontWeight};
            };
            return {
                overviewProfile:computed("#overview-profile-management > details > summary"),
                overviewTia:computed("#overview-tia-controls > details > summary"),
                overviewHelp:computed('[data-ui-section="overview-help"] > h3'),
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

        // The collapsed visual surface must be identical across all engineering
        // tabs and dynamically assembled Overview/library panels.
        const surfaces = await page.evaluate(() => {
            const read = selector => {
                const el = document.querySelector(selector);
                const panel = el.closest("details");
                const cs = getComputedStyle(el);
                const box = getComputedStyle(panel);
                const arrow = getComputedStyle(el, "::before");
                return {
                    background: cs.backgroundColor,
                    color: cs.color,
                    font: cs.fontFamily,
                    size: cs.fontSize,
                    weight: cs.fontWeight,
                    minHeight: cs.minHeight,
                    padding: cs.padding,
                    gap: cs.columnGap,
                    border: box.borderTopColor,
                    radius: box.borderTopLeftRadius,
                    arrowWidth: arrow.width,
                    arrowColor: arrow.borderRightColor,
                };
            };
            return {
                udt: read('[data-ui-section="udt-editor"] > summary'),
                db: read('[data-ui-section="db-editor"] > summary'),
                plc: read('[data-ui-section="plc-tags"] > summary'),
                fb: read('[data-ui-section="fb-editor"] > summary'),
                preview: read('[data-ui-section="preview-import"] > summary'),
                overviewProfile: read('#overview-profile-management > details > summary'),
                overviewTia: read('#overview-tia-controls > details > summary'),
                device: read('[data-tab-panel="devices"] > details.device-section > summary'),
            };
        });
        for (const [name, values] of Object.entries(surfaces)) {
            assert.deepEqual(values, surfaces.udt,
                name + " collapsed section must match the Application UDTs header");
        }
        for (const id of ["plc-tags", "plc-program"]) {
            const node = page.locator('[data-ui-section="' + id + '"]');
            assert.equal(await node.locator(".ui-disclosure-body > details.tia-inventory-details").count(),0);
            assert.equal(await node.locator(".ui-disclosure-body > .tia-inventory-content > h4").count(),1);
        }
        // Geometric heights can only be compared while their tab is visible.
        await page.locator('[data-tab="udt"]').click();
        const udtHeight = await page.locator('[data-ui-section="udt-editor"] > summary')
            .evaluate(el => Math.round(el.getBoundingClientRect().height));
        await page.locator('[data-tab="project"]').click();
        const overviewHeight = await page.locator("#overview-profile-management > details > summary")
            .evaluate(el => Math.round(el.getBoundingClientRect().height));
        assert.equal(overviewHeight, udtHeight, "Visible panel header heights match");
        assert.equal(udtHeight, 54);
        await page.locator('[data-tab="fb"]').click();
        const editor = page.locator('[data-ui-section="fb-editor"]');
        assert.equal(await editor.evaluate(el => el.open),false);
        assert.equal(await page.locator("#new-fb-name").isVisible(),false);
        await editor.locator(":scope > summary").focus();
        await page.keyboard.press("Enter");
        assert.equal(await editor.evaluate(el => el.open),true);
        assert.equal(await page.locator("#new-fb-name").isVisible(),true);
        await page.waitForFunction(() => {
            const stored = JSON.parse(localStorage.getItem("tiaEngineeringAssistant.sections.v1") || "{}");
            return stored["fb-editor"] === true;
        }, null, {timeout:3000});
        await page.reload();
        await page.locator('[data-tab="project"]').click();
        assert.equal(await help.locator(":scope > .hint").isVisible(), true,
            "Engineering context stays visible across refreshes");
        await page.locator('[data-tab="fb"]').click();
        assert.equal(await editor.evaluate(el => el.open),true,
            "Section expansion preference must survive a full refresh");
        await openSection(page, "fc-editor");
        assert.equal(await page.locator("#new-fc-name").isVisible(),true);
        console.log("Engineering disclosures, fixed context, identical closed headers and typography: PASS");
    } finally {
        await browser.close();
    }
})().catch(error => {console.error(error);process.exitCode=1});
