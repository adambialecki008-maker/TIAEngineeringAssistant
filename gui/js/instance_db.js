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

function memberType(member) {
    if (String(member.data_type || "").toLocaleLowerCase() !== "array") return member.data_type || "—";
    return "Array[" + member.array_lower_bound + ".." + member.array_upper_bound + "] of "
        + (member.array_element_type || "—");
}

function matchingVerifiedOwner(db) {
    if (db.relationship_status !== "reported_by_openness" || !db.function_block) return null;
    return projectConfig.fbs.find(fb => String(fb.name || "").toLocaleLowerCase()
        === String(db.function_block).toLocaleLowerCase()
        && fb.source_mode === "tia_read_only" && fb.interface_verified !== false
        && Number.isInteger(fb.number) && fb.number === db.instance_of_number) || null;
}

function staticPreview(owner) {
    const details = document.createElement("details");
    details.className = "instance-db-preview";
    const summary = document.createElement("summary");
    summary.textContent = "Static declarations from verified " + owner.name + " (read-only)";
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Derived from the locally loaded, verified FB interface. This is not a new Instance DB declaration or a TIA write.";
    const wrapper = document.createElement("div");
    wrapper.className = "table-wrapper";
    const table = document.createElement("table");
    table.className = "management-table instance-db-preview-table";
    table.innerHTML = "<thead><tr><th>Declaration</th><th>Data type</th><th>Comment</th></tr></thead>";
    const body = document.createElement("tbody");
    const appendMembers = (members, parent = "") => (members || []).forEach(member => {
        const path = parent ? parent + "." + member.name : member.name;
        const row = document.createElement("tr");
        for (const value of [path, memberType(member), member.comment || "—"]) {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        }
        body.appendChild(row);
        if (member.struct_members) appendMembers(member.struct_members, path);
        if (member.system_instance && member.system_preview) {
            for (const child of member.system_preview) {
                const nativeRow = document.createElement("tr");
                nativeRow.className = "native-instance-member";
                for (const value of [child.path, child.data_type || "—", child.comment || "—"]) {
                    const cell = document.createElement("td");
                    cell.textContent = value;
                    nativeRow.appendChild(cell);
                }
                body.appendChild(nativeRow);
            }
        }
    });
    appendMembers(owner.static?.members);
    if (!body.children.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 3;
        cell.textContent = "The verified FB snapshot has no Static declarations.";
        row.appendChild(cell);
        body.appendChild(row);
    }
    table.appendChild(body);
    wrapper.append(table);
    details.append(summary, hint, wrapper);
    return details;
}

export function renderInstanceDbSnapshots(host) {
    host.replaceChildren();
    if (!projectConfig.instance_dbs.length) {
        host.textContent = "No Instance DB inventory loaded.";
        return;
    }
    for (const db of projectConfig.instance_dbs) {
        const onlyInstance = projectConfig.instance_dbs.length === 1;
        const row = document.createElement(onlyInstance ? "section" : "details");
        const summary = document.createElement(onlyInstance ? "h4" : "summary");
        if (onlyInstance) {
            row.className = "single-engineering-item";
            summary.className = "single-engineering-item-title";
        }
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
        const owner = matchingVerifiedOwner(db);
        if (owner) row.appendChild(staticPreview(owner));
        else if (db.relationship_status === "reported_by_openness") {
            const unavailable = document.createElement("p");
            unavailable.className = "hint";
            unavailable.textContent = "No matching verified FB snapshot is loaded locally, so no Instance DB structure is inferred.";
            row.appendChild(unavailable);
        }
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
