import {projectConfig, saveProjectConfig} from "./state.js";
import {createButton} from "./ui.js";
import {createMemberTree} from "./member-editor.js";
import {getSystemInstanceTypes} from "./plc-types.js";

const SECTIONS = ["Input", "Output", "InOut", "Static", "Temp", "Constant"];

export function addFunctionBlock(input, refresh) {
    const name = input.value.trim();
    if (!name) return alert("FB name is required.");
    if (projectConfig.fbs.some(fb => fb.name.toLowerCase() === name.toLowerCase())) return alert("FB name must be unique.");
    projectConfig.fbs.push({name, language:"SCL", input:{members:[]}, output:{members:[]}, inout:{members:[]}, static:{members:[]}, temp:{members:[]}, constant:{members:[]}});
    saveProjectConfig(); input.value=""; refresh();
}

export function renderFunctionBlocks(host, refresh) {
    host.replaceChildren();
    for (const fb of projectConfig.fbs) {
        const card=document.createElement("article"); card.className="card";
        const title=document.createElement("h3"); title.textContent=fb.name + " (SCL)"; card.appendChild(title);
        for (const section of SECTIONS) {
            const key=section.toLowerCase(); fb[key] ??= {members:[]};
            const details=document.createElement("details");
            const summary=document.createElement("summary"); summary.textContent=section + " (" + fb[key].members.length + ")"; details.appendChild(summary);
            details.appendChild(createMemberTree({prefix:"fb-"+fb.name+"-"+key,members:fb[key].members,isDb:false,allowSystemInstances:section === "Static",onChange:next=>{fb[key].members=next;saveProjectConfig();refresh();return true;}}));
            if (section === "Static") {
                const system = document.createElement("select");
                system.append(new Option("Add system instance…", ""));
                for (const type of getSystemInstanceTypes(projectConfig.plc_family))
                    system.append(new Option(type.name, type.name));
                const add = createButton("Add IEC instance", () => {
                    const type = system.value; if (!type) return;
                    const base = type.replace(/[^A-Za-z0-9]/g, "_");
                    let name = base, index = 2;
                    while (fb.static.members.some(member => member.name.toLowerCase() === name.toLowerCase())) name = base + "_" + index++;
                    fb.static.members.push({name, data_type:type, system_instance:true, comment:null});
                    saveProjectConfig(); refresh();
                });
                details.append(system, add);
            }
            card.appendChild(details);
        }
        card.appendChild(createButton("Delete FB",()=>{if(confirm('Delete FB "'+fb.name+'"?')){projectConfig.fbs.splice(projectConfig.fbs.indexOf(fb),1);saveProjectConfig();refresh();}}));
        host.appendChild(card);
    }
}
