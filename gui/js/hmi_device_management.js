// HMI device management is kept separate from text translation.
// Whole-device copy uses the existing Classic HMI's configured PLC
// connection; no arbitrary HMI tag links or screen scaling are invented.
export function initHmiDeviceManagement({
    getHmis, getPlcs, getProcessId, postJson, refreshProject,
}) {
    const sourceSelect = document.getElementById("tia-hmi-clone-source");
    const plcSelect = document.getElementById("tia-hmi-clone-plc");
    const connectionSelect = document.getElementById("tia-hmi-clone-connection");
    const newName = document.getElementById("tia-hmi-clone-device-name");
    const newIp = document.getElementById("tia-hmi-clone-ip");
    const backup = document.getElementById("tia-hmi-clone-backup");
    const button = document.getElementById("tia-hmi-clone-button");
    const status = document.getElementById("tia-hmi-clone-status");
    const menu = document.getElementById("tia-hmi-device-menu");
    let busy = false;

    const selection = (select, values) => {
        const index = Number(select?.value);
        return select?.value !== "" && Number.isInteger(index)
            ? values[index] : null;
    };
    const source = () => selection(sourceSelect, getHmis());
    const plc = () => selection(plcSelect, getPlcs());

    function message(value, error = false) {
        if (!status) return;
        status.textContent = value;
        status.classList.toggle("error", error);
        status.classList.toggle("success", !error);
    }

    function options(select, entries, hint) {
        if (!select) return;
        const previous = select.value;
        select.replaceChildren();
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = hint;
        select.appendChild(empty);
        entries.forEach((entry, i) => {
            const option = document.createElement("option");
            option.value = String(i);
            option.textContent = entry.label;
            option.disabled = Boolean(entry.disabled);
            select.appendChild(option);
        });
        if (Array.from(select.options).some(item =>
            item.value === previous && !item.disabled))
            select.value = previous;
    }

    function sourceConnections() {
        const from = source();
        return from?.connections?.length
            ? from.connections
            : (from?.plc_connections || []).map(name => ({name}));
    }

    function updateConnectionOptions() {
        if (!connectionSelect) return;
        const previous = connectionSelect.value;
        connectionSelect.replaceChildren();
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "Select configured source PLC connection";
        connectionSelect.appendChild(empty);
        const list = sourceConnections();
        for (const connection of list) {
            const option = document.createElement("option");
            option.value = connection.name;
            option.textContent = connection.name
                + (connection.communication_driver
                    ? " | " + connection.communication_driver : "")
                + (connection.partner ? " | " + connection.partner : "");
            option.disabled = /opc[\s_-]*ua/i.test(
                connection.communication_driver || ""
            );
            connectionSelect.appendChild(option);
        }
        const selectable = Array.from(connectionSelect.options)
            .filter(option => option.value && !option.disabled);
        if (selectable.some(option => option.value === previous))
            connectionSelect.value = previous;
        else if (selectable.length === 1)
            connectionSelect.value = selectable[0].value;
    }

    function validIp(value) {
        const pieces = value.trim().split(".");
        return pieces.length === 4
            && pieces.every(p => /^\\d{1,3}$/.test(p)
                && Number(p) >= 0 && Number(p) <= 255)
            && Number(pieces[0]) >= 1 && Number(pieces[0]) < 224
            && Number(pieces[0]) !== 127;
    }

    function update() {
        const from = source();
        const targetPlc = plc();
        const name = newName?.value.trim() || "";
        const address = newIp?.value.trim() || "";
        const nameUsed = getHmis().some(item =>
            item.device_name.toLowerCase() === name.toLowerCase());
        const ipUsed = getHmis().some(item =>
            item.ip_address === address);
        const ready = from && targetPlc && connectionSelect?.value
            && from.ip_address
            && !connectionSelect.selectedOptions[0]?.disabled
            && from.software_type?.includes("Siemens.Engineering.Hmi.HmiTarget")
            && name && name.length <= 128
            && name.toLowerCase() !== from.device_name.toLowerCase()
            && !nameUsed && !ipUsed && validIp(address)
            && backup?.checked && getProcessId();
        if (button) button.disabled = busy || !ready;
    }

    function render() {
        options(sourceSelect, getHmis().map(item => ({
            label: item.device_name + " / " + item.hmi_name
                + " | IP " + (item.ip_address || "unknown")
                + " | Connections: "
                + ((item.connections?.length
                    ? item.connections.map(connection => connection.name)
                    : (item.plc_connections || [])).join(", ")
                    || "unavailable"),
        })), "Select existing HMI");
        options(plcSelect, getPlcs().map(item => ({
            label: item.plc_name + " (" + item.device_name + ")",
        })), "Select existing PLC");
        // A refreshed project may contain entirely different device indices.
        // Never carry approval or source/PLC selection across a refresh.
        if (sourceSelect) sourceSelect.value = "";
        if (plcSelect) plcSelect.value = "";
        if (backup) backup.checked = false;
        updateConnectionOptions();
        update();
    }

    function openFor(hmi) {
        if (menu) menu.open = true;
        if (sourceSelect) {
            sourceSelect.value = String(getHmis().indexOf(hmi));
        }
        const from = source();
        updateConnectionOptions();
        if (from && newName && !newName.value.trim())
            newName.value = from.device_name + "_copy";
        message(from ? "Source " + from.device_name
            + " | IP " + (from.ip_address || "unavailable")
            + ". Clone requires a configured PLC connection, backup, and matching device model."
            : "Select an HMI source.",
            !sourceConnections().length);
        update();
        menu?.scrollIntoView?.({behavior: "smooth", block: "start"});
    }

    async function clone() {
        update();
        if (busy || button?.disabled) return;
        const from = source();
        const targetPlc = plc();
        const target = newName.value.trim();
        const address = newIp.value.trim();
        const connection = connectionSelect.value;
        if (!from || !targetPlc || !confirm(
            "Clone configured HMI device into the BACKUP TIA project?\\n\\n"
            + from.device_name + " → " + target
            + "\\nIP: " + address
            + "\\nExisting PLC: " + targetPlc.plc_name
            + "\\nHMI connection: " + connection
            + "\\nSame device model/resolution; cross-size scaling is NOT enabled.\\n"
            + "No unverified tag remapping or automatic PLC creation."
        )) return;
        busy = true;
        update();
        message("Cloning device and verifying IP, PLC connection and HMI tags...");
        try {
            const result = await postJson("/api/v1/tia/hmis/clone", {
                process_id: getProcessId(),
                source_device_name: from.device_name,
                source_hmi_name: from.hmi_name,
                target_device_name: target,
                target_ip_address: address,
                plc_device_name: targetPlc.device_name,
                plc_name: targetPlc.plc_name,
                existing_connection_name: connection,
                backup_confirmed: backup.checked,
                scale_to_different_device: false,
            });
            message("Created " + result.target_device_name + " / " + result.ip_address
                + ". Verified " + result.verified_connected_tags + " connected HMI tags. "
                + "Compile HMI and verify all tag addresses and screen items in TIA.");
            backup.checked = false;
            newName.value = "";
            newIp.value = "";
            await refreshProject();
        } catch (error) {
            message("Clone rejected: " + error.message
                + ". Inspect TIA and its project library before retrying.", true);
        } finally {
            busy = false;
            update();
        }
    }

    sourceSelect?.addEventListener("change", () => {
        updateConnectionOptions();
        const from = source();
        if (from && newName && !newName.value.trim())
            newName.value = from.device_name + "_copy";
        update();
    });
    for (const field of [plcSelect, connectionSelect, backup])
        field?.addEventListener("change", update);
    for (const field of [newName, newIp])
        field?.addEventListener("input", update);
    button?.addEventListener("click", () => { void clone(); });
    render();
    return {render, openFor};
}
