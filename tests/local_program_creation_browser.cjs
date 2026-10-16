"use strict";
const assert = require("node:assert/strict");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const key = "tiaEngineeringAssistant.projectConfig";
(async () => {
    const browser = await chromium.launch({
        headless:true, executablePath:process.env.CHROME_PATH,
    });
    try {
        const page = await browser.newPage(), calls = [];
        page.on("dialog", dialog => dialog.accept());
        page.on("request", request => {
            if (new URL(request.url()).pathname.startsWith("/api/v1/tia/")) {
                calls.push({path:new URL(request.url()).pathname, method:request.method()});
            }
        });
        await page.route("**/api/v1/tia/**", route =>
            route.fulfill({status:503, json:{detail:"No TIA is available in this test"}}));
        await page.addInitScript(key => {
            localStorage.setItem(key, JSON.stringify({
                plc_family:"S7-1500", udts:[], dbs:[], fbs:[], fcs:[], instance_dbs:[],
            }));
            localStorage.setItem("tiaEngineeringAssistant.activeTab", "fb");
        }, key);
        await page.goto(process.env.APP_URL || "http://127.0.0.1:8765/");
        await page.locator('[data-tab="fb"]').click();

        const make = async (kind, name, number, language) => {
            await page.locator("#new-" + kind + "-name").fill(name);
            if (number !== null) await page.locator("#new-" + kind + "-number").fill(String(number));
            await page.locator("#new-" + kind + "-language").selectOption(language);
            await page.locator("#add-" + kind + "-button").click();
        };
        const section = (card, name) => card.locator(".program-declaration-section")
            .filter({has: page.locator("summary > span:first-child", {hasText:name})});
        const addMember = async (card, sectionName, name, dataType) => {
            const panel = section(card, sectionName);
            if (!(await panel.evaluate(el => el.open))) {
                await panel.locator(":scope > summary").click();
            }
            await panel.getByRole("button", {name:"Add field"}).click();
            const area = panel.locator(".member-add-area");
            await area.locator('input[id$="-name"]').fill(name);
            await area.locator('select[id$="-type"]').selectOption(dataType);
            await area.getByRole("button", {name:"Add", exact:true}).click();
            await panel.locator("tr[data-member-path]").filter({hasText:name}).waitFor();
        };

        await make("fb", "FB_LocalDrive", 53, "LAD");
        await page.getByText("FB FB_LocalDrive created in the active local profile", {exact:false}).waitFor();
        const fb = page.locator("#fb-container .program-block-card").filter({hasText:"FB_LocalDrive"});
        assert.match(await fb.locator(".program-block-header").innerText(), /FB_LocalDrive.*FB.*LAD.*53/s);
        assert.match(await fb.locator(".program-block-tags").innerText(), /Local new.*Not in TIA/s);
        assert.equal(await fb.locator(".program-declaration-section").count(), 6);
        assert.equal(await section(fb, "Input").evaluate(el=>el.open), true);
        assert.equal(await fb.locator(".program-source-details").count(), 0);
        await addMember(fb, "Input", "Enable", "Bool");
        await addMember(fb, "Output", "Running", "Bool");
        await addMember(fb, "Static", "State", "Bool");
        const retain = section(fb, "Static").locator('input[aria-label="Retain State"]');
        assert.equal(await retain.count(), 1);
        await retain.check();
        assert.equal(await retain.isChecked(), true);
        const native = section(fb, "Static").locator(".program-iec-controls select");
        await native.selectOption("TON_TIME");
        await section(fb, "Static").getByRole("button", {name:"Add IEC instance"}).click();
        assert.equal(await section(fb, "Static").locator("tr[data-member-path]").count(), 2);

        await make("fc", "FC_LocalCalc", 54, "FBD");
        await page.getByText("FC FC_LocalCalc created in the active local profile", {exact:false}).waitFor();
        const fc = page.locator("#fc-container .program-block-card").filter({hasText:"FC_LocalCalc"});
        assert.match(await fc.locator(".program-block-header").innerText(), /FC_LocalCalc.*FC.*FBD.*54/s);
        assert.equal(await fc.locator(".program-declaration-section").count(), 5);
        assert.equal(await fc.locator(".program-declaration-section").filter({hasText:"Static"}).count(), 0);
        await addMember(fc, "Input", "Value", "Int");
        await addMember(fc, "Temp", "Working", "Bool");

        const data = await page.evaluate(async () => {
            const {projectConfig} = await import("/gui/js/state.js");
            return structuredClone(projectConfig);
        });
        assert.equal(data.fbs.length, 1);
        assert.equal(data.fcs.length, 1);
        assert.equal(data.fbs[0].source_mode, "local");
        assert.equal(data.fbs[0].created_locally, true);
        assert.equal(data.fbs[0].source_xml, null);
        assert.equal(data.fbs[0].interface_verified, false);
        assert.equal(data.fbs[0].static.members[0].retain, true);
        assert.equal(data.fbs[0].static.members[1].data_type, "TON_TIME");
        assert.equal(data.fbs[0].input.members[0].name, "Enable");
        assert.equal(data.fcs[0].temp.members[0].name, "Working");
        assert.equal(data.fcs[0].source_xml, null);
        assert.equal(calls.filter(x=>x.method!=="GET").length, 0, "No TIA write may occur");

        await make("fc", "fb_localdrive", null, "LAD");
        await page.getByText("A Function or Function Block named fb_localdrive already exists.", {exact:false}).waitFor();
        assert.equal(await page.locator("#fc-container .program-block-card").count(), 1);
        await make("fc", "bad name!", null, "LAD");
        await page.getByText("Use a valid PLC name", {exact:false}).waitFor();
        assert.equal(await page.locator("#fc-container .program-block-card").count(), 1);

        await page.reload();
        await page.locator('[data-tab="fb"]').click();
        assert.equal(await page.locator("#fb-container .program-block-card").count(), 1);
        assert.equal(await page.locator("#fc-container .program-block-card").count(), 1);
        assert.equal(await page.locator('#fb-container input[aria-label="Retain State"]').isChecked(), true);
        const old = await page.evaluate(async () => {
            const {listProjectProfiles, getActiveProjectProfileId} = await import("/gui/js/state.js");
            return {profiles:listProjectProfiles(), id:getActiveProjectProfileId()};
        });
        assert.equal(old.profiles.length >= 1, true);
        await page.evaluate(async () => {
            const {createProjectProfile,switchProjectProfile} = await import("/gui/js/state.js");
            const p = createProjectProfile("Separate draft project");
            switchProjectProfile(p.id);
            window.dispatchEvent(new Event("project-profile-changed"));
        });
        // The active profile is isolated on reload.
        await page.reload();
        await page.locator('[data-tab="fb"]').click();
        assert.equal(await page.locator("#fb-container .program-block-card").count(), 0);
        assert.equal(await page.locator("#fc-container .program-block-card").count(), 0);
        assert.equal(calls.filter(x=>x.method!=="GET").length, 0);
        console.log("Local FB/FC create, declaration edit, IEC Static, isolation, no TIA writes: PASS");
    } finally {
        await browser.close();
    }
})().catch(error => {console.error(error); process.exitCode = 1});
