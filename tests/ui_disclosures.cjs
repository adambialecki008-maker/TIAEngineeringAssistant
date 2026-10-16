"use strict";

// Explicitly expand a real user-facing panel before acting on its controls.
// Do not bypass Playwright visibility or dispatch synthetic clicks to hidden UI.
async function openSection(page, id) {
    const details = page.locator('[data-ui-section="' + id + '"]');
    await details.waitFor({state:"attached"});
    if (!(await details.evaluate(element => element.open))) {
        await details.locator(":scope > summary").click();
    }
    return details;
}

module.exports = {openSection};
