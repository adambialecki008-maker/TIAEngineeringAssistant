const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const key = "tiaEngineeringAssistant.projectConfig";
const primitive = (name, type, comment = null) => ({
    name, data_type: type, comment,
    array_element_type: null,
    array_lower_bound: null,
    array_upper_bound: null,
    struct_members: null,
});
const structure = (name, members) => ({
    ...primitive(name, "Struct"),
    struct_members: members,
});
const seed = {
    plc_family: "S7-1500",
    udts: [{
        name: "UDT_Motor",
        fields: [
            structure("Cmd", [
                primitive("Start", "Bool"),
                primitive("Stop", "Bool"),
                primitive("Reset", "Bool"),
                structure("Advanced", [
                    structure("Options", [primitive("Enabled", "Bool")]),
                ]),
            ]),
            structure("Sts", [
                primitive("Start", "Bool"),
                primitive("Stop", "Bool"),
                primitive("Reset", "Bool"),
            ]),
        ],
    }],
    dbs: [{
        name: "DB_Motors",
        members: [{
            ...primitive("Motors", "Array"),
            array_element_type: "UDT_Motor",
            array_lower_bound: 0,
            array_upper_bound: 10,
        }, structure("Settings", [primitive("Enabled", "Bool")])],
    }],
};

(async () => {
    const browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHROME_PATH,
    });
    try {
        const page = await browser.newPage();
        let promptAnswer = null;
        page.on("dialog", (dialog) => {
            if (dialog.type() === "prompt" && promptAnswer !== null) {
                const answer = promptAnswer;
                promptAnswer = null;
                dialog.accept(answer);
            } else {
                dialog.accept();
            }
        });
        await page.route("**/api/v1/tia/**", (route) =>
            route.fulfill({
                status: 503,
                contentType: "application/json",
                body: '{"detail":"Mocked for editor test"}',
            })
        );
        await page.addInitScript(({ key, seed }) => {
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, JSON.stringify(seed));
            }
        }, { key, seed });
        await page.goto(process.env.APP_URL || "http://127.0.0.1:8765/");
        await page.locator('[data-tab="udt"]').click();
        await page.locator("#udt-container > details > summary").click();
        if (process.env.SCREENSHOT_PATH) {
            await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true });
        }
        await page.locator('[data-member-path="udt-field-0:1.0"]').waitFor();
        const sts = page.locator('[data-member-children="udt-field-0:1"]');
        const toggle = page.locator('button[data-member-path="udt-field-0:1"]');
        await toggle.click();
        assert.equal(await sts.isVisible(), false);
        await toggle.click();
        assert.equal(await sts.isVisible(), true);

        async function edit(path, name, type, comment) {
            const row = page.locator('[data-member-path="udt-field-0:' + path + '"]');
            await row.getByRole("button", { name: "Edit" }).click();
            const form = row.locator("+ tr.member-tree-edit-row .member-editor-form");
            await form.locator('input[id$="-name"]').fill(name);
            await form.locator('select[id$="-type"]').selectOption(type);
            await form.locator('input[id$="-comment"]').fill(comment);
            await form.getByRole("button", { name: "Save" }).click();
        }
        await edit("0.3.0.0", "Active", "Bool", "Deep flag");
        await edit("1.0", "Running", "Bool", "Motor running");
        await edit("1.1", "Fault", "Word", "Fault code");
        await edit("1.2", "Ready", "Bool", "Ready status");
        let config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.deepEqual(
            config.udts[0].fields[1].struct_members.map((item) => item.name),
            ["Running", "Fault", "Ready"]
        );
        assert.equal(
            config.udts[0].fields[0].struct_members[3]
                .struct_members[0].struct_members[0].name,
            "Active"
        );
        assert.equal(config.udts[0].fields[1].struct_members[1].data_type, "Word");
        assert.equal(config.udts[0].fields[1].struct_members[1].comment, "Fault code");

        await page.locator(
            '[data-member-children="udt-field-0:1"] > td > .member-add-toggle'
        ).click();
        const addForm = page.locator(
            '[data-member-children="udt-field-0:1"] > td > .member-add-area > .member-editor-form'
        );
        await addForm.locator('input[id$="-name"]').fill("Alarm");
        await addForm.locator('select[id$="-type"]').selectOption("Bool");
        await addForm.getByRole("button", { name: "Add" }).click();
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.equal(config.udts[0].fields[1].struct_members.length, 4);
        await page.locator('[data-member-path="udt-field-0:1.3"]')
            .getByRole("button", { name: "Delete" }).click();
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.equal(config.udts[0].fields[1].struct_members.length, 3);
        await page.locator('[data-member-path="udt-field-0:1.2"]')
            .getByRole("button", { name: "Move up" }).click();
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.deepEqual(
            config.udts[0].fields[1].struct_members.map((item) => item.name),
            ["Running", "Ready", "Fault"]
        );

        const running = page.locator('[data-member-path="udt-field-0:1.0"]');
        await running.getByRole("button", { name: "Edit" }).click();
        let form = running.locator("+ tr.member-tree-edit-row .member-editor-form");
        await form.locator('input[id$="-name"]').fill("Changed");
        await form.getByRole("button", { name: "Cancel" }).click();
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.equal(config.udts[0].fields[1].struct_members[0].name, "Running");

        const fault = page.locator('[data-member-path="udt-field-0:1.2"]');
        await fault.getByRole("button", { name: "Edit" }).click();
        form = fault.locator("+ tr.member-tree-edit-row .member-editor-form");
        await form.locator('input[id$="-name"]').fill("Running");
        await form.getByRole("button", { name: "Save" }).click();
        assert.match(await form.locator(".member-editor-error").innerText(), /unique/i);
        await form.getByRole("button", { name: "Cancel" }).click();

        const stsParent = page.locator('[data-member-path="udt-field-0:1"]');
        await stsParent.getByRole("button", { name: "Edit" }).click();
        const parentForm = stsParent.locator(
            "+ tr.member-tree-edit-row > td > .member-editor-form"
        );
        const draftChild = parentForm.locator(
            '[data-member-path="udt-field-0-edit-1-struct:0"]'
        );
        await draftChild.getByRole("button", { name: "Edit" }).click();
        const draftForm = draftChild.locator("+ tr.member-tree-edit-row .member-editor-form").first();
        await draftForm.locator('input[id$="-name"]').fill("DraftOnly");
        await draftForm.getByRole("button", { name: "Save" }).click();
        await parentForm.getByRole("button", { name: "Cancel", exact: true }).first().click();
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.equal(config.udts[0].fields[1].struct_members[0].name, "Running");

        await stsParent.getByRole("button", { name: "Edit" }).click();
        const savedParentForm = stsParent.locator(
            "+ tr.member-tree-edit-row > td > .member-editor-form"
        );
        const savedDraftChild = savedParentForm.locator(
            '[data-member-path="udt-field-0-edit-1-struct:0"]'
        );
        await savedDraftChild.getByRole("button", { name: "Edit" }).click();
        const savedDraftForm = savedDraftChild.locator(
            "+ tr.member-tree-edit-row .member-editor-form"
        ).first();
        await savedDraftForm.locator('input[id$="-comment"]').fill("Saved from parent");
        await savedDraftForm.getByRole("button", { name: "Save" }).click();
        await savedParentForm.locator(":scope > .action-row")
            .getByRole("button", { name: "Save" }).click();
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.equal(
            config.udts[0].fields[1].struct_members[0].comment,
            "Saved from parent"
        );

        await page.locator('[data-tab="db"]').click();
        await page.locator("#db-container > details > summary").click();
        const motors = page.locator('[data-member-path="db-member-0:0"]');
        await motors.getByRole("button", { name: "Edit" }).click();
        form = motors.locator("+ tr.member-tree-edit-row .member-editor-form");
        assert.equal(await form.locator('select[id$="-array-type"]').inputValue(),
            "UDT_Motor");
        await form.locator('input[id$="-array-lower"]').fill("11");
        await form.locator('input[id$="-array-upper"]').fill("10");
        await form.getByRole("button", { name: "Save" }).click();
        assert.match(await form.locator(".member-editor-error").innerText(), /bounds/i);
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.equal(config.dbs[0].members[0].array_lower_bound, 0);
        await form.locator('input[id$="-array-lower"]').fill("1");
        await form.getByRole("button", { name: "Save" }).click();
        await page.locator('[data-member-path="db-member-0:0"]')
            .getByText("10 elements").waitFor();
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.equal(config.dbs[0].members[0].array_lower_bound, 1);
        assert.equal(config.dbs[0].members[0].array_upper_bound, 10);

        const dbChild = page.locator('[data-member-path="db-member-0:1.0"]');
        await dbChild.getByRole("button", { name: "Edit" }).click();
        const dbChildForm = dbChild.locator(
            "+ tr.member-tree-edit-row .member-editor-form"
        );
        await dbChildForm.locator('input[id$="-name"]').fill("Active");
        await dbChildForm.locator('input[id$="-comment"]').fill("DB setting");
        await dbChildForm.getByRole("button", { name: "Save" }).click();
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.equal(config.dbs[0].members[1].struct_members[0].name, "Active");

        await page.reload();
        await page.locator('[data-tab="udt"]').click();
        await page.locator("#udt-container > details > summary").click();
        await page.locator('[data-member-path="udt-field-0:1.0"]')
            .getByText("Running", { exact: true }).waitFor();
        await page.locator('[data-tab="preview"]').click();
        await page.locator("#generate-preview-button").click();
        await page.waitForFunction(() =>
            document.querySelector("#source-preview").textContent.includes("Cmd : Struct")
        );
        const source = await page.locator("#source-preview").innerText();
        for (const text of [
            "Cmd : Struct", "Start : Bool;", "Stop : Bool;",
            "Advanced : Struct", "Options : Struct", "Active : Bool;",
            "Sts : Struct", "Running : Bool;", "Ready : Bool;",
            "Fault : Word;", "Array[1..10] of \"UDT_Motor\"",
            "Settings : Struct", "Active : Bool;",
        ]) assert.ok(source.includes(text), text);

        await page.locator('[data-tab="udt"]').click();
        if (!(await page.locator("#udt-container > details")
            .evaluate((details) => details.open))) {
            await page.locator("#udt-container > details > summary").click();
        }
        const udtValidation = page.waitForResponse(
            (response) => response.url().endsWith("/api/v1/udt-specifications")
        );
        await page.getByRole("button", { name: "Validate UDT" }).click();
        assert.equal((await udtValidation).status(), 200);

        promptAnswer = "UDT_Motor_Renamed";
        await page.getByRole("button", { name: "Rename UDT" }).click();
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.equal(config.udts[0].name, "UDT_Motor_Renamed");
        assert.equal(config.dbs[0].members[0].array_element_type,
            "UDT_Motor_Renamed");
        if (!(await page.locator("#udt-container > details")
            .evaluate((details) => details.open))) {
            await page.locator("#udt-container > details > summary").click();
        }
        await page.getByRole("button", { name: "Delete UDT" }).click();
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.equal(config.udts.length, 1);

        await page.locator('[data-tab="db"]').click();
        if (!(await page.locator("#db-container > details")
            .evaluate((details) => details.open))) {
            await page.locator("#db-container > details > summary").click();
        }
        const dbValidation = page.waitForResponse(
            (response) => response.url().endsWith("/api/v1/db-specifications")
        );
        await page.getByRole("button", { name: "Validate DB" }).click();
        assert.equal((await dbValidation).status(), 200);
        console.log("UDT/DB browser regression passed");
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
