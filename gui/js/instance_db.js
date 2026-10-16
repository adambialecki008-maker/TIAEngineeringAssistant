import {projectConfig, saveProjectConfig, getActiveProjectProfileId} from "./state.js";
import {getJson, postJson} from "./api.js";

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
const query = target => new URLSearchParams(target).toString();

export function renderInstanceDbSnapshots(host) {
    host.replaceChildren();
    if (!projectConfig.instance_dbs.length) {
        host.textContent = "No Instance DB inventory loaded.";
        return;
    }
    for (const db of projectConfig.instance_dbs) {
        const row = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = db.name + (db.number == null ? "" : " — DB " + db.number)
            + " [" + (db.group_path || "root") + "]";
        const detail = document.createElement("p");
        detail.className = "hint";
        detail.textContent = !db.is_consistent
            ? "TIA Instance DB inconsistent — owner and declarations cannot be verified."
            : db.relationship_status === "reported_by_openness"
                ? "Owner reported by Siemens Openness: " + db.function_block
                    + " (FB #" + db.instance_of_number
                    + "). Read-only; real TIA V21 smoke verification pending."
                : "Owning FB Unverified — no direct owner metadata returned by Openness.";
        row.append(summary, detail);
        host.appendChild(row);
    }
}

export function initInstanceDbTiaUi(renderAll) {
    const scan = document.getElementById("tia-instance-db-scan");
    const status = document.getElementById("tia-instance-db-status");
    if (!scan || !status) return;
    scan.addEventListener("click", async () => {
        scan.disabled = true;
        try {
            const target = targetIdentity();
            const inventory = await getJson("/api/v1/tia/plc-structures?" + query(target));
            if (!sameTarget(target, targetIdentity())) throw Error("Active PLC or profile changed during Instance DB scan. Nothing stored.");
            const snapshots = (inventory.data_blocks || [])
                .filter(db => String(db.block_kind || "").toLocaleLowerCase() === "instancedb")
                .map(db => {
                    const owner = String(db.instance_of_name || "").trim();
                    const direct = db.is_consistent && owner
                        && db.instance_of_type === "FB"
                        && Number.isInteger(db.instance_of_number)
                        && db.instance_of_number >= 0;
                    // Directly reported attributes only. No name-guessing,
                    // no implicit promotion to a TIA-verified link.
                    return {
                        ...db, source_mode: "tia_read_only",
                        function_block: direct ? owner : null,
                        instance_of_type: direct ? "FB" : null,
                        instance_of_number: direct ? db.instance_of_number : null,
                        relationship_status: direct ? "reported_by_openness" : "unverified",
                        tia_source: target,
                    };
                });
            for (const snapshot of snapshots) await postJson("/api/v1/instance-db-snapshots", snapshot);
            if (!sameTarget(target, targetIdentity())) throw Error("Active PLC or profile changed during validation. Nothing stored.");
            projectConfig.instance_dbs = snapshots;
            saveProjectConfig();
            renderAll();
            const reported = snapshots.filter(db => db.relationship_status === "reported_by_openness").length;
            status.textContent = snapshots.length + " Instance DB snapshot(s) loaded. "
                + reported + " owner relation(s) reported directly by Openness; "
                + "others Unverified. No TIA writes performed.";
            status.classList.remove("error"); status.classList.add("success");
        } catch (error) {
            status.textContent = error.message;
            status.classList.add("error"); status.classList.remove("success");
        } finally { scan.disabled = false; }
    });
}
