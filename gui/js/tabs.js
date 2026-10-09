const TAB_STORAGE_KEY =
    "tiaEngineeringAssistant.activeTab";

let initialized = false;


export function initTabs() {
    if (initialized) {
        return;
    }

    const buttons =
        Array.from(
            document.querySelectorAll(
                ".tab-button"
            )
        );

    const panels =
        Array.from(
            document.querySelectorAll(
                ".tab-panel"
            )
        );

    if (
        buttons.length === 0
        ||
        panels.length === 0
    ) {
        return;
    }

    initialized = true;


    function activateTab(
        tabName
    ) {
        const validTab =
            buttons.some(
                (button) =>
                    button.dataset.tab
                    ===
                    tabName
            );

        const selectedTab =
            validTab
                ? tabName
                : "project";


        for (
            const button
            of buttons
        ) {
            const active =
                button.dataset.tab
                ===
                selectedTab;

            button.classList.toggle(
                "active",
                active
            );

            button.setAttribute(
                "aria-selected",
                active
                    ? "true"
                    : "false"
            );
        }


        for (
            const panel
            of panels
        ) {
            const active =
                panel.dataset.tabPanel
                ===
                selectedTab;

            panel.classList.toggle(
                "active",
                active
            );

            panel.hidden =
                !active;
        }


        localStorage.setItem(
            TAB_STORAGE_KEY,
            selectedTab
        );
    }


    for (
        const button
        of buttons
    ) {
        button.addEventListener(
            "click",
            () => {
                activateTab(
                    button.dataset.tab
                );
            }
        );
    }


    activateTab(
        localStorage.getItem(
            TAB_STORAGE_KEY
        )
        ||
        "project"
    );
}


function startTabs() {
    initTabs();
}


if (
    document.readyState
    ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        startTabs,
        {
            once: true,
        }
    );
} else {
    startTabs();
}
