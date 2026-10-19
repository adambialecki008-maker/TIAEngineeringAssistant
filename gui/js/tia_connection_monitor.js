// Lightweight presence check only. An existing TIA PID is not proof that
// Siemens Openness can read its project; project reads are explicit operations.
export function initTiaConnectionMonitor() {
    const select = document.getElementById("tia-process");
    const headerTia = document.getElementById("header-tia-live-status");
    const headerPlc = document.getElementById("active-plc-summary");
    const headerProfile = document.getElementById("header-profile-summary");
    const exportIndicator = document.getElementById("tia-llm-connection-status");
    if (!select || !headerTia) return;

    let checkResult = null;
    let presenceProbeError = false;
    // Ignore a stale /processes result if an Openness project read confirmed
    // this PID after that presence check was started.
    let validationRevision = 0;
    let pending = false;
    let queued = false;
    let readingProject = false;
    const pid = () => Number(select.value) || 0;
    const mark = (node, ok) => {
        if (!node) return;
        node.classList.toggle("connection-online", ok);
        node.classList.toggle("connection-offline", !ok);
        node.classList.toggle("success", ok);
        node.classList.toggle("error", !ok);
    };

    function render() {
        const current = pid();
        const projectConnected =
            headerTia.dataset.tiaProjectConnected === "true";
        // A successful project inventory already proves that this process was
        // running. Only a successful, newer *negative* process listing can
        // disprove it. A failed/timed-out status poll is not disconnection.
        const processMissing = !!current && checkResult?.pid === current
            && checkResult.running === false;
        const active = !!current && projectConnected && !processMissing;
        const text = current ? "TIA Portal PID " + current : "TIA: not connected";
        headerTia.textContent = text;
        mark(headerTia, active);
        headerTia.title = !current
            ? "No TIA Portal process selected."
            : processMissing
                ? "The selected TIA Portal PID is absent from the last successful process list."
                : !projectConnected
                    ? "Open TIA project has not yet been verified through Openness."
                    : presenceProbeError
                        ? "Project verified via Openness; the latest process status check failed. This does not prove disconnection."
                        : "Open TIA project verified through Openness.";
        if (exportIndicator) {
            exportIndicator.textContent = text;
            mark(exportIndicator, active);
        }
        // A persisted target is not evidence that the open TIA project still
        // contains it. Green means the current fast Openness inventory has
        // confirmed the same device and PLC name.
        const plcSelected = !!headerPlc?.textContent?.trim()
            && !/not selected/i.test(headerPlc.textContent);
        const activePlcVerified =
            headerPlc?.dataset.tiaTargetVerified === "true";
        mark(headerPlc, plcSelected && activePlcVerified);
        if (headerPlc) {
            headerPlc.title = !plcSelected
                ? "No PLC selected as the active engineering target."
                : activePlcVerified
                    ? "Active PLC confirmed in the current TIA project. This is not a PLC online/physical connection indicator."
                    : "Saved PLC target awaiting verification in the current TIA project.";
        }
        const profileSelected = !!headerProfile?.textContent?.trim()
            && !/not selected/i.test(headerProfile.textContent);
        mark(headerProfile, profileSelected);
    }

    async function check() {
        const current = pid();
        if (!current) {
            checkResult = null;
            presenceProbeError = false;
            render();
            return;
        }
        if (readingProject) { queued = true; return; }
        if (pending) { queued = true; return; }
        pending = true;
        queued = false;
        const startedAtRevision = validationRevision;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch("/api/v1/tia/processes", {
                cache: "no-store", signal: controller.signal,
            });
            if (!response.ok) throw Error("HTTP " + response.status);
            const processes = await response.json();
            if (!Array.isArray(processes)) throw Error("Invalid process list");
            if (pid() === current) {
                const running = processes.some(
                    item => Number(item.process_id) === current
                );
                // A negative result begun BEFORE a successful Openness
                // project read must not override that fresher confirmation.
                if (running || startedAtRevision === validationRevision) {
                    checkResult = {pid: current, running};
                }
                presenceProbeError = false;
            }
        } catch {
            // A busy Openness session, timeout, or backend error is UNKNOWN,
            // never a confirmed missing process. Preserve verified state.
            if (pid() === current) presenceProbeError = true;
        } finally {
            clearTimeout(timeout);
            pending = false;
            render();
            if (queued || (pid() && pid() !== current)) {
                queued = false;
                void check();
            }
        }
    }

    select.addEventListener("change", () => {
        checkResult = null;
        presenceProbeError = false;
        validationRevision++;
        render();
        void check();
    });
    // Refresh TIA auto-selects the sole PID programmatically without a
    // change event. Detect replacement of its options so the badge updates
    // immediately, rather than waiting for the periodic presence check.
    new MutationObserver(() => void check()).observe(select, {childList: true});
    window.addEventListener("tia-project-refresh-start", () => {
        readingProject = true;
    });
    window.addEventListener("tia-project-refresh-end", () => {
        readingProject = false;
        void check();
    });
    window.addEventListener("tia-active-plc-validation", () => {
        render();
    });
    window.addEventListener("tia-project-connection-validation", event => {
        if (event.detail?.verified === true && pid()) {
            validationRevision++;
            // The attached Openness project was actually read, so this is a
            // fresher proof of process liveness than a separate status poll.
            checkResult = {pid: pid(), running: true};
            presenceProbeError = false;
        }
        render();
    });
    // Re-style on PLC selection or project profile switches without modifying
    // either feature or creating an extra source of truth.
    for (const node of [headerPlc, headerProfile]) {
        if (node) new MutationObserver(render).observe(node, {
            childList: true, characterData: true, subtree: true,
        });
    }
    window.addEventListener("focus", () => void check());
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void check();
    });
    setInterval(() => {
        if (document.visibilityState === "visible") void check();
    }, 30000);
    render();
    void check();
}
