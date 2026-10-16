"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const base = process.env.APP_URL || "http://127.0.0.1:8765/";
const output = process.env.PLAYWRIGHT_ARTIFACTS_DIR || "test-results/playwright";
const primitive = (name, data_type) => ({name, data_type});
(async () => {
    const browser = await chromium.launch({
        headless: true, executablePath: process.env.CHROME_PATH,
    });
    const contexts = [];
    const pages = [];
    let tracing = false;
    try {
        const contextA = await browser.newContext();
        contexts.push(contextA);
        await contextA.tracing.start({screenshots: true, snapshots: true, sources: true});
        tracing = true;
        const pageA = await contextA.newPage();
        pages.push(pageA);
        await pageA.goto(base);
        await pageA.locator('[data-tab="libraries"]').click();
        const importMenu = pageA.locator("#library-import-card").locator("xpath=..");
        assert.equal(await importMenu.evaluate(el => el.tagName), "DETAILS");
        assert.equal(await importMenu.evaluate(el => el.open), false);
        await importMenu.locator(":scope > summary").click();
        assert.equal(await importMenu.evaluate(el => el.open), true);
        assert.equal(await pageA.locator("#library-import-panel").evaluate(el => el.tagName), "DIV",
            "Import Library shows its controls without a second disclosure");
        assert.equal(await pageA.locator("#library-import-panel > summary").count(),0);
        assert.equal(await pageA.locator('#library-import-panel > input[type="file"]').isVisible(),true);
        assert.equal(await pageA.locator("#library-import-panel > details").count(),1);
        assert.equal(await pageA.locator("#library-import-panel > details").first()
            .getAttribute("id"),"library-selective-import-panel");

        const recoveryMenu = pageA.locator("#data-libraries-root > details.card").last();
        assert.equal(await recoveryMenu.locator(":scope > summary").innerText(),"Recovery snapshots");
        await recoveryMenu.locator(":scope > summary").click();
        assert.equal(await recoveryMenu.locator(".library-snapshot-list > h4").isVisible(),true);
        assert.equal(await recoveryMenu.locator(".library-snapshot-list > details").count(),0);

        // Source browser: DB -> UDT_Motor -> UDT_Sub. Array and nested Struct
        // must be preserved exactly; revisions must survive JSON transfer.
        const exported = await pageA.evaluate(async () => {
            const store = await import("/gui/js/library_store.js");
            const library = await store.createLibrary("Roundtrip source");
            const result = await store.putLibraryObjects(library.id, [
                {object_type: "udt", name: "UDT_Sub",
                    fields: [{name: "Ready", data_type: "Bool"}]},
                {object_type: "udt", name: "UDT_Motor",
                    fields: [{name: "Group", data_type: "Struct", struct_members: [
                        {name: "Sub", data_type: "UDT_Sub"},
                        {name: "Speeds", data_type: "Array", array_element_type: "Real",
                            array_lower_bound: 0, array_upper_bound: 3},
                    ]}]},
                {object_type: "db", name: "DB_Motors", retain: true,
                    members: [{name: "Motors", data_type: "Array",
                        array_element_type: "UDT_Motor", array_lower_bound: 1, array_upper_bound: 4}]},
            ]);
            const motor = result.added.find(item => item.name === "UDT_Motor");
            await store.createLibraryObjectRevision(motor.id, {
                version: "1.1.0", changelog: "Add a diagnostic flag",
                payload: {name: "UDT_Motor", fields: [
                    {name: "Group", data_type: "Struct", struct_members: [
                        {name: "Sub", data_type: "UDT_Sub"},
                        {name: "Speeds", data_type: "Array", array_element_type: "Real",
                            array_lower_bound: 0, array_upper_bound: 3},
                    ]},
                    {name: "Diagnostic", data_type: "Bool"},
                ]},
            });
            const objects = await store.listLibraryObjects(library.id);
            const db = objects.find(item => item.name === "DB_Motors");
            const file = JSON.stringify(store.exportPackage(library, [db.id], objects));
            const contents = store.parsePackage(file);
            if (contents.objects.length !== 3) throw Error("Dependency export incomplete.");
            return file;
        });

        // Browser context B has separate IndexedDB/localStorage (as another
        // machine/browser profile would); import only the portable JSON.
        const contextB = await browser.newContext();
        contexts.push(contextB);
        const pageB = await contextB.newPage();
        pages.push(pageB);
        await pageB.goto(base);
        await pageB.locator('[data-tab="libraries"]').click();
        await pageB.locator("#library-import-card").locator("xpath=..")
            .locator(":scope > summary").click();
        await pageB.locator('#library-import-panel > input[type="file"]').setInputFiles({
            name:"portable-library.json",mimeType:"application/json",buffer:Buffer.from(exported),
        });
        await pageB.waitForFunction(() => document.querySelector("#library-import-panel > .status-box")
            ?.textContent.includes("validated object(s)"));
        assert.equal(await pageB.locator("#library-import-panel")
            .getByRole("button",{name:"Import as new library"}).isEnabled(),true);
        assert.match(await pageB.locator("#library-import-panel > .status-box").innerText(),/3 validated object/);
        const result = await pageB.evaluate(async sourceJson => {
            const store = await import("/gui/js/library_store.js");
            const pkg = store.parsePackage(sourceJson);
            const imported = await store.createLibraryWithObjects(pkg.metadata, pkg.objects);
            const objects = await store.listLibraryObjects(imported.library.id);
            const motor = objects.find(item => item.name === "UDT_Motor");
            const db = objects.find(item => item.name === "DB_Motors");
            const sub = objects.find(item => item.name === "UDT_Sub");
            if (!motor || !db || !sub) throw Error("Cross-context import lost a dependency.");
            if (motor.versions.length !== 2 || motor.version !== "1.1.0")
                throw Error("Version history was lost in round-trip.");
            if (motor.payload.fields[0].struct_members[1].array_upper_bound !== 3)
                throw Error("Nested Struct/Array was corrupted.");
            if (db.payload.members[0].array_element_type !== "UDT_Motor" || !db.payload.retain)
                throw Error("DB array/RETAIN failed round-trip.");

            const destination = await store.createLibrary("Selective destination");
            await store.putLibraryObjects(destination.id, [{
                object_type: "udt", name: "UDT_Motor",
                fields: [{name: "Speed", data_type: "Int"}],
            }]);
            const target = await store.listLibraryObjects(destination.id);
            const sourceDb = pkg.objects.find(item => item.name === "DB_Motors");
            const sourceMotor = pkg.objects.find(item => item.name === "UDT_Motor");
            const decisions = {[sourceMotor.id]: {action: "rename", name: "UDT_Motor_New"}};
            const plan = store.planSelectiveLibraryImport([sourceDb.id], pkg.objects, target, decisions);
            if (plan.unresolved.length) throw Error("Rename conflict not resolved.");
            const applied = await store.applySelectiveLibraryImport(
                destination.id, [sourceDb.id], pkg.objects, decisions);
            const importedObjects = await store.listLibraryObjects(destination.id);
            const renamedDb = importedObjects.find(item => item.name === "DB_Motors");
            if (renamedDb?.payload.members[0].array_element_type !== "UDT_Motor_New")
                throw Error("Selective rename failed to rewrite DB dependency.");
            const original = importedObjects.find(item => item.name === "UDT_Motor");
            if (original.payload.fields[0].data_type !== "Int")
                throw Error("Selective import overwrote the existing UDT.");

            // Explicit SemVer revision and Replace preserve all prior snapshots.
            await store.applySelectiveLibraryImport(destination.id, [sourceMotor.id],
                pkg.objects, {[sourceMotor.id]: {action: "version", version: "2.0.0"}});
            // Replacement must actually differ: an identical payload should
            // correctly auto-skip rather than manufacture a duplicate revision.
            const revisedSource = pkg.objects.map(item => item.id === sourceMotor.id
                ? {...item, payload: {...item.payload, fields: [
                    ...item.payload.fields, {name: "ReplacementFlag", data_type: "Bool"},
                ]}} : item);
            await store.applySelectiveLibraryImport(destination.id, [sourceMotor.id],
                revisedSource, {[sourceMotor.id]: {action: "replace", version: "3.0.0"}});
            const versions = (await store.listLibraryObjects(destination.id))
                .find(item => item.name === "UDT_Motor").versions;
            if (versions.length !== 3 ||
                versions[0].snapshot.payload.fields[0].data_type !== "Int")
                throw Error("Version/Replace did not preserve previous revision.");
            return {objects: objects.length, revisions: motor.versions.length,
                selectivelyAdded: applied.added, destRevisions: versions.length};
        }, exported);
        assert.deepEqual(result, {objects: 3, revisions: 2, selectivelyAdded: 3, destRevisions: 3});
        console.log("library_transfer_browser: PASS — " + JSON.stringify(result));
    } catch (error) {
        await fs.mkdir(output, {recursive: true});
        if (pages.length) await pages[pages.length - 1]
            .screenshot({path: path.join(output, "library-transfer-failure.png"), fullPage: true})
            .catch(() => undefined);
        if (tracing) await contexts[0].tracing.stop({
            path: path.join(output, "library-transfer-trace.zip"),
        }).catch(() => undefined);
        await fs.writeFile(path.join(output, "library-transfer-failure.txt"), String(error.stack || error));
        console.error(error);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
})();
