"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const artifacts = process.env.PLAYWRIGHT_ARTIFACTS_DIR || "test-results/playwright";
(async () => {
    const browser = await chromium.launch({
        headless:true, executablePath:process.env.CHROME_PATH,
    });
    let page, context, tracing=false;
    try {
        context = await browser.newContext({acceptDownloads:true});
        await context.tracing.start({screenshots:true,snapshots:true,sources:true});
        tracing = true;
        page = await context.newPage();
        await page.addInitScript(() => {
            localStorage.setItem("tiaEngineeringAssistant.activeTab", "preview");
            localStorage.setItem("tiaEngineeringAssistant.projectConfig",
                JSON.stringify({
                    plc_family:"", tia_target:null,
                    udts:[
                        {name:"UDT_Main", fields:[
                            {name:"Sub",data_type:"UDT_Child"},
                        ]},
                        {name:"UDT_Child",fields:[
                            {name:"Ready",data_type:"Bool"},
                        ]},
                    ],
                    dbs:[{name:"DB_Main",retain:false,members:[
                        {name:"Unit",data_type:"UDT_Main"},
                    ]}],
                }));
        });
        const traffic = [];
        page.on("request", req => {
            if(req.url().includes("/api/v1/tia/")) {
                traffic.push({url:req.url(),method:req.method()});
            }
        });
        await page.goto(process.env.APP_URL || "http://127.0.0.1:8765/");
        await page.locator('[data-tab="preview"]').click();
        const button = page.locator("#source-export-bundle-button");
        await assert.doesNotReject(() => button.waitFor({state:"visible"}));
        assert.equal(await button.isDisabled(), false);
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            button.click(),
        ]);
        assert.equal(download.suggestedFilename(),
            "TIAEngineeringAssistant_UDT_DB_SCL.zip");
        const diskFile = await download.path();
        assert.ok((await fs.stat(diskFile)).size > 200);
        const script = [
            "import json,zipfile,sys",
            "z=zipfile.ZipFile(sys.argv[1])",
            "m=json.loads(z.read('manifest.json'))",
            "print(json.dumps({'names':[x['name'] for x in m['files']],",
            "'dependencies':m['auto_dependencies'],",
            "'safe':m['safety']['tia_modified']}))",
        ].join("\n");
        const manifest = JSON.parse(execFileSync(
            "python", ["-c",script,diskFile], {encoding:"utf8"}));
        assert.deepEqual(manifest.names, ["UDT_Child","UDT_Main","DB_Main"]);
        assert.deepEqual(manifest.dependencies, []);
        assert.equal(manifest.safe,false);
        assert.equal(traffic.filter(req => /\/(plan|apply)$/.test(
            new URL(req.url).pathname)).length,0,
            "Offline SCL download must never call a TIA preflight or write");
        assert.equal(traffic.filter(req => /\/export$/.test(
            new URL(req.url).pathname)).length,1);
        assert.match(await page.locator("#source-export-bundle-status").innerText(),
            /no TIA changes made/i);
        console.log("scl_bundle_browser: PASS — ZIP downloaded with no TIA connection");
    } catch (error) {
        await fs.mkdir(artifacts, {recursive:true});
        if(page) await page.screenshot({
            path:path.join(artifacts,"scl-bundle-failure.png"),fullPage:true,
        }).catch(()=>undefined);
        if(context && tracing) await context.tracing.stop({
            path:path.join(artifacts,"scl-bundle-trace.zip"),
        }).catch(()=>undefined);
        await fs.writeFile(path.join(artifacts,"scl-bundle-failure.txt"),
            String(error.stack||error));
        console.error(error);
        process.exitCode=1;
    } finally {
        await browser.close();
    }
})();
