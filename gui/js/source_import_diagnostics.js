// Presentation-only diagnostics for PLC structure preflight.
// The raw Openness error is preserved; no changes to the plan or safety status.
const TYPE_LABELS = {
    hmi_visible: "Visible in HMI",
    hmi_accessible: "Accessible from HMI/OPC UA",
    hmi_writable: "Writable from HMI/OPC UA",
};

function subject(item) {
    return (item.kind === "udt" ? "UDT" : "DB")
        + " '" + String(item.name || "?") + "'";
}

function metadataIssues(reason) {
    const issues = [];
    for (const part of reason.split(/;\s+/)) {
        const match = part.match(/^([\w.]+):\s*(.+)$/);
        if (!match) continue;
        const [, path, detail] = match;
        const field = path + ": ";
        if (detail.startsWith("comment differs")) {
            issues.push(field + "Comment differs between the application and TIA"
                + (detail.match(/\(([^)]*)\)/)?.[0] || ""));
        } else if (detail.startsWith("start_value differs")) {
            issues.push(field + "Start value differs"
                + (detail.match(/\(([^)]*)\)/)?.[0] || ""));
        } else if (detail.startsWith("start_value not exported")) {
            issues.push(field + "TIA did not export the start value");
        } else if (detail.startsWith("start_value cannot be compared")
            || detail.startsWith("exported start_value cannot be matched")) {
            issues.push(field + "Start value cannot be reliably compared");
        } else {
            const key = Object.keys(TYPE_LABELS)
                .find(name => detail.startsWith(name));
            if (key) {
                const message = detail.includes(" differs")
                    ? "settings differ" : detail.includes("not explicitly exported")
                        ? "attribute not explicitly exported"
                        : detail.includes("unreadable")
                            ? "unreadable value from TIA"
                            : "insufficient data to compare";
                issues.push(field + TYPE_LABELS[key] + " — " + message
                    + (detail.match(/\(([^)]*)\)/)?.[0] || ""));
            }
        }
    }
    return issues;
}

