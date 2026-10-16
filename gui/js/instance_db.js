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
        detail.textContent = db.is_consistent
            ? "TIA Instance DB snapshot. Owning FB is Unverified: the read-only inventory does not expose a reliable association."
            : "TIA Instance DB is inconsistent. Owning FB is Unverified and no declaration draft is available.";
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
                .map(db => ({...db, source_mode: "tia_read_only", function_block: null,
                    relationship_status: "unverified", tia_source: target}));
            for (const snapshot of snapshots) await postJson("/api/v1/instance-db-snapshots", snapshot);
            if (!sameTarget(target, targetIdentity())) throw Error("Active PLC or profile changed during validation. Nothing stored.");
            projectConfig.instance_dbs = snapshots;
            saveProjectConfig();
            renderAll();
            status.textContent = snapshots.length + " Instance DB snapshot(s) loaded. FB associations remain Unverified until TIA exports verified link metadata.";
            status.classList.remove("error"); status.classList.add("success");
        } catch (error) {
            status.textContent = error.message;
            status.classList.add("error"); status.classList.remove("success");
        } finally { scan.disabled = false; }
    });
}
