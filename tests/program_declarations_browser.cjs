"use strict";
const assert = require("node:assert/strict");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const key = "tiaEngineeringAssistant.projectConfig";
const member = (name, type = "Bool") => ({name, data_type: type, comment: null});
const section = (name, members = []) => ({name, members});
const FB = {
    name: "FB_Test", language: "KOP", source_mode: "local",
    interface_verified: false, declaration_draft: true,
    input: section("Input", [member("Start")]),
    output: section("Output"), inout: section("InOut"),
    static: section("Static", [{
        name: "TON_Unblocked", data_type: "TON_TIME", system_instance: true,
        system_preview: [
            {name: "PT", path: "TON_Unblocked.PT", data_type: "Time", level: 1},
            {name: "ET", path: "TON_Unblocked.ET", data_type: "Time", level: 1},
            {name: "IN", path: "TON_Unblocked.IN", data_type: "Bool", level: 1},
            {name: "Q", path: "TON_Unblocked.Q", data_type: "Bool", level: 1},
        ],
    }]), temp: section("Temp"),
    constant: section("Constant"),
};
const FC = {
    name: "FC_Test", language: "FBD", source_mode: "tia_read_only",
    source_xml: "<SW.Blocks.FC />", interface_verified: true,
    input: section("Input", [member("Enable")]),
    output: section("Output"), inout: section("InOut"),
    temp: section("Temp"), constant: section("Constant"),
};
(async () => {
    const browser = await chromium.launch({
        headless: true, executablePath: process.env.CHROME_PATH,
    });
    try {
        const page = await browser.newPage();
        page.on("dialog", dialog => dialog.accept());
        await page.route("**/api/v1/tia/**", route =>
            route.fulfill({status: 503, json: {detail: "TIA mocked"}}));
        await page.addInitScript(({key, FB, FC}) => {
            localStorage.setItem(key, JSON.stringify({
                plc_family:"S7-1500", udts:[], dbs:[], fbs:[FB], fcs:[FC], instance_dbs:[],
            }));
        }, {key, FB, FC});
        await page.goto(process.env.APP_URL || "http://127.0.0.1:8765/");
        await page.locator('[data-tab="fb"]').click();

        const fb = page.locator("#fb-container .program-block-card").first();
        assert.match(await fb.locator(".program-block-header").innerText(), /FB_Test.*FB.*LAD/s);
        assert.doesNotMatch(await fb.locator(".program-block-header").innerText(), /KOP/);
        assert.match(await fb.locator(".program-block-tags").innerText(), /Legacy.*Unverified/);
        assert.match(await fb.locator(".program-block-tags").innerText(), /Local draft/);
        assert.equal(await fb.locator(".program-declaration-section").count(), 6);
        assert.equal(await fb.locator(".program-declarations").count(), 1);
        const input = fb.locator(".program-declaration-section").first();
        const output = fb.locator(".program-declaration-section").nth(1);
        assert.equal(await input.evaluate(el => el.open), true);
        assert.equal(await output.evaluate(el => el.open), false);
        assert.equal(await input.locator("tr[data-member-path]").count(), 1);
        await output.locator(":scope > summary").click();
        assert.equal(await output.evaluate(el => el.open), true);
        const staticSection = fb.locator(".program-declaration-section").nth(3);
        assert.equal(await staticSection.evaluate(el => el.open), true);
        await staticSection.locator("tr[data-member-path]").first()
            .locator("button.member-tree-toggle").click();
        const preview = staticSection.locator(".native-instance-preview");
        assert.equal(await preview.locator("[data-native-member-path]").count(), 4);
        assert.deepEqual(await preview.locator("[data-native-member-path]").evaluateAll(
            rows => rows.map(el => el.getAttribute("data-native-member-path"))), [
                "TON_Unblocked.PT", "TON_Unblocked.ET", "TON_Unblocked.IN", "TON_Unblocked.Q",
            ]);
        assert.equal(await staticSection.locator("tr[data-member-path]").count(), 1);
        const converted = await page.evaluate(async () => {
            const {convertTiaFbDetail} = await import("/gui/js/fb_import_converter.js");
            return convertTiaFbDetail({
                kind: "FB", name: "FB_Original", programming_language: "LAD",
                source_xml: "<SW.Blocks.FB/>",
                members: [
                    {section: "Static", path:"TON_Unblocked", name:"TON_Unblocked",
                     data_type:"TON_TIME", level:0, system_instance:true},
                    ...["PT","ET","IN","Q"].map((name, index) => ({
                        section: "Static", path:"TON_Unblocked."+name, name,
                        data_type:index<2 ? "Time" : "Bool", level:1,
                    })),
                ],
            });
        });
        assert.equal(converted.interface_verified, true);
        assert.equal(converted.static.members.length, 1);
        assert.deepEqual(converted.static.members[0].system_preview.map(x=>x.name),
            ["PT","ET","IN","Q"]);
        await fb.locator(".program-meta-details > summary").click();
        assert.match(await fb.locator(".program-meta-details").innerText(),
            /Local declaration drafts are editable/);
        assert.equal(await fb.locator(".program-state-draft").count(), 1);

        const fc = page.locator("#fc-container .program-block-card").first();
        assert.match(await fc.locator(".program-block-header").innerText(), /FC_Test.*FC.*FBD/s);
        assert.equal(await fc.locator(".program-declaration-section").count(), 5);
        assert.equal(await fc.locator(".program-declaration-section").filter({hasText:"Static"}).count(), 0);
        assert.equal(await fc.locator(".program-source-details").count(), 1);
        await fc.locator(".program-source-details > summary").click();
        assert.match(await fc.locator("pre").innerText(), /SW.Blocks.FC/);
        console.log("FB/FC compact declarations, snapshot statuses and LAD terminology: PASS");
    } finally {
        await browser.close();
    }
})().catch(error => {console.error(error); process.exitCode=1});
