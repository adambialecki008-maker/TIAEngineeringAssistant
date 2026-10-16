"use strict";
const assert = require("node:assert/strict");

(async () => {
    const {getJsonWithTimeout} = await import("../gui/js/api.js");
    const previousFetch = globalThis.fetch;
    try {
        let aborted = false;
        globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => {
                aborted = true;
                const error = new Error("The operation was aborted");
                error.name = "AbortError";
                reject(error);
            }, {once:true});
        });
        await assert.rejects(getJsonWithTimeout("/api/v1/tia/project-context?process_id=55224", 20),
            /TIA project discovery timed out after 1 seconds/);
        assert.equal(aborted, true, "AbortController must cancel hanging fetch");
        globalThis.fetch = async () => ({
            ok: true, status: 200,
            json: async () => ({project_name:"Plant_Main",plcs:[{plc_name:"PLC_1"}]})
        });
        const result = await getJsonWithTimeout("/api/v1/tia/project-context?process_id=55224", 20);
        assert.equal(result.project_name, "Plant_Main");
        console.log("Project-context fetch timeout and successful response: PASS");
    } finally {
        globalThis.fetch = previousFetch;
    }
})().catch(error => {console.error(error); process.exitCode=1;});