export function describeSourceImport(item) {
    const what = subject(item);
    const rawReason = String(item.reason || "");
    const warnings = Array.isArray(item.metadata_warnings)
        ? item.metadata_warnings.filter(Boolean) : [];
    const technical = [rawReason, ...warnings.map(x => "Metadata: " + x)]
        .filter(Boolean).join("\n\n");
    const common = {technical, issueLines: []};

    if (/Existing structure export unavailable:/i.test(rawReason)) {
        if (/Inconsistent blocks and PLC data types \(UDT\) cannot be exported/i
            .test(rawReason)) {
            return {...common,
                problem: "Unable to verify " + what
                    + " — TIA rejected the XML export.",
                cause: "TIA Openness reports an inconsistent block or PLC data "
                    + "type (UDT). This does not necessarily indicate a compilation failure. "
                    + "Without the XML export, preflight cannot determine whether "
                    + "declarations, values or HMI attributes differ.",
                checklist: true,
                issueLines: [
                    "DB and referenced UDT declarations (including nested members).",
                    "Visible in HMI.",
                    "Accessible from HMI/OPC UA.",
                    "Writable from HMI/OPC UA.",
                    "Retain and Start values.",
                ],
                action: "Compare these settings for the corresponding members in the app "
                    + "and TIA Portal. In the application, 'TIA default' means "
                    + "unspecified, not necessarily FALSE. "
                    + "If the settings match, review consistency diagnostics for "
                    + "the DB and referenced UDTs in TIA and rerun Check target. "
                    + "No existing object will be overwritten.",
            };
        }
        return {...common,
            problem: "Unable to read " + what + " from TIA.",
            cause: "TIA Openness rejected the existing structure export. "
                + "The original error is available under Technical details; "
                + "compatibility was not verified.",
            action: "Review the object and diagnostics in TIA, "
                + "then rerun Check target.",
        };
    }

    if (item.status === "unknown" && /Remanence=Retain/i.test(rawReason)) {
        return {...common,
            problem: "RETAIN could not be verified for " + what + ".",
            cause: "The XML export does not explicitly confirm remanence "
                + "of the required members, although their structure matches.",
            action: "Review the Retain settings and XML data in TIA. "
                + "Rerun Check target; missing evidence does not mean "
                + "that RETAIN is disabled.",
        };
    }

    if (/DB retention mismatch/i.test(rawReason)) {
        return {...common,
            problem: "Different RETAIN settings for " + what + ".",
            cause: "TIA and the application configuration report different "
                + "remanence settings. Affected members are in Technical details.",
            action: "Compare the DB members' Retain settings in TIA and the application. "
                + "The existing DB will not be overwritten.",
        };
    }

    if (/Dependency unavailable or mismatched/i.test(rawReason)) {
        const named = rawReason.match(/Dependency unavailable or mismatched:\s*([^;(]+)/i);
        return {...common,
            problem: "A dependency of " + what + " prevents verification or import.",
            cause: named
                ? "Missing or incompatible dependency: " + named[1].trim() + "."
                : "A required UDT is missing or incompatible.",
            action: "Check the referenced UDT and its declarations in TIA. "
                + "Rerun preflight after fixing the problem.",
        };
    }

    const issues = metadataIssues(rawReason);
    if (issues.length) {
        const different = item.status === "conflict";
        return {...common, issueLines: issues,
            problem: (different ? "Differences detected in " : "Unable to verify ")
                + what + ".",
            cause: different
                ? "Declarations or metadata differ between the configuration "
                    + "and the TIA export. Affected members:"
                : "TIA did not provide enough data for these members:",
            action: different
                ? "Compare the listed members in the application and TIA. "
                    + "Preflight does not overwrite existing objects."
                : "Review these attributes in TIA. Without verification, "
                    + "the object remains unverified.",
        };
    }

    if (item.status === "identical") {
        return {...common, problem: what + " matches the existing object.",
            cause: "The comparison confirmed matching required "
                + "declarations and verified attributes.",
            action: "No import is needed; the existing object will be skipped."};
    }
    if (item.status === "compatible") {
        return {...common, problem: what + " can be reused.",
            cause: "The existing UDT has a compatible structure; "
                + "other attributes and values remain unchanged.",
            action: "Do not recreate the type. "
                + (warnings.length ? "Metadata warnings are in Technical details."
                    : "Preflight will reuse the existing type.")};
    }
    if (item.status === "create") {
        return {...common, problem: what + " is missing from the target PLC.",
            cause: "The object can be created; no collision was detected.",
            action: "Review the preview and approve import into a TIA project copy."};
    }
    if (item.status === "imported") {
        return {...common, problem: what + " was created in TIA.",
            cause: "The importer reported completion of the operation.",
            action: "Inspect the object and compilation result in TIA."};
    }
    if (/not confirmed as a global data block/i.test(rawReason)) {
        return {...common, problem: what + " is not confirmed to be a global DB.",
            cause: "The object may be an instance DB and cannot safely "
                + "be treated as identical.",
            action: "Check the DB type in TIA. The existing block will not be overwritten."};
    }
    if (/^Member /i.test(rawReason)) {
        const m = rawReason.match(/^Member\s+([^:]+):\s*(.*?)(?:\. No existing|$)/s);
        return {...common, problem: "Structure mismatch for " + what + ".",
            cause: m ? "Pole '" + m[1] + "': " + m[2].split("\n")[0].slice(0,220)
                : "Member names, types, or order differ.",
            action: "Compare member declarations in TIA and the application. "
                + "No existing block will be overwritten."};
    }
    return {...common,
        problem: item.status === "conflict"
            ? "Conflict detected for " + what + "."
            : item.status === "unknown"
                ? "Unable to verify compatibility of " + what + "."
                : item.status === "blocked"
                    ? "Verification of " + what + " is blocked."
                    : "Comparison result for " + what + ".",
        cause: "Preflight reported: " + (item.status || "unknown status")
            + ". The original reason is available under Technical details.",
        action: "Expand Technical details and check the indicated "
            + "cause in TIA before rerunning preflight.",
    };
}
