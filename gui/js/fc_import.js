import {projectConfig, saveProjectConfig, getActiveProjectProfileId} from "./state.js";
import {getJson, postJson} from "./api.js";
import {convertTiaFcDetail} from "./fc_import_converter.js";

function targetIdentity() {
    const processId = Number(document.getElementById("tia-process")?.value);
    const target = projectConfig.tia_target;
    if (!Number.isInteger(processId) || processId < 1 || !target?.device_name || !target?.plc_name) {
        throw Error("Select a TIA process and Active PLC first.");
    }
    return {process_id: String(processId), device_name: target.device_name,
        plc_name: target.plc_name, profile_id: getActiveProjectProfileId()};
}
const sameTarget = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const query = (target, extra = {}) => new URLSearchParams({...target, ...extra}).toString();

export function initFcTiaImportUi(renderAll) {
    const scan = document.getElementById("tia-fc-scan");
    const select = document.getElementById("tia-fc-select");
    const load = document.getElementById("tia-fc-load");
    const status = document.getElementById("tia-fc-import-status");
    if (!scan || !select || !load || !status) return;
    let available = [], scannedTarget = null, busy = false;
    const report = (message, error = false) => {
        status.textContent = message;
        status.classList.toggle("error", error);
        status.classList.toggle("success", !error);
    };
    scan.addEventListener("click", async () => {
        if (busy) return;
        busy = true; scan.disabled = true; load.disabled = true;
        available = []; scannedTarget = null; select.replaceChildren();
        try {
            const target = targetIdentity();
            const inventory = await getJson("/api/v1/tia/plc-program-blocks?" + query(target, {program_only: "true"}));
            if (!sameTarget(target, targetIdentity())) throw Error("Active PLC or local project profile changed during scan. Scan FCs again.");
            available = inventory.filter(block => String(block.kind || "").toUpperCase() === "FC"
                && block.name && block.is_consistent === true
                && ["SCL", "LAD", "KOP", "FBD"].includes(String(block.programming_language || "").toUpperCase()));
            scannedTarget = target;
            available.forEach((block, index) => select.append(new Option(
                block.name + " [" + (block.group_path || "root") + "]", String(index))));
            load.disabled = available.length === 0;
            report(available.length + " consistent SCL/LAD/FBD Function(s) available for local declaration analysis.");
        } catch (error) { report(error.message, true); }
        finally { busy = false; scan.disabled = false; }
    });
    load.addEventListener("click", async () => {
        if (busy || !scannedTarget) return;
        busy = true; load.disabled = true;
        try {
            const active = targetIdentity();
            if (!sameTarget(scannedTarget, active)) throw Error("Active PLC or local project profile changed. Scan FCs again.");
            const selected = available[Number(select.value)];
            if (!selected) throw Error("Select a TIA Function.");
            if (projectConfig.fcs.some(fc => fc.name.toLocaleLowerCase() === selected.name.toLocaleLowerCase())
                || projectConfig.fbs.some(fb => fb.name.toLocaleLowerCase() === selected.name.toLocaleLowerCase())) {
                throw Error(selected.name + " already exists in the local program-block analyzer. Nothing was overwritten.");
            }
            const detail = await getJson("/api/v1/tia/plc-program-block?" + query(active, {
                group_path: selected.group_path || "", name: selected.name, include_source: "true",
            }));
            if (!sameTarget(scannedTarget, targetIdentity())) throw Error("Active PLC or local project profile changed during export. Nothing imported.");
            if (String(detail.kind || "").toUpperCase() !== "FC" || detail.name !== selected.name
                || detail.group_path !== (selected.group_path || "")) throw Error("Exported FC identity changed. Nothing imported.");
            const fc = convertTiaFcDetail(detail);
            await postJson("/api/v1/function-specifications", fc);
            if (!sameTarget(scannedTarget, targetIdentity())) {
                throw Error("Active PLC or local project profile changed during FC validation. Nothing imported.");
            }
            if (projectConfig.fcs.some(item => item.name.toLocaleLowerCase() === fc.name.toLocaleLowerCase())
                || projectConfig.fbs.some(item => item.name.toLocaleLowerCase() === fc.name.toLocaleLowerCase())) {
                throw Error(fc.name + " was added locally while TIA was read. Nothing was overwritten.");
            }
            const originalInterface = Object.fromEntries(["input", "output", "inout", "temp", "constant"]
                .map(key => [key, structuredClone(fc[key]) ]));
            projectConfig.fcs.push({...fc, original_interface: originalInterface, declaration_draft: false,
                tia_source: {...active, group_path: selected.group_path || "", name: selected.name}});
            try { saveProjectConfig(); }
            catch (error) { projectConfig.fcs.pop(); throw error; }
            renderAll();
            report(fc.name + " loaded into the local analyzer. TIA Portal was NOT modified.");
        } catch (error) { report(error.message, true); }
        finally { busy = false; load.disabled = available.length === 0; }
    });
}
