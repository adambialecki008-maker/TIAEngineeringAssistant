"use strict";
const assert = require("node:assert/strict");
const {createHash} = require("node:crypto");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

(async () => {
    const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH});
    try {
        const page = await browser.newPage();
        await page.route("**/api/v1/code-review/analyze-files", route => route.fulfill({contentType:"application/json", body:JSON.stringify({files:[{source_file:"FB.scl",name:"FB_Test",block_type:"FUNCTION_BLOCK",language:"SCL",declarations:[],networks:["network 1"],network_details:[{number:1,language:"LAD",nodes:[{uid:"23",kind:"Part",name:"Contact",symbol:"",scope:"",template_values:{SrcType:"Bool"},connections:[{port:"out",wire_uid:"27",peers:["OpenCon"]}]}],schema_version:"v4",coverage:"supported structure",wires:[{uid:"27",endpoints:[{kind:"NameCon",uid:"23",port:"out"},{kind:"OpenCon",uid:"",port:""}]}],warnings:[],verification_status:"topology only — not logic-verified"}],calls:[{target:"FC_Calc",location:"line 10",language:"SCL",source:"SCL",instance:"",nesting_depth:1,parent_target:"FC_Parent",arguments:[{name:"Start",operator:":="}],arguments_complete:true,resolution:"loaded block"}],variable_analysis_status:"complete",variable_usage:[{name:"TempReady",section:"Temp",reads:1,writes:1,assigned_on_exit:true,analysis_status:"complete"}],dependencies:[],parsing_warnings:[],verification_status:"parsed"}],findings:[
            {source_file:"FB.scl",block:"FB_Test",language:"SCL",location:"line 3",
             severity:"error",priority:"P0",category:"Duplicate declaration",
             explanation:"Duplicate named member.",detection_method:"rule",
             verification_status:"verified",suggested_fix:"Rename one member."},
            {source_file:"FB.scl",block:"FB_Test",language:"SCL",location:"network 1",
             severity:"warning",priority:"P2",category:"Partial topology",
             explanation:"Check network graph in TIA.",detection_method:"rule",
             verification_status:"requires TIA verification",suggested_fix:"Review export."}
        ],file_warnings:[],read_only:true})}));
        // The second analyze-files action receives LAD XML snapshots rather
        // than SCL files; simulate its actual parser result in the browser.
        await page.route("**/api/v1/code-review/analyze-files", route => {
            const selected = route.request().postDataJSON();
            if (!Array.isArray(selected) || !selected.some(item =>
                String(item.name || "").startsWith("TIA snapshot/"))) {
                return route.fallback();
            }
            return route.fulfill({contentType:"application/json", body:JSON.stringify({
                files:[{source_file:"TIA snapshot/FB_FromTia.xml", name:"FB_FromTia",
                    block_type:"FB", language:"LAD", declarations:[],
                    networks:[], network_details:[], calls:[], variable_usage:[],
                    dependencies:[], parsing_warnings:[], verification_status:"parsed"}],
                findings:[], file_warnings:[], read_only:true,
            })});
        });
        await page.route("**/api/v1/code-review/export-tia-project-for-llm?process_id=321", route => {
            assert.equal(route.request().method(), "POST");
            return route.fulfill({
                status:200,
                contentType:"application/zip",
                headers:{"Content-Disposition":'attachment; filename="TIA_Portal_Entire_Project_LLM_Review.zip"'},
                body:Buffer.from("PK\x03\x04fake-zip-test"),
            });
        });
        await page.route("**/api/v1/code-review/preview-scl-change", route => {
            const body = route.request().postDataJSON();
            const source = "FUNCTION_BLOCK FB_Test\\nBEGIN\\n#Value := 1;\\nEND_FUNCTION_BLOCK\\n".replaceAll("\\n", "\n");
            const digest = createHash("sha256").update(source, "utf8").digest("hex");
            assert.equal(body.file.content, source);
            assert.equal(body.expected_sha256, digest);
            assert.equal(body.start_line, 3);
            assert.equal(body.end_line, 3);
            assert.equal(body.expected_original, "#Value := 1;\n");
            assert.equal(body.replacement_text, "#Value := 2;");
            const modified = source.replace("#Value := 1;", "#Value := 2;");
            return route.fulfill({contentType:"application/json", body:JSON.stringify({
                source_file:"FB.scl",
                original_sha256:digest,
                modified_sha256:createHash("sha256").update(modified).digest("hex"),
                output_filename:"FB.reviewed.scl",
                start_line:3,end_line:3,
                unified_diff:"--- a/FB.scl\n+++ b/FB.scl\n@@ -1,4 +1,4 @@\n-#Value := 1;\n+#Value := 2;\n",
                proposed_content:modified,
                preview_only:true,
                requires_explicit_approval:true,
                validation_status:"uncompiled; requires TIA validation",
                validation_warnings:["Compile in TIA before use."],
            })});
        });
        await page.addInitScript(() => localStorage.setItem("tiaEngineeringAssistant.projectConfig", JSON.stringify({
            plc_family:"", udts:[], dbs:[], fcs:[], instance_dbs:[], device_config:{templates:[],groups:[],mappings:[],mapping_mode:"device"}, tia_target:null,
            fbs:[{name:"FB_FromTia", language:"LAD", source_mode:"tia_read_only", source_xml:"<SW.Blocks.FB Name=\"FB_FromTia\"><CompileUnit/></SW.Blocks.FB>", interface_verified:true}],
        })));
        await page.goto(process.env.APP_URL || "http://127.0.0.1:8765/");
        await page.locator('[data-tab="review"]').click();
        assert.equal(await page.locator("#review-files").isVisible(), true);
        assert.equal(await page.locator("#review-ai").count(), 0, "Local AI must be removed");
        assert.equal(await page.locator("#review-export-llm").isVisible(), true);
        await page.locator("#review-files").setInputFiles({name:"FB.scl", mimeType:"text/plain", buffer:Buffer.from("FUNCTION_BLOCK FB_Test\nBEGIN\n#Value := 1;\nEND_FUNCTION_BLOCK\n")});
        await page.locator("#review-analyze").click();
        await page.waitForSelector("text=Read-only deterministic analysis complete");
        assert.equal(await page.locator("#review-ai").count(), 0);
        assert.equal(await page.locator("#review-ai-block").count(), 0);
        assert.match(await page.locator("#review-results .review-project-summary").innerText(), /Project overview/);
        assert.match(await page.locator("#review-results .review-project-summary").innerText(), /P0: 1/);
        assert.match(await page.locator("#review-results .review-project-summary").innerText(), /P2: 1/);
        assert.equal(await page.locator("#review-results .review-findings-list .review-finding-row").count(), 2);
        assert.equal(await page.locator("#review-results .review-finding-row").first().getAttribute("data-priority"), "P0");
        await page.locator("#review-filter-priority").selectOption("P2");
        assert.equal(await page.locator("#review-results .review-finding-row").count(), 1);
        assert.match(await page.locator("#review-results .review-visible-count").innerText(), /Showing 1 of 2/);
        await page.locator("#review-filter-query").fill("graph");
        assert.equal(await page.locator("#review-results .review-finding-row").count(), 1);
        await page.locator("#review-filter-query").fill("this-term-is-absent");
        assert.equal(await page.locator("#review-results .review-finding-row").count(), 0);
        assert.match(await page.locator("#review-results .review-findings-list").innerText(), /No findings match/);
        await page.locator(".review-filter-controls button").click();
        assert.equal(await page.locator("#review-results .review-finding-row").count(), 2);
        await page.locator("#review-results .review-block-details > summary").click();
        await page.locator("#review-results .review-block-details > details").first()
            .locator(":scope > summary").click();
        const topology = page.locator("#review-results .review-network-topology");
        assert.equal(await topology.count(), 1);
        assert.match(await topology.innerText(), /Network 1/);
        assert.match(await topology.innerText(), /Contact/);
        assert.match(await topology.innerText(), /SrcType=Bool/);
        assert.match(await topology.innerText(), /FlgNet v4/);
        assert.match(await page.locator("#review-results .review-block-calls").innerText(), /FC_Calc/);
        assert.match(await page.locator("#review-results .review-block-calls").innerText(), /FC_Parent/);
        assert.match(await page.locator("#review-results .review-block-calls").innerText(), /Parsed named bindings/);
        assert.match(await page.locator("#review-results .review-call-arguments").innerText(), /Start :=/);
        assert.match(await page.locator("#review-results .review-variable-usage").innerText(), /TempReady/);
        assert.match(await page.locator("#review-results .review-variable-usage").innerText(), /Flow coverage: complete/);
        assert.match(await topology.innerText(), /NameCon 23.out ; OpenCon/);
        const markdownTopology = page.waitForEvent("download");
        await page.locator("#review-download-markdown").click();
        const topologyDownload = await markdownTopology;
        const topologyText = require("node:fs").readFileSync(await topologyDownload.path(), "utf-8");
        assert.match(topologyText, /LAD\/FBD network topology/);
        assert.match(topologyText, /Project overview/);
        assert.match(topologyText, /\[P0\] Duplicate declaration/);
        assert.match(topologyText, /\[P2\] Partial topology/);
        assert.match(topologyText, /Observed FB\/FC calls/);
        assert.match(topologyText, /FC_Calc/);
        assert.match(topologyText, /under FC_Parent/);
        assert.match(topologyText, /Parsed named bindings/);
        assert.match(topologyText, /Named bindings: Start :=/);
        assert.match(topologyText, /SCL variable and interface usage/);
        assert.match(topologyText, /TempReady/);
        assert.match(topologyText, /Wire 27: NameCon 23\.out ; OpenCon/);
        assert.match(topologyText, /Templates: SrcType=Bool/);
        await page.locator("#review-filter-priority").selectOption("P2");
        const completeExport = page.waitForEvent("download");
        await page.locator("#review-download").click();
        const jsonText = require("node:fs").readFileSync(await (await completeExport).path(), "utf-8");
        assert.equal(JSON.parse(jsonText).findings.length, 2, "Export is never filtered");
        await page.locator(".review-filter-controls button").click();
        const proposalPanel = page.locator("#review-proposal-panel");
        assert.equal(await proposalPanel.isVisible(), true);
        assert.equal(await page.locator("#review-proposal-download").isDisabled(), true);
        await page.locator(".review-finding-row").first().locator(".review-prepare-change").click();
        assert.equal(await proposalPanel.evaluate(el => el.open), true);
        assert.equal(await page.locator("#review-proposal-start").inputValue(), "3");
        assert.match(await page.locator("#review-proposal-original").innerText(), /#Value := 1;/);
        await page.locator("#review-proposal-replacement").fill("#Value := 2;");
        assert.equal(await page.locator("#review-proposal-download").isDisabled(), true);
        await page.locator("#review-proposal-preview").click();
        await page.waitForSelector("text=Preview ready");
        assert.match(await page.locator("#review-proposal-diff").innerText(), /-#Value := 1;/);
        assert.match(await page.locator("#review-proposal-diff").innerText(), /\+#Value := 2;/);
        assert.equal(await page.locator("#review-proposal-download").isDisabled(), true);
        await page.locator("#review-proposal-approve").check();
        assert.equal(await page.locator("#review-proposal-download").isDisabled(), false);
        // Editing after approval invalidates the exact preview.
        await page.locator("#review-proposal-replacement").fill("#Value := 3;");
        assert.equal(await page.locator("#review-proposal-download").isDisabled(), true);
        await page.locator("#review-proposal-replacement").fill("#Value := 2;");
        await page.locator("#review-proposal-preview").click();
        await page.waitForSelector("text=Preview ready");
        await page.locator("#review-proposal-approve").check();
        const patchDownload = page.waitForEvent("download");
        await page.locator("#review-proposal-download").click();
        const patchFile = await patchDownload;
        assert.equal(patchFile.suggestedFilename(), "FB.reviewed.scl");
        const reviewedText = require("node:fs").readFileSync(await patchFile.path(), "utf-8");
        assert.match(reviewedText, /#Value := 2;/);
        assert.doesNotMatch(reviewedText, /#Value := 1;/);
        assert.equal(await page.locator("#review-proposal-download").isDisabled(), true);
        // Whole-project export must use the selected TIA process, not a cached
        // PLC profile. Explicitly select a fake attached process in this test.
        await page.locator("#tia-process").evaluate(select => {
            const option = document.createElement("option");
            option.value = "321";
            option.textContent = "TIA Portal 321";
            select.appendChild(option);
            select.value = "321";
        });
        const archivePromise = page.waitForEvent("download");
        await page.locator("#review-export-llm").click();
        const archive = await archivePromise;
        assert.equal(archive.suggestedFilename(), "TIA_Portal_Entire_Project_LLM_Review.zip");
        const archiveBytes = require("node:fs").readFileSync(await archive.path());
        assert.equal(archiveBytes.subarray(0, 2).toString(), "PK");
        assert.match(await page.locator("#review-export-llm-status").innerText(), /Exported open TIA Portal project/);
        assert.equal((await page.locator("#review-results").innerText()).includes("Review suggestion."), false);
        const markdownDownload = page.waitForEvent("download");
        await page.locator("#review-download-markdown").click();
        assert.equal((await markdownDownload).suggestedFilename(), "plc-code-review.md");
        await page.locator("#review-tia-analyze").click();
        await page.waitForSelector("text=loaded TIA snapshot(s) analyzed");
        assert.match(await page.locator("#review-status").innerText(), /loaded TIA snapshots complete/);
        assert.equal(await page.locator("#review-ai").count(), 0,
            "No local AI review action for LAD/FBD or SCL");
        assert.equal(await proposalPanel.evaluate(el => el.hidden), true,
            "TIA XML snapshots must not offer an SCL patch download");
        console.log("PLC review and LLM archive export: PASS");
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
