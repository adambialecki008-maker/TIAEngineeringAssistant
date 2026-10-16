// Read-only process presence check; does not attach to TIA or claim a live project session.
export function initTiaConnectionMonitor() {
    const select = document.getElementById("tia-process");
    const project = document.getElementById("overview-project-name");
    const indicators = [
        document.getElementById("overview-tia-live-status"),
        document.getElementById("tia-llm-connection-status")
    ].filter(Boolean);
    if (!select || !indicators.length) return;
    let state = null;
    let pending = false;
    let generation = 0;
    const pid = () => Number(select.value) || 0;
    function render() {
        const current = pid();
        const name = project?.textContent?.trim() || "";
        const label = name && name !== "Not connected" ? name : "not read";
        let message = "Select a TIA process on Overview (Refresh TIA).";
        let error = false;
        if (current && (!state || state.pid !== current)) {
            message = "TIA PID " + current + ": checking process; project status not verified.";
        } else if (current && state?.error) {
            message = "TIA PID " + current + ": connection unknown (" + state.error + "). Last project: " + label;
            error = true;
        } else if (current && state && !state.running) {
            message = "TIA connection LOST: PID " + current + " no longer detected. Last project: " + label;
            error = true;
        } else if (current && state?.running) {
            message = "TIA PID " + current + " running (checked " + state.checked
                + "). Last read project: " + label
                + ". Process detected; project attachment is not continuously verified.";
        }
        for (const node of indicators) {
            node.textContent = message;
            node.classList.toggle("error", error);
            node.classList.toggle("success", !!current && !!state?.running && !error);
        }
    }
    async function check() {
        const current = pid();
        const ticket = ++generation;
        if (!current) { state = null; render(); return; }
        if (pending) { render(); return; }
        pending = true;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch("/api/v1/tia/processes", {
                cache: "no-store", signal: controller.signal
            });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const processes = await response.json();
            if (!Array.isArray(processes)) throw new Error("Invalid process list");
            if (ticket === generation && pid() === current) {
                state = {
                    pid: current,
                    running: processes.some(p => Number(p.process_id) === current),
                    checked: new Date().toLocaleTimeString()
                };
            }
        } catch (e) {
            if (ticket === generation && pid() === current)
                state = {pid: current, error: e.name === "AbortError" ? "timeout" : e.message};
        } finally {
            clearTimeout(timeout);
            pending = false;
            render();
        }
    }
    select.addEventListener("change", () => { state = null; render(); void check(); });
    if (project) new MutationObserver(render).observe(project, {
        childList: true, subtree: true, characterData: true
    });
    window.addEventListener("focus", () => void check());
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void check();
    });
    setInterval(() => { if (document.visibilityState === "visible") void check(); }, 15000);
    render();
    void check();
}
