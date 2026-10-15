// Presentation-only diagnostics for PLC structure preflight.
// The raw Openness error is preserved; no changes to the plan or safety status.
const TYPE_LABELS = {
    hmi_visible: "Widoczność w HMI",
    hmi_accessible: "Dostęp z HMI",
    hmi_writable: "Zapis z HMI",
};

function subject(item) {
    return (item.kind === "udt" ? "UDT" : "DB")
        + " „" + String(item.name || "?") + "”";
}

function metadataIssues(reason) {
    const issues = [];
    for (const part of reason.split(/;\s+/)) {
        const match = part.match(/^([\w.]+):\s*(.+)$/);
        if (!match) continue;
        const [, path, detail] = match;
        const field = path + ": ";
        if (detail.startsWith("comment differs")) {
            issues.push(field + "komentarz różni się między aplikacją i TIA"
                + (detail.match(/\(([^)]*)\)/)?.[0] || ""));
        } else if (detail.startsWith("start_value differs")) {
            issues.push(field + "inna wartość początkowa (Start value)"
                + (detail.match(/\(([^)]*)\)/)?.[0] || ""));
        } else if (detail.startsWith("start_value not exported")) {
            issues.push(field + "TIA nie wyeksportował wartości początkowej");
        } else if (detail.startsWith("start_value cannot be compared")
            || detail.startsWith("exported start_value cannot be matched")) {
            issues.push(field + "wartości początkowej nie można wiarygodnie porównać");
        } else {
            const key = Object.keys(TYPE_LABELS)
                .find(name => detail.startsWith(name));
            if (key) {
                const message = detail.includes(" differs")
                    ? "różne ustawienia" : detail.includes("not explicitly exported")
                        ? "brak jednoznacznego atrybutu w eksporcie"
                        : detail.includes("unreadable")
                            ? "nieczytelna wartość z TIA"
                            : "brak danych do porównania";
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
                problem: "Nie można zweryfikować " + what
                    + " — TIA odrzucił eksport XML.",
                cause: "TIA Openness zgłasza niespójność bloku lub typu danych "
                    + "PLC (UDT). Nie oznacza to automatycznie błędu kompilacji. "
                    + "Bez eksportu XML preflight nie może wskazać, czy różnią się "
                    + "deklaracje, wartości czy atrybuty HMI.",
                checklist: true,
                issueLines: [
                    "Deklaracje DB i powiązanego UDT (także pól zagnieżdżonych).",
                    "Visible in HMI.",
                    "Accessible from HMI/OPC UA.",
                    "Writable from HMI/OPC UA.",
                    "Retain i Start values.",
                ],
                action: "Porównaj powyższe ustawienia tych samych pól w aplikacji "
                    + "i TIA Portal. W edytorze aplikacji 'TIA default' oznacza "
                    + "brak jawnego ustawienia, a nie automatycznie FALSE. "
                    + "Jeśli ustawienia są zgodne, sprawdź diagnostykę spójności "
                    + "DB i referencyjnych UDT w TIA i ponów Check target. "
                    + "Żaden istniejący obiekt nie zostanie nadpisany.",
            };
        }
        return {...common,
            problem: "Nie udało się odczytać " + what + " z TIA.",
            cause: "TIA Openness odrzucił eksport istniejącej struktury. "
                + "Szczegółowy kod błędu znajduje się w danych technicznych; "
                + "zgodność nie została sprawdzona.",
            action: "Sprawdź stan obiektu, diagnostykę i kompilację w TIA, "
                + "a następnie uruchom Check target ponownie.",
        };
    }

    if (item.status === "unknown" && /Remanence=Retain/i.test(rawReason)) {
        return {...common,
            problem: "Nie można potwierdzić RETAIN dla " + what + ".",
            cause: "Eksport XML nie potwierdza jednoznacznie retencji "
                + "wymaganych pól, choć ich struktura pasuje.",
            action: "Sprawdź ustawienia Retain w TIA oraz odczyt XML. "
                + "Ponów Check target; brak potwierdzenia nie oznacza, "
                + "że RETAIN jest wyłączone.",
        };
    }

    if (/DB retention mismatch/i.test(rawReason)) {
        return {...common,
            problem: "Różne ustawienia RETAIN dla " + what + ".",
            cause: "TIA i konfiguracja aplikacji zgłaszają różne "
                + "ustawienia retencji. Konkretne pola są opisane w danych technicznych.",
            action: "Porównaj Retain pól DB w TIA z konfiguracją aplikacji. "
                + "Istniejący DB nie zostanie nadpisany.",
        };
    }

    if (/Dependency unavailable or mismatched/i.test(rawReason)) {
        const named = rawReason.match(/Dependency unavailable or mismatched:\s*([^;(]+)/i);
        return {...common,
            problem: "Zależność " + what + " blokuje sprawdzenie lub import.",
            cause: named
                ? "Niedostępna lub niezgodna zależność: " + named[1].trim() + "."
                : "Brak wymaganej lub zgodnej zależności UDT.",
            action: "Sprawdź wymieniony UDT i jego kompilację w TIA. "
                + "Ponów preflight po usunięciu problemu.",
        };
    }

    const issues = metadataIssues(rawReason);
    if (issues.length) {
        const different = item.status === "conflict";
        return {...common, issueLines: issues,
            problem: (different ? "Wykryto różnice w " : "Nie można zweryfikować ")
                + what + ".",
            cause: different
                ? "Deklaracje lub metadane różnią się między konfiguracją "
                    + "a odczytem TIA. Wykryte pola:"
                : "TIA nie udostępniło kompletnych danych dla wskazanych pól:",
            action: different
                ? "Porównaj wymienione pola w aplikacji i TIA. "
                    + "Preflight nie nadpisuje istniejących obiektów."
                : "Sprawdź te właściwości w TIA. Bez potwierdzenia "
                    + "zgodności obiekt pozostaje niezweryfikowany.",
        };
    }

    if (item.status === "identical") {
        return {...common, problem: what + " jest zgodny.",
            cause: "Porównanie potwierdziło zgodność dostępnych "
                + "wymaganych deklaracji i atrybutów.",
            action: "Nie trzeba nic importować — istniejący obiekt zostanie pominięty."};
    }
    if (item.status === "compatible") {
        return {...common, problem: what + " może zostać użyty ponownie.",
            cause: "Istniejący UDT ma zgodną strukturę; "
                + "pozostałe ustawienia i wartości pozostają bez zmian.",
            action: "Nie twórz ponownie typu. "
                + (warnings.length ? "Ostrzeżenia metadanych są w danych technicznych."
                    : "Preflight wykorzysta istniejący typ.")};
    }
    if (item.status === "create") {
        return {...common, problem: what + " nie istnieje w docelowym PLC.",
            cause: "Obiekt jest kandydatem do utworzenia — nie wykryto kolizji.",
            action: "Sprawdź podgląd i zatwierdź import na kopii projektu TIA."};
    }
    if (item.status === "imported") {
        return {...common, problem: what + " utworzono w TIA.",
            cause: "Importer zgłosił zakończenie bieżącej operacji.",
            action: "Sprawdź obiekt i wynik kompilacji w TIA."};
    }
    if (/not confirmed as a global data block/i.test(rawReason)) {
        return {...common, problem: what + " nie jest potwierdzonym globalnym DB.",
            cause: "Obiekt może być instancyjnym DB; nie można bezpiecznie "
                + "uznać go za równoważny.",
            action: "Sprawdź typ DB w TIA. Istniejący blok nie zostanie nadpisany."};
    }
    if (/^Member /i.test(rawReason)) {
        const m = rawReason.match(/^Member\s+([^:]+):\s*(.*?)(?:\. No existing|$)/s);
        return {...common, problem: "Niezgodna struktura " + what + ".",
            cause: m ? "Pole „" + m[1] + "”: " + m[2].split("\n")[0].slice(0,220)
                : "Lista pól, typy lub ich kolejność różnią się.",
            action: "Porównaj deklaracje pól w TIA i w aplikacji. "
                + "Żaden istniejący blok nie zostanie nadpisany."};
    }
    return {...common,
        problem: item.status === "conflict"
            ? "Wystąpił konflikt dla " + what + "."
            : item.status === "unknown"
                ? "Nie udało się potwierdzić zgodności " + what + "."
                : item.status === "blocked"
                    ? "Sprawdzenie " + what + " jest zablokowane."
                    : "Wynik porównania " + what + ".",
        cause: "Preflight zgłosił: " + (item.status || "brak statusu")
            + ". Oryginalne uzasadnienie znajduje się w danych technicznych.",
        action: "Rozwiń szczegóły techniczne i sprawdź wskazaną "
            + "przyczynę w TIA przed ponowieniem preflight.",
    };
}
