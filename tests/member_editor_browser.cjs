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
        // Each field now has one + / - editor, with no separate Edit button.
        assert.equal(await page.getByRole("button", { name: "Edit", exact: true }).count(), 0);
        const row = (path) => page.locator('tr[data-member-path="' + path + '"]');
        async function expand(target) {
            await target.locator('button.member-tree-toggle').click();
            const editor = target.locator(
                '+ tr.member-tree-edit-row > td > .member-editor-form'
            );
            await editor.waitFor();
            return editor;
        }
        async function save(editor) {
            await editor.locator(':scope > .action-row')
                .getByRole("button", { name: "Save", exact: true }).click();
        }
        async function editField(target, name, type, comment) {
            const editor = await expand(target);
            await editor.locator('input[id$="-name"]').first().fill(name);
            await editor.locator('select[id$="-type"]').first().selectOption(type);
            await editor.locator('input[id$="-comment"]').first().fill(comment);
            await save(editor);
        }
        const stsRow = row("udt-field-0:1");
        // +/- controls the ONLY details panel for this Struct.
        let stsForm = await expand(stsRow);
        assert.equal(await page.locator(
            'tr[data-member-details="udt-field-0:1"]'
        ).count(), 1);
        assert.equal(await stsRow.locator('button.member-tree-toggle')
            .getAttribute("aria-expanded"), "true");
        await stsRow.locator('button.member-tree-toggle').click();
        assert.equal(await page.locator(
            'tr[data-member-details="udt-field-0:1"]'
        ).count(), 0);
        stsForm = await expand(stsRow);

        // Child fields are edited INSIDE the parent draft; saving the parent
        // is required to persist those edits to projectConfig.
        const stsChild = (index) => stsForm.locator(
            'tr[data-member-path="udt-field-0-edit-1-struct:' + index + '"]'
        );
        await editField(stsChild(0), "Running", "Bool", "Motor running");
        await editField(stsChild(1), "Fault", "Word", "Fault code");
        await editField(stsChild(2), "Ready", "Bool", "Ready status");
        let config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.deepEqual(config.udts[0].fields[1].struct_members.map(
            (item) => item.name), ["Start", "Stop", "Reset"]);
        await save(stsForm);
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.deepEqual(config.udts[0].fields[1].struct_members.map(
            (item) => item.name), ["Running", "Fault", "Ready"]);
        assert.equal(config.udts[0].fields[1].struct_members[1].data_type, "Word");
        assert.equal(config.udts[0].fields[1].struct_members[1].comment, "Fault code");
        assert.equal(await page.locator(
            'tr[data-member-details="udt-field-0:1"]'
        ).count(), 0);

        // Cancel and - discard edits, including changes inside a Struct.
        stsForm = await expand(stsRow);
        const dirtyField = stsForm.locator(
            'tr[data-member-path="udt-field-0-edit-1-struct:0"]'
        );
        const dirtyForm = await expand(dirtyField);
        await dirtyForm.locator('input[id$="-name"]').first().fill("DraftOnly");
        await dirtyForm.locator(':scope > .action-row')
            .getByRole("button", { name: "Cancel", exact: true }).click();
        await stsForm.locator('input[id$="-comment"]').first().fill("Unsaved");
        await stsRow.locator('button.member-tree-toggle').click();
        assert.equal(await page.locator(
            'tr[data-member-details="udt-field-0:1"]'
        ).count(), 0);
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.equal(config.udts[0].fields[1].comment, null);

        // A duplicate member is rejected, leaving the form open.
        stsForm = await expand(stsRow);
        const duplicateForm = await expand(stsForm.locator(
            'tr[data-member-path="udt-field-0-edit-1-struct:1"]'
        ));
        await duplicateForm.locator('input[id$="-name"]').first().fill("Running");
        await save(duplicateForm);
        assert.match(await duplicateForm.locator(".member-editor-error")
            .first().innerText(), /unique/i);
        await duplicateForm.locator(':scope > .action-row')
            .getByRole("button", { name: "Cancel", exact: true }).click();

        // Add/delete/reorder works within a draft Struct.
        const tree = stsForm.locator(".member-tree").first();
        await tree.locator(":scope > .member-add-toggle").click();
        const addForm = tree.locator(
            ":scope > .member-add-area > .member-editor-form"
        );
        await addForm.locator('input[id$="-name"]').fill("Alarm");
        await addForm.locator('select[id$="-type"]').selectOption("Bool");
        await addForm.getByRole("button", { name: "Add", exact: true }).click();
        await stsForm.locator(
            'tr[data-member-path="udt-field-0-edit-1-struct:3"]'
        ).getByRole("button", { name: "Delete" }).click();
        await stsForm.locator(
            'tr[data-member-path="udt-field-0-edit-1-struct:2"]'
        ).getByRole("button", { name: "Move up" }).click();
        await save(stsForm);
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.deepEqual(config.udts[0].fields[1].struct_members.map(
            (item) => item.name), ["Running", "Ready", "Fault"]);

        // Deep nested Struct: changes persist only after Save at EACH level.
        const cmdForm = await expand(row("udt-field-0:0"));
        const advancedForm = await expand(cmdForm.locator(
            'tr[data-member-path="udt-field-0-edit-0-struct:3"]'
        ));
        const optionsForm = await expand(advancedForm.locator(
            'tr[data-member-path="udt-field-0-edit-0-struct-edit-3-struct:0"]'
        ));
        await editField(optionsForm.locator(
            'tr[data-member-path="udt-field-0-edit-0-struct-edit-3-struct-edit-0-struct:0"]'
        ), "Active", "Bool", "Deep flag");
        await save(optionsForm);
        await save(advancedForm);
        await save(cmdForm);
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.equal(config.udts[0].fields[0].struct_members[3]
            .struct_members[0].struct_members[0].name, "Active");

        // DB Array can be edited with +, and invalid bounds are rejected.
        await page.locator('[data-tab="db"]').click();
        await page.locator("#db-container > details > summary").click();
        const motors = row("db-member-0:0");
        let form = await expand(motors);
        assert.equal(await form.locator('select[id$="-array-type"]').inputValue(),
            "UDT_Motor");
        await form.locator('input[id$="-array-lower"]').fill("11");
        await form.locator('input[id$="-array-upper"]').fill("10");
        await save(form);
        assert.match(await form.locator(".member-editor-error").innerText(), /bounds/i);
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.equal(config.dbs[0].members[0].array_lower_bound, 0);
        await form.locator('input[id$="-array-lower"]').fill("1");
        await save(form);
        await motors.getByText("10 elements").waitFor();
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.equal(config.dbs[0].members[0].array_lower_bound, 1);
        assert.equal(config.dbs[0].members[0].array_upper_bound, 10);

        const settingsForm = await expand(row("db-member-0:1"));
        await editField(settingsForm.locator(
            'tr[data-member-path="db-member-0-edit-1-struct:0"]'
        ), "Active", "Bool", "DB setting");
        await save(settingsForm);
        config = await page.evaluate((key) =>
            JSON.parse(localStorage.getItem(key)), key);
        assert.equal(config.dbs[0].members[1].struct_members[0].name, "Active");

        await page.reload();
        await page.locator('[data-tab="udt"]').click();
        await page.locator("#udt-container > details > summary").click();
        const persistedForm = await expand(row("udt-field-0:1"));
        const persistedMember = persistedForm.locator(
            'tr[data-member-path="udt-field-0-edit-1-struct:0"]'
        );
        await persistedMember.waitFor();
        // The visible name cell also contains the +/- editor toggle.
        // getByText("Running", {exact:true}) cannot match "+ Running".
        assert.match(
            await persistedMember.locator("td").first().innerText(),
            /\\bRunning\\b/
        );
        await persistedForm.locator(':scope > .action-row')
            .getByRole("button", { name: "Cancel", exact: true }).click();
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
