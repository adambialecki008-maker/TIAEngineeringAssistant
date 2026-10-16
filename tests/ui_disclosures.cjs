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

async function revealEngineeringItem(page, containerSelector) {
    const details = page.locator(containerSelector + " > details").first();
    if (await details.count() && !(await details.evaluate(el => el.open))) {
        await details.locator(":scope > summary").click();
    }
    return page.locator(containerSelector);
}

module.exports = {openSection, revealEngineeringItem};
