/** Hierarchy for a depth-first list of TIA-exported PLC members.
 * Rows do not need extra API calls: the exporter already supplies level/path.
 * Every group with actual children starts collapsed. Each tree is independent.
 */
export function createPlcMemberTree(members) {
    const entries = members.map(member => ({
        level: Math.max(0, Number(member.level) || 0),
        section: member.section || "",
        parent: null,
        hasChildren: false,
    }));
    const stack = [];

    for (let index = 0; index < entries.length; index += 1) {
        const current = entries[index];
        // A new section and a sibling level always terminate prior branches.
        while (stack.length) {
            const ancestor = entries[stack[stack.length - 1]];
            if (ancestor.level < current.level
                && ancestor.section === current.section) {
                break;
            }
            stack.pop();
        }
        if (stack.length) {
            current.parent = stack[stack.length - 1];
            entries[current.parent].hasChildren = true;
        }
        stack.push(index);
    }

    const collapsed = new Set();
    entries.forEach((entry, index) => {
        if (entry.hasChildren) {
            collapsed.add(index);
        }
    });

    return {
        hasChildren(index) {
            return Boolean(entries[index]?.hasChildren);
        },
        isExpanded(index) {
            return Boolean(entries[index]?.hasChildren)
                && !collapsed.has(index);
        },
        isVisible(index) {
            if (!entries[index]) {
                return false;
            }
            for (let parent = entries[index].parent;
                parent !== null; parent = entries[parent].parent) {
                if (collapsed.has(parent)) {
                    return false;
                }
            }
            return true;
        },
        toggle(index) {
            if (!entries[index]?.hasChildren) {
                return false;
            }
            if (collapsed.has(index)) {
                collapsed.delete(index);
            } else {
                collapsed.add(index);
            }
            return true;
        },
        expandAll() {
            collapsed.clear();
        },
        collapseAll() {
            entries.forEach((entry, index) => {
                if (entry.hasChildren) {
                    collapsed.add(index);
                }
            });
        },
        // Search reveals matching descendants and their ancestors WITHOUT
        // mutating user expand/collapse preferences.
        search(members, query) {
            const needle = String(query || "").trim().toLocaleLowerCase();
            if (!needle) {
                return null;
            }
            const visible = new Set();
            let matches = 0;
            entries.forEach((entry, index) => {
                const member = members[index] || {};
                if (![member.name, member.path, member.data_type,
                    member.comment, member.section].some(
                    value => String(value || "").toLocaleLowerCase().includes(needle)
                )) {
                    return;
                }
                matches += 1;
                visible.add(index);
                for (let parent = entry.parent; parent !== null;
                    parent = entries[parent].parent) {
                    visible.add(parent);
                }
            });
            return {visible, matches};
        },
    };
}
