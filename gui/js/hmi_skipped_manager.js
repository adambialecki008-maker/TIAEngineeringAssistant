/** Review and recover skipped HMI labels without replaying the batch.
 * Uses only verified backend endpoints. Nothing imports without confirmation.
 */
export function createHmiSkippedManager({
    openButton, panel, status, list, getJson, postJson, getModel,
    onJobUpdate,
}) {
    let activeJobId = null;

    function notify(message, error = false) {
        if (!status) return;
        status.textContent = message;
        status.classList.toggle("error", error);
        status.classList.toggle("success", !error);
    }

    function reset() {
        activeJobId = null;
        panel?.classList.add("hidden");
        list?.replaceChildren();
        if (openButton) {
            openButton.disabled = true;
            openButton.textContent = "Skipped translations (0)";
        }
    }

    function updateJob(job) {
        if (!openButton || !job) return;
        if (activeJobId !== job.job_id) {
            activeJobId = job.job_id;
            panel?.classList.add("hidden");
            list?.replaceChildren();
        }
        const total = job.skipped_total ?? job.skipped_unique ?? 0;
        openButton.disabled = !total;
        openButton.textContent = "Skipped translations ("
            + (job.skipped_unique ?? 0) + " pending / " + total + " total)";
    }

    function actionButton(label, primary = false) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        if (primary) button.className = "primary-button";
        return button;
    }

    async function load() {
        const jobId = activeJobId;
        if (!jobId || !list) return;
        const data = await getJson(
            "/api/v1/tia/hmis/batch-translations/" + jobId + "/skipped"
        );
        if (activeJobId !== jobId) return;
        list.replaceChildren();
        const remaining = data.items.filter(item => !item.resolved).length;
        notify(data.items.length + " skipped historically; " + remaining
            + " pending. " + (data.status === "completed"
                ? "Review a proposal, then approve its import."
                : "Finish the original batch before recovering skipped texts."));

        for (const item of data.items) {
            const card = document.createElement("article");
            card.className = "hmi-skipped-item";
            const heading = document.createElement("h5");
            heading.textContent = "Text #" + (item.offset + 1)
                + (item.resolved ? " — Verified (" + item.verified_rows
                    + " TIA rows)" : " — Pending");
            const sourceLabel = document.createElement("strong");
            sourceLabel.textContent = "Source";
            const source = document.createElement("pre");
            source.textContent = item.source;
            const reason = document.createElement("p");
            reason.className = "hmi-skipped-reason";
            reason.textContent = item.reason;
            card.append(heading, sourceLabel, source, reason);
            if (item.rejected_proposal) {
                const rejectedLabel = document.createElement("strong");
                rejectedLabel.textContent = "Rejected Ollama proposal";
                const rejected = document.createElement("pre");
                rejected.textContent = item.rejected_proposal;
                card.append(rejectedLabel, rejected);
            }
            if (item.resolved) {
                list.appendChild(card);
                continue;
            }
            const label = document.createElement("label");
            label.textContent = "Proposed target (editable)";
            const editor = document.createElement("textarea");
            editor.rows = 3;
            editor.value = item.source;
            label.appendChild(editor);
            const actions = document.createElement("div");
            actions.className = "action-row";
            const manual = actionButton("Prepare edit");
            const retry = actionButton("Retry Ollama");
            const approve = actionButton("Import approved", true);
            approve.disabled = true;
            const feedback = document.createElement("p");
            feedback.className = "hmi-skipped-item-status";
            feedback.setAttribute("role", "status");
            let prepared = null;
            let busy = false;
            const available = data.status === "completed";
            manual.disabled = !available;
            retry.disabled = !available;
            editor.disabled = !available;

            const setBusy = value => {
                busy = value;
                manual.disabled = value || !available;
                retry.disabled = value || !available;
                editor.disabled = value || !available;
                approve.disabled = value || !prepared
                    || editor.value !== prepared.proposal;
            };
            editor.addEventListener("input", () => {
                prepared = null;
                approve.disabled = true;
                feedback.textContent = "Changed: prepare this proposal again.";
            });

            async function prepare(mode) {
                if (busy) return;
                prepared = null;
                setBusy(true);
                feedback.textContent = "Preparing " + mode + " proposal...";
                try {
                    const result = await postJson(
                        "/api/v1/tia/hmis/batch-translations/" + jobId
                        + "/skipped/" + item.offset + "/prepare",
                        mode === "manual"
                            ? {mode, proposal: editor.value}
                            : {mode, ollama_model: getModel() || null}
                    );
                    prepared = result;
                    editor.value = result.proposal;
                    feedback.textContent = "Ready for approval: " + result.rows
                        + " HMI row(s); model " + result.model
                        + ". TIA has NOT been changed.";
                } catch (error) {
                    feedback.textContent = "Prepare failed: " + error.message;
                } finally {
                    setBusy(false);
                }
            }
            manual.addEventListener("click", () => { void prepare("manual"); });
            retry.addEventListener("click", () => { void prepare("ollama"); });

            approve.addEventListener("click", async () => {
                if (!prepared || busy || editor.value !== prepared.proposal) return;
                if (!confirm("IMPORT APPROVED HMI TRANSLATION?\n\n"
                    + "Source: " + item.source.slice(0, 250)
                    + "\nProposal: " + prepared.proposal.slice(0, 250)
                    + "\n\nOnly the selected HMI's currently missing targets "
                    + "will be imported and verified by re-export.")) return;
                setBusy(true);
                feedback.textContent = "Importing and verifying with TIA...";
                try {
                    const imported = await postJson(
                        "/api/v1/tia/hmis/batch-translations/" + jobId
                        + "/skipped/" + item.offset + "/import",
                        {review_id: prepared.review_id}
                    );
                    feedback.textContent = "Verified " + imported.verified_rows
                        + " HMI row(s).";
                    onJobUpdate(imported.job);
                    await load();
                    notify("Import verified in TIA: " + imported.verified_rows
                        + " row(s). Remaining skips: "
                        + imported.job.skipped_unique + ".");
                } catch (error) {
                    prepared = null;
                    feedback.textContent = "Import unconfirmed: " + error.message;
                    notify("Check TIA before any retry: " + error.message, true);
                } finally {
                    setBusy(false);
                }
            });
            actions.append(manual, retry, approve);
            card.append(label, actions, feedback);
            list.appendChild(card);
        }
    }

    openButton?.addEventListener("click", async () => {
        if (!panel || !activeJobId) return;
        if (!panel.classList.contains("hidden")) {
            panel.classList.add("hidden");
            return;
        }
        panel.classList.remove("hidden");
        notify("Loading skipped translations...");
        try {
            await load();
        } catch (error) {
            notify(error.message, true);
        }
    });
    return {updateJob, reset};
}
