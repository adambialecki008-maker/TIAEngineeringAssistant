"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

(async () => {
    const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH});
    try {
        const page = await browser.newPage();
        await page.route("**/api/v1/code-review/analyze-files", route => {
            const sources = route.request().postDataJSON();
            assert.equal(sources.length, 1);
            assert.equal(sources[0].name, "TIA snapshot/FB_FromTia.xml");
            return route.fulfill({contentType: "application/json", body:JSON.stringify({
                files:[{
                    source_file:"TIA snapshot/FB_FromTia.xml", name:"FB_FromTia",
                    block_type:"FB", language:"LAD", declarations:[], networks:[],
                    network_details:[], calls:[], variable_usage:[], dependencies:[],
                    parsing_warnings:[], verification_status:"parsed",
                }],
                findings:[{
                    source_file:"TIA snapshot/FB_FromTia.xml",block:"FB_FromTia",
                    language:"LAD",location:"network 1",severity:"warning",
                    priority:"P2",category:"Partial topology",
                    explanation:"Requires TIA verification",detection_method:"rule",
                    verification_status:"requires TIA verification",
                }],
                file_warnings:[],read_only:true,
            })});
        });
        await page.route("**/api/v1/code-review/export-tia-project-for-llm?process_id=321", route => {
            assert.equal(route.request().method(), "POST");
            return route.fulfill({
                status:200,contentType:"application/zip",
                headers:{"Content-Disposition":'attachment; filename="TIA_Portal_Entire_Project_LLM_Review.zip"'},
                body:Buffer.from("PK\x03\x04fake-zip-test"),
            });
        });
        await page.addInitScript(() => localStorage.setItem(
            "tiaEngineeringAssistant.projectConfig",
            JSON.stringify({
                plc_family:"", udts:[], dbs:[], fcs:[], instance_dbs:[],
                device_config:{templates:[],groups:[],mappings:[],mapping_mode:"device"},
                tia_target:null,
                fbs:[{
                    name:"FB_FromTia",language:"LAD",source_mode:"tia_read_only",
                    source_xml:'<SW.Blocks.FB Name="FB_FromTia"><CompileUnit/></SW.Blocks.FB>',
                    interface_verified:true,
                }],
            }),
        ));
        await page.goto(process.env.APP_URL || "http://127.0.0.1:8765/");
        await page.locator('[data-tab="review"]').click();
        // Explicit regression: manual file upload card is gone.
        assert.equal(await page.getByRole("heading", {name:"Analyze Files"}).count(), 0);
        for (const id of ["review-files","review-folder","review-analyze","review-status",
                          "review-download","review-download-markdown","review-files-list",
                          "review-proposal-panel"]) {
            assert.equal(await page.locator("#" + id).count(), 0, "Removed control: " + id);
        }
        // The unrelated Create PLC UI must NOT be removed.
        assert.equal(await page.locator("#tia-create-plc-button").count(), 1);
        assert.equal(await page.locator("#review-export-llm").isVisible(), true);
        assert.equal(await page.locator("#review-tia-analyze").isVisible(), true);
        await page.locator("#review-export-llm").click();
        assert.match(await page.locator("#review-export-llm-status").innerText(),
            /Select a running TIA Portal process/);
        await page.locator("#review-tia-analyze").click();
        await page.waitForFunction(() =>
            document.getElementById("review-tia-status")?.textContent
                ?.includes("loaded TIA snapshot(s) analyzed"));
        assert.match(await page.locator("#review-results .review-project-summary").innerText(),
            /Project overview/);
        assert.match(await page.locator("#review-results .review-priority-summary").innerText(),
            /P2: 1/);
        await page.locator("#review-filter-priority").selectOption("P0");
        assert.equal(await page.locator("#review-results .review-finding-row").count(), 0);
        await page.locator("#review-filter-priority").selectOption("");
        assert.equal(await page.locator("#review-results .review-finding-row").count(), 1);
        await page.locator("#tia-process").evaluate(select => {
            const option = document.createElement("option");
            option.value = "321";
            option.textContent = "TIA Portal 321";
            select.appendChild(option);
            select.value = "321";
        });
        const downloadStarted = page.waitForEvent("download");
        await page.locator("#review-export-llm").click();
        const download = await downloadStarted;
        assert.equal(download.suggestedFilename(), "TIA_Portal_Entire_Project_LLM_Review.zip");
        const bytes = fs.readFileSync(await download.path());
        assert.equal(bytes.subarray(0,2).toString(), "PK");
        assert.match(await page.locator("#review-export-llm-status").innerText(), /Exported open TIA Portal project/);
        console.log("PLC review UI: TIA analysis + whole-project export; manual Analyze Files removed: PASS");
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode=1; });
