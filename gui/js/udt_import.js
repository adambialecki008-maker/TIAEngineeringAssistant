import { projectConfig, saveProjectConfig } from "./state.js";
import { getJson, postJson } from "./api.js";
import { convertTiaUdtDetail } from "./udt_import_converter.js";

export function initUdtTiaImportUi(renderAll) {
    const scan = document.getElementById("tia-udt-scan");
    const select = document.getElementById("tia-udt-select");
    const load = document.getElementById("tia-udt-load");
    const status = document.getElementById("tia-udt-import-status");
    if (!scan || !select || !load || !status) return;
    let available = [], scannedTarget = null, busy = false;
    function report(message, error=false) {
        status.textContent=message;
        status.classList.toggle("error",error);
        status.classList.toggle("success",!error);
    }
    function activeTarget() {
        const process=Number(document.getElementById("tia-process")?.value);
        const target=projectConfig.tia_target;
        if (!Number.isInteger(process)||process<1||!target?.device_name
            ||!target?.plc_name) throw Error("Select a TIA process and Active PLC first.");
        return {
            process_id:String(process), device_name:target.device_name,
            plc_name:target.plc_name,
        };
    }
    const identity=t=>JSON.stringify(t);
    function query(target,extra={}) {
        return new URLSearchParams({...target,...extra}).toString();
    }
    scan.addEventListener("click", async()=>{
        if(busy)return;
        busy=true;scan.disabled=true;load.disabled=true;
        available=[];scannedTarget=null;select.replaceChildren();
        try {
            const target=activeTarget();
            const data=await getJson("/api/v1/tia/plc-structures?"+query(target));
            if(identity(target)!==identity(activeTarget()))
                throw Error("Active PLC changed during scan. Scan again.");
            available=(data.udts||[]).filter(u=>u.name&&u.is_consistent===true);
            scannedTarget=target;
            for(let n=0;n<available.length;n++){
                const opt=document.createElement("option");
                opt.value=String(n);
                opt.textContent=available[n].name+" ["+(available[n].group_path||"root")+"]";
                select.appendChild(opt);
            }
            load.disabled=available.length===0;
            report(available.length+" consistent TIA UDT(s) available for read-only import.");
        }catch(e){report(e.message,true)}
        finally{busy=false;scan.disabled=false}
    });
    load.addEventListener("click",async()=>{
        if(busy||!scannedTarget)return;
        busy=true;load.disabled=true;
        try{
            const active=activeTarget();
            if(identity(scannedTarget)!==identity(active))
                throw Error("Active PLC changed. Scan UDTs again.");
            if(!projectConfig.plc_family)
                throw Error("Select the matching PLC family before importing UDTs.");
            const selected=available[Number(select.value)];
            if(!selected) throw Error("Select a TIA UDT.");
            const data=await getJson("/api/v1/tia/plc-structure?"+query(active,{
                kind:"udt",group_path:selected.group_path||"",name:selected.name,
            }));
            if(identity(scannedTarget)!==identity(activeTarget()))
                throw Error("Active PLC changed during export. Nothing imported.");
            if(data.name!==selected.name || data.group_path!==(selected.group_path||""))
                throw Error("Exported UDT identity changed. Nothing imported.");
            const result=convertTiaUdtDetail(data);
            if(projectConfig.udts.some(u=>u.name.toLowerCase()===result.name.toLowerCase()))
                throw Error(result.name+" already exists in your local editor. "
                    +"Rename/remove the local copy before importing; it was not overwritten.");
            // Full Pydantic validation including unsupported Start values.
            await postJson("/api/v1/udt-specifications",result);
            projectConfig.udts.push({...result,tia_source:{
                ...active,group_path:selected.group_path||"",name:selected.name,
            }});
            saveProjectConfig();
            renderAll();
            report(result.name+" imported into the local editor ("+result.fields.length
                +" top-level fields). TIA was NOT changed. "
                +"Use a new UDT name and the create-only preflight to publish changes.");
        }catch(e){report(e.message,true)}
        finally{busy=false;load.disabled=false}
    });
}
