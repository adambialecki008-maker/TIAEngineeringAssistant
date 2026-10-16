import {projectConfig, saveProjectConfig, getActiveProjectProfileId} from "./state.js";
import {getJson, postJson} from "./api.js";
import {convertTiaFbDetail} from "./fb_import_converter.js";

function targetIdentity() {
    const processId = Number(document.getElementById("tia-process")?.value);
    const target = projectConfig.tia_target;
    if (!Number.isInteger(processId) || processId < 1 || !target?.device_name || !target?.plc_name)
        throw Error("Select a TIA process and Active PLC first.");
    return {process_id:String(processId), device_name:target.device_name,
        plc_name:target.plc_name, profile_id:getActiveProjectProfileId()};
}
const sameTarget = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const query = (target, extra = {}) => new URLSearchParams({...target, ...extra}).toString();

export function initFbTiaImportUi(renderAll) {
    const scan = document.getElementById("tia-fb-scan");
    const select = document.getElementById("tia-fb-select");
    const load = document.getElementById("tia-fb-load");
    const status = document.getElementById("tia-fb-import-status");
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
            const inventory = await getJson("/api/v1/tia/plc-program-blocks?" + query(target, {program_only:"true"}));
            if (!sameTarget(target, targetIdentity())) throw Error("Active PLC or local project profile changed during scan. Scan FBs again.");
            available = inventory.filter(block => String(block.kind || "").toUpperCase() === "FB"
                && block.name && block.is_consistent === true
                && ["SCL", "LAD", "KOP"].includes(String(block.programming_language || "").toUpperCase()));
            scannedTarget = target;
            available.forEach((block, index) => select.append(new Option(
                block.name + " [" + (block.group_path || "root") + "]", String(index))));
            load.disabled = available.length === 0;
            report(available.length + " consistent SCL/LAD/KOP Function Block(s) available for import. LAD/KOP logic is retained read-only.");
        } catch (error) { report(error.message, true); }
        finally { busy = false; scan.disabled = false; }
    });
    load.addEventListener("click", async () => {
        if (busy || !scannedTarget) return;
        busy = true; load.disabled = true;
        try {
            const active = targetIdentity();
            if (!sameTarget(scannedTarget, active)) throw Error("Active PLC or local project profile changed. Scan FBs again.");
            const selected = available[Number(select.value)];
            if (!selected) throw Error("Select a TIA Function Block.");
            if (projectConfig.fbs.some(fb => fb.name.toLocaleLowerCase() === selected.name.toLocaleLowerCase()))
                throw Error(selected.name + " already exists in the local editor. Nothing was overwritten.");
            const detail = await getJson("/api/v1/tia/plc-program-block?" + query(active, {
                group_path:selected.group_path || "", name:selected.name, include_source:"true",
            }));
            if (!sameTarget(scannedTarget, targetIdentity())) throw Error("Active PLC or local project profile changed during export. Nothing imported.");
            if (String(detail.kind || "").toUpperCase() !== "FB" || detail.name !== selected.name
                || detail.group_path !== (selected.group_path || ""))
                throw Error("Exported FB identity changed. Nothing imported.");
            const fb = convertTiaFbDetail(detail);
            await postJson("/api/v1/function-block-specifications", fb);
            if (!sameTarget(scannedTarget, targetIdentity())) throw Error("Active PLC or local project profile changed during validation. Nothing imported.");
            if (projectConfig.fbs.some(item => item.name.toLocaleLowerCase() === fb.name.toLocaleLowerCase()))
                throw Error(fb.name + " was added locally while TIA was read. Nothing was overwritten.");
            projectConfig.fbs.push({...fb, tia_source:{...active, group_path:selected.group_path || "", name:selected.name}});
            try { saveProjectConfig(); }
            catch (error) { projectConfig.fbs.pop(); throw error; }
            renderAll();
            const count = Object.values(fb).filter(section => section?.members).reduce((sum, section) => sum + section.members.length, 0);
            report(fb.name + " imported into the local editor (" + count + " declared members; "
                + (fb.interface_verified ? "interface verified" : "interface Unverified")
                + "). TIA Portal was NOT modified.");
        } catch (error) { report(error.message, true); }
        finally { busy = false; load.disabled = available.length === 0; }
    });
}
