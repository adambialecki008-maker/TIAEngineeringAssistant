// UI-only progress for sequential, read-only TIA project inventory requests.
// These are real request phases and elapsed time, NOT fabricated percentages
// or progress within a single long-running Siemens Openness adapter command.
export function initTiaProjectLoadProgress() {
    const header = document.getElementById("tia-project-load-header");
    const overview = document.getElementById("tia-project-load-overview");
    const targets = [header, overview].filter(Boolean);
    let generation = 0;
    let started = 0;
    let phase = "";
    let ticker = null;
    let dismiss = null;

    function clock() {
        const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
        const minutes = Math.floor(seconds / 60);
        return String(minutes).padStart(2, "0")
            + ":" + String(seconds % 60).padStart(2, "0");
    }

    function draw() {
        for (const node of targets) {
            const label = node.querySelector("[data-load-phase]");
            const duration = node.querySelector("[data-load-elapsed]");
            if (label) label.textContent = phase;
            if (duration) duration.textContent = clock();
        }
    }

    function stopTimers() {
        if (ticker !== null) clearInterval(ticker);
        if (dismiss !== null) clearTimeout(dismiss);
        ticker = null;
        dismiss = null;
    }

    function reset() {
        generation++;
        stopTimers();
        for (const node of targets) {
            node.hidden = true;
            node.dataset.state = "idle";
        }
    }

    function start(message) {
        generation++;
        stopTimers();
        started = Date.now();
        phase = message;
        for (const node of targets) {
            node.hidden = false;
            node.dataset.state = "running";
        }
        draw();
        ticker = setInterval(draw, 1000);
        return generation;
    }

    function update(token, message) {
        if (token !== generation) return;
        phase = message;
        draw();
    }

    function finish(token, message, isError = false) {
        if (token !== generation) return;
        stopTimers();
        phase = message;
        for (const node of targets) node.dataset.state = isError ? "error" : "done";
        draw();
        dismiss = setTimeout(() => {
            if (token === generation) reset();
        }, isError ? 15000 : 10000);
    }

    return {start, update, finish, reset};
}
