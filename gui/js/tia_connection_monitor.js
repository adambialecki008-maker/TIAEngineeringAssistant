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
        const active = !!current && checkResult?.pid === current
            && checkResult.running === true;
        // One compact label. Color alone communicates live availability.
        // A PID can remain selected after TIA closes; such a badge stays red.
        const text = current ? "TIA Portal PID " + current : "TIA: not connected";
        headerTia.textContent = text;
        mark(headerTia, active);
        if (exportIndicator) {
            exportIndicator.textContent = text;
            mark(exportIndicator, active);
        }
        const plcSelected = !!headerPlc?.textContent?.trim()
            && !/not selected/i.test(headerPlc.textContent);
        mark(headerPlc, active && plcSelected);
        const profileSelected = !!headerProfile?.textContent?.trim()
            && !/not selected/i.test(headerProfile.textContent);
        mark(headerProfile, profileSelected);
    }

    async function check() {
        const current = pid();
        if (!current) {
            checkResult = null;
            render();
            return;
        }
        if (readingProject) { queued = true; return; }
        if (pending) { queued = true; return; }
        pending = true;
        queued = false;
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
                checkResult = {
                    pid: current,
                    running: processes.some(item => Number(item.process_id) === current),
                };
            }
        } catch {
            if (pid() === current) checkResult = {pid: current, running: false};
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
        render();
        void check();
    });
    window.addEventListener("tia-project-refresh-start", () => {
        readingProject = true;
    });
    window.addEventListener("tia-project-refresh-end", () => {
        readingProject = false;
        void check();
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
