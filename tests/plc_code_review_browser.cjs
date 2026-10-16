"use strict";
const assert = require("node:assert/strict");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

(async () => {
    const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH});
    try {
        const page = await browser.newPage();
        await page.route("**/api/v1/code-review/analyze-files", route => route.fulfill({contentType:"application/json", body:JSON.stringify({files:[{source_file:"FB.scl",name:"FB_Test",block_type:"FUNCTION_BLOCK",language:"SCL",declarations:[],networks:[],dependencies:[],parsing_warnings:[],verification_status:"parsed"}],findings:[],file_warnings:[],read_only:true})}));
        await page.route("**/api/v1/code-review/ollama", route => route.fulfill({contentType:"application/json", body:JSON.stringify({files:[],findings:[{source_file:"FB.scl",block:"FB_Test",language:"SCL",location:"line 1",severity:"warning",category:"Style",explanation:"Review suggestion.",suggested_fix:"",evidence:"",detection_method:"AI",verification_status:"AI suggestion — unverified",confidence:0.4}],file_warnings:[],read_only:true})}));
        await page.goto(process.env.APP_URL || "http://127.0.0.1:8765/");
        await page.locator('[data-tab="review"]').click();
        assert.equal(await page.locator("#review-files").isVisible(), true);
        assert.equal(await page.locator("#review-ai").isDisabled(), true);
        await page.locator("#review-files").setInputFiles({name:"FB.scl", mimeType:"text/plain", buffer:Buffer.from("FUNCTION_BLOCK FB_Test")});
        await page.locator("#review-analyze").click();
        await page.waitForSelector("text=Read-only deterministic analysis complete");
        assert.equal(await page.locator("#review-ai").isDisabled(), false);
        await page.locator("#review-ai").click();
        await page.waitForSelector("text=AI review complete");
        assert.equal((await page.locator("#review-results").innerText()).includes("Review suggestion."), true);
        console.log("PLC code review Analyze Files and optional local AI review: PASS");
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
