"use strict";
// Real production queue, importers, controls and listeners; browser/network only
// are substituted. No Siemens calls, Ollama process or TIA writes.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname,"../gui/js/tia.js"),"utf8");
function extract(start,end) {
    const a=source.indexOf(start), b=source.indexOf(end,a+start.length);
    assert.ok(a>=0 && b>a,"Production boundary: "+start);
    return source.slice(a,b);
}
function fn(name) {
    const a=source.search(new RegExp("^    (?:async )?function "+name+"\\(","m"));
    assert.ok(a>=0,"Missing production function: "+name);
    const next=source.slice(a+5).search(/^    (?:async )?function /m);
    assert.ok(next>=0,"Missing function boundary: "+name);
    return source.slice(a,a+5+next);
}
class Element {
    constructor(tag="div") {
        this.tag=tag; this.children=[]; this.dataset={}; this.value="";
        this.textContent=""; this.disabled=false; this.checked=false;
        this.className=""; this.handlers={}; const classes=new Set();
        this.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),
            contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}};
    }
    append(...items){this.children.push(...items);}
    appendChild(item){this.children.push(item);return item;}
    replaceChildren(...items){this.children=items;}
    setAttribute(){} scrollIntoView(){}
    addEventListener(event,handler){this.handlers[event]=handler;}
    querySelectorAll(){return this.children.flatMap(c=>c.tag==="textarea"?[c]:c.querySelectorAll?.()||[]);}
    click(){assert.equal(this.disabled,false,"Disabled button clicked");this.handlers.click();}
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
const production=["updateHmiTranslateButtonState","syncHmiReviewPreview","hmiTranslationKey",
    "manualHmiPrepareCount","eligibleXmlEntries","nextEligibleTextList","combinedMissingCount",
    "textListBatchIdentity","textListBatchCount","nextHmiManualScope","textListReviewKey",
    "hasTextListSelection","discardHmiReview","discardHmiTextListReview","setHmiTranslationStatus",
    "startHmiRunReport","showHmiRunReport","appendHmiRunIssue","finishReviewedHmiQueue",
    "finishStoppedReviewedHmiQueue","startReviewedHmiQueue","prepareNextReviewedHmiBatch",
    "approveReviewedHmiQueueBatch","continueReviewedQueueAutomatically","pauseUnifiedHmiTranslation",
    "stopUnifiedHmiTranslation","importSelectedHmiBatch","importReviewedHmiTexts","importReviewedHmiTextList",
    "translateSelectedHmi","prepareHmiTextList","postTextListWithProgress",
    "renderHmiTranslationQueue","renderHmiBatchPlan","addHmiTextCell"].map(fn).join("\n");
function browser(scope="project",total=10){
    const c={console,crypto:require("node:crypto"),HMI_PROJECT_BATCH_MAX:50};
    c.document={createElement:tag=>new Element(tag),createTextNode:text=>text};
    for(const m of source.matchAll(/const (hmi\w+)\s*=\s*document\.(?:getElementById|querySelector)\(/g))c[m[1]]=new Element();
    c.hmiScopeProject.checked=scope!=="text_lists";c.hmiScopeLists.checked=scope!=="project";
    c.hmiBatchSizeInput.value="5";c.hmiBatchTotalInput.value=String(total);c.hmiReviewEachBatch.checked=true;
    const timers=new Set();c.window={setInterval:cb=>{timers.add(cb);return cb;},clearInterval:cb=>timers.delete(cb)};
    c.hmiScopeEnabled=name=>name==="project"?c.hmiScopeProject.checked:c.hmiScopeLists.checked;
    c.hmiWorkScope=()=>scope;
    c.hmiTranslationSelection=()=>({process_id:1,hmi_name:"HMI",device_name:"Device",
        source_culture:"pl-PL",target_culture:"en-US",view_path_root:"HMI",ollama_model:"mock"});
    c.hmiScanKey=(_selection,type="project")=>type;
    c.confirmation=true;c.confirm=()=>c.confirmation;
    c.progress=[];c.renderHmiBatchProgress=(done,limit)=>c.progress.push([done,limit]);
    c.refreshProjectLanguages=async()=>{};c.restoreHmiTranslationAfterImport=()=>true;c.invalidateHmiPreview=()=>{};
    c.refreshes=[];c.refreshMode="ok";
    const refresh=async()=>{
        if(c.refreshMode==="fail")return false;
        if(c.refreshMode==="throw")throw Error("Export failed");
        if(c.refreshMode==="hold"){const d=deferred();c.refreshes.push(d);return d.promise;}return true;
    };
    c.previewSelectedHmi=refresh;c.scanHmiTextLists=refresh;
    c.resumeHmiBatchImport=()=>{throw Error("Unexpected legacy Resume");};
    c.translateAllSelectedHmi=()=>{throw Error("Lost reviewed queue context");};
    c.pauseHmiBatchImport=()=>{};c.pauseAutomaticXmlBatches=()=>{};
    c.getJson=async()=>({stage:"translating",completed:0,total:5});
    c.prepares=[];c.imports=[];c.inflight=0;c.maxInflight=0;
    c.postJson=async(url,payload)=>{
        const d=deferred(),request={url,payload,...d};
        if(url.endsWith("/prepare-translations")||url.endsWith("/prepare")){c.prepares.push(request);return d.promise;}
        assert.ok(url.endsWith("/import-reviewed-translations")||url.endsWith("/import"),url);
        c.imports.push(request);c.maxInflight=Math.max(c.maxInflight,++c.inflight);
        try{return await d.promise;}finally{c.inflight--;}
    };
    vm.createContext(c);
    vm.runInContext(extract("    let existingPlcs =","    const hmiSkippedManager =")+"\n"+production+"\n"
        +extract('hmiReviewEachBatch?.addEventListener("change", () => {',"const changeHmiScope")
        +extract("hmiBatchResumeButton?.addEventListener(","hmiBatchPauseButton?.addEventListener("),c);
    const run=code=>vm.runInContext(code,c);
    // XLSX table rendering boundary only; all preparation/import state changes
    // and backend-response validation execute in production functions above.
    c.renderPreparedHmiReview=(result,key)=>{
        run(`preparedHmiReview=${JSON.stringify(result.review_id?{
            reviewId:result.review_id,selectionKey:key,rowCount:result.selected_rows}:null)};`);
        c.hmiReviewRows.replaceChildren(...(result.examples||[]).map(item=>{
            const e=new Element("textarea");e.dataset.sourceText=item.source_text;e.value=item.proposed_target;return e;
        }));c.hmiReviewResults.classList.remove("hidden");
    };
    run(`verifiedHmiScanKey="project";verifiedHmiTextListsScanKey="text_lists";
        latestHmiScan={missingUnique:${scope==="text_lists"?0:20}};
        hmiTextListsData={lists:[{name:"A",eligible_missing_entries:20},{name:"B",eligible_missing_entries:10}]};`);
    const state=()=>run(`({active:hmiReviewQueueActive,pending:hmiReviewQueuePending,paused:hmiReviewQueuePaused,
        operation:hmiReviewQueueOperation,count:hmiCombinedApprovedCount,review:preparedHmiReview,
        xmlToken:hmiTextListReviewToken,report:hmiRunReportVerifiedCount})`);
    const flush=()=>new Promise(resolve=>setImmediate(resolve));
    const prepare=async(index=c.prepares.length-1)=>{
        const r=c.prepares[index];assert.ok(r,"Prepare must actually start");
        const n=r.payload.max_rows,rows=Array.from({length:n},(_,i)=>({entry_index:i,
            source_text:`source-${index}-${i}`,proposed_target:"Translated",source:"Original",proposal:"Translated"}));
        r.resolve({review_id:`review-${index}`,selected_rows:n,approved_count:n,examples:rows,rows,skipped:[]});await flush();
    };
    const verify=async(index=c.imports.length-1)=>{
        const r=c.imports[index];assert.ok(r,"Import must actually start");const n=r.payload.proposals.length;
        run(r.url.endsWith("/import")?`hmiTextListsData.lists.find(x=>x.name===hmiTextListSelect.value).eligible_missing_entries-=${n};`
            :`latestHmiScan.missingUnique-=${n};`);
        r.resolve({status:"verified",verified_rows:n,imported_rows:n,verified_entries:n,text_list_name:"A"});await flush();
    };
    return{c,run,state,flush,prepare,verify,
        async start(){void run(`startReviewedHmiQueue({useProject:${scope!=="text_lists"},useXml:${scope!=="project"},quota:${total}})`);await flush();},
        change(on){c.hmiReviewEachBatch.checked=on;c.hmiReviewEachBatch.handlers.change();},
        pause(){run("pauseUnifiedHmiTranslation()");},stop(){run("stopUnifiedHmiTranslation()");},
        approve(){void run("approveReviewedHmiQueueBatch()");},resume(){c.hmiBatchResumeButton.click();},
        clean(){assert.equal(c.inflight,0);assert.equal(timers.size,0);assert.ok(c.maxInflight<=1,"At most one import");},
    };
}
const scenarios=[];function scenario(name,body){scenarios.push({name,body});}
for(const scope of["project","text_lists"]){
    const ready=async()=>{const b=browser(scope);await b.start();await b.prepare();return b;};
    scenario(scope+": pending review stays manual when checkbox turns OFF",async()=>{
        const b=await ready();b.change(false);b.change(false);assert.equal(b.c.imports.length,0);
        assert.equal(b.state().pending,true);assert.match(b.c.hmiUnifiedStatus.textContent,/still awaits approval/);
        b.approve();assert.equal(b.c.imports.length,1);
        b.change(true);await b.verify();assert.equal(b.c.prepares.length,2);await b.prepare();
        assert.equal(b.state().pending,true);assert.equal(b.c.imports.length,1);
        assert.equal(b.c.hmiImportReviewedButton.disabled,false);b.clean();
    });
    scenario(scope+": OFF during prepare; full automatic 0/10 -> 5/10 -> 10/10",async()=>{
        const b=browser(scope);await b.start();b.change(false);await b.prepare();
        assert.equal(b.c.imports.length,1);await b.verify();assert.equal(b.c.prepares.length,2);
        await b.prepare();await b.verify();assert.equal(b.state().count,10);assert.equal(b.state().active,false);
        for(const done of[0,5,10])assert.ok(b.c.progress.some(p=>p[0]===done&&p[1]===10));
        assert.equal(b.state().review,null);assert.equal(b.state().xmlToken,null);
        assert.doesNotMatch(b.c.hmiUnifiedStatus.textContent,/Awaiting approval/);b.clean();
    });
    scenario(scope+": ON/OFF/ON during prepare never imports",async()=>{
        const b=browser(scope);await b.start();b.change(false);b.change(true);await b.prepare();
        assert.equal(b.c.imports.length,0);assert.equal(b.state().pending,true);b.clean();
    });
    scenario(scope+": rapid ON/OFF/ON/OFF during write honors last state",async()=>{
        const b=await ready();b.change(false);b.change(true);b.change(false);b.change(true);b.change(false);
        assert.equal(b.c.imports.length,0);b.approve();
        assert.equal(b.c.imports.length,1);await b.verify();await b.prepare();
        assert.equal(b.c.imports.length,2);await b.verify();assert.equal(b.state().active,false);b.clean();
    });
    scenario(scope+": Pause + OFF + Resume preserves prepared batch",async()=>{
        const b=await ready();b.pause();b.change(false);assert.equal(b.c.imports.length,0);
        assert.equal(b.state().paused,true);assert.equal(b.c.hmiImportReviewedButton.disabled,true);
        b.resume();assert.equal(b.c.imports.length,0);assert.equal(b.c.prepares.length,1);
        b.approve();assert.equal(b.c.imports.length,1);b.change(true);await b.verify();await b.prepare();b.clean();
    });
    scenario(scope+": paused review ON can Resume without preparing twice",async()=>{
        const b=await ready();b.pause();b.resume();assert.equal(b.c.prepares.length,1);
        assert.equal(b.c.imports.length,0);assert.equal(b.c.hmiImportReviewedButton.disabled,false);b.clean();
    });
    scenario(scope+": Pause during automatic prepare imports only after Resume",async()=>{
        const b=browser(scope);await b.start();b.change(false);b.pause();await b.prepare();
        assert.equal(b.c.imports.length,0);assert.equal(b.state().pending,true);
        b.change(true);b.resume();assert.equal(b.c.imports.length,1);
        await b.verify();await b.prepare();assert.equal(b.state().pending,true);b.clean();
    });
    scenario(scope+": Stop during prepare prevents write",async()=>{
        const b=browser(scope);await b.start();b.change(false);b.stop();await b.prepare();
        assert.equal(b.c.imports.length,0);assert.equal(b.state().active,false);assert.equal(b.state().pending,false);b.clean();
    });
    scenario(scope+": Stop during write preserves verification and stops next batch",async()=>{
        const b=await ready();b.change(false);b.approve();b.stop();await b.verify();assert.equal(b.state().count,5);
        assert.equal(b.state().report,5);assert.equal(b.state().active,false);assert.equal(b.c.prepares.length,1);b.clean();
    });
    scenario(scope+": uncertain write stops without retry or stale review",async()=>{
        const b=await ready();b.change(false);b.approve();b.c.imports[0].reject(Error("Connection lost"));await b.flush();
        b.change(true);b.change(false);assert.equal(b.state().active,false);assert.equal(b.c.imports.length,1);
        assert.equal(b.state().count,0);assert.equal(b.state().review,null);assert.equal(b.state().xmlToken,null);b.clean();
    });
    scenario(scope+": cancelled confirmation preserves editable review",async()=>{
        const b=await ready();b.c.confirmation=false;b.approve();await b.flush();
        assert.equal(b.c.imports.length,0);assert.equal(b.state().pending,true);
        assert.equal(b.c.hmiImportReviewedButton.disabled,false);b.clean();
    });
    for(const failure of["fail","throw"])scenario(scope+": refresh "+failure+" keeps confirmed writes",async()=>{
        const b=await ready();b.c.refreshMode=failure;b.change(false);b.approve();await b.verify();
        assert.equal(b.state().count,5);assert.equal(b.state().active,false);
        assert.equal(b.c.prepares.length,1);assert.equal(b.state().report,5);b.clean();
    });
    scenario(scope+": checkbox during refresh applies at next boundary",async()=>{
        const b=await ready();b.c.refreshMode="hold";b.change(false);b.approve();await b.verify();
        assert.equal(b.state().count,5);assert.equal(b.c.refreshes.length,1);
        b.change(true);b.change(false);b.change(true);b.c.refreshes[0].resolve(true);
        await b.flush();await b.prepare();assert.equal(b.c.imports.length,1);
        assert.equal(b.c.hmiImportReviewedButton.disabled,false);b.clean();
    });
    scenario(scope+": concurrent prepare entry is serialized",async()=>{
        const b=browser(scope);await b.start();void b.run("prepareNextReviewedHmiBatch()");
        assert.equal(b.c.prepares.length,1);await b.prepare();b.clean();
    });
    scenario(scope+": malformed verification stops without credit or retry",async()=>{
        const b=await ready();b.change(false);b.approve();
        b.c.imports[0].resolve({status:"verified",verified_rows:1,imported_rows:5,verified_entries:1});
        await b.flush();assert.equal(b.state().active,false);assert.equal(b.state().count,0);
        assert.equal(b.c.prepares.length,1);b.clean();
    });
    scenario(scope+": backend edit rejection preserves review without automatic retry",async()=>{
        const b=await ready();b.change(false);b.approve();
        b.c.imports[0].reject(Error(scope==="project"?"PROJECT_TEXT_REVIEW_EDIT_INVALID: invalid"
            :"TEXT_LIST_REVIEW_EDIT_INVALID: invalid"));await b.flush();
        assert.equal(b.state().active,true);assert.equal(b.state().pending,true);
        assert.equal(b.c.imports.length,1);assert.equal(b.c.hmiImportReviewedButton.disabled,false);b.clean();
    });
    scenario(scope+": Pause during verified refresh holds next batch",async()=>{
        const b=await ready();b.c.refreshMode="hold";b.change(false);b.approve();await b.verify();
        b.pause();b.c.refreshMode="ok";b.c.refreshes[0].resolve(true);await b.flush();
        assert.equal(b.state().paused,true);assert.equal(b.c.prepares.length,1);
        b.resume();assert.equal(b.c.prepares.length,2);await b.prepare();b.change(true);
        await b.verify();assert.equal(b.state().count,10);b.clean();
    });
}
scenario("Mixed queue: finish XLSX, then list A, then B; cap last batch",async()=>{
    const b=browser("both",43);await b.start();b.change(false);
    for(let i=0;i<9;i++){
        await b.prepare();const r=b.c.imports[i];assert.ok(r);
        assert.equal(r.url.endsWith("/import-reviewed-translations"),i<4);
        if(i>=4)assert.equal(b.c.hmiTextListSelect.value,i<8?"A":"B");
        assert.equal(r.payload.proposals.length,i===8?3:5);await b.verify();
    }
    assert.equal(b.state().active,false);assert.equal(b.state().count,43);b.clean();
});
scenario("Blank total preserves the original run quota and caps last batch",async()=>{
    const b=browser("project",7);b.c.hmiBatchTotalInput.value="";await b.start();b.change(false);
    await b.prepare();await b.verify();await b.prepare();
    assert.equal(b.c.imports[1].payload.proposals.length,2);await b.verify();
    assert.equal(b.state().count,7);assert.equal(b.state().active,false);b.clean();
});
scenario("XML safe rejection: scan is serialized and Stop prevents next prepare",async()=>{
    const b=browser("text_lists");await b.start();await b.prepare();b.c.refreshMode="hold";b.change(false);b.approve();
    b.c.imports[0].reject(Error("TextList changed since preparation. Nothing imported."));await b.flush();
    assert.equal(b.c.refreshes.length,1);b.change(true);b.change(false);
    void b.run("prepareNextReviewedHmiBatch()");assert.equal(b.c.prepares.length,1);
    b.stop();b.c.refreshes[0].resolve(true);await b.flush();
    assert.equal(b.state().active,false);assert.equal(b.c.prepares.length,1);b.clean();
});
scenario("XLSX QA-only rejected batch advances without prematurely exhausting scope",async()=>{
    const b=browser();await b.start();
    b.c.prepares[0].resolve({selected_rows:0,examples:[],skipped:[{source_text:"Rejected",reason:"QA"}]});
    await b.flush();assert.equal(b.c.prepares.length,2);await b.prepare();
    assert.equal(b.state().pending,true);assert.equal(b.c.imports.length,0);b.clean();
});
scenario("Already Automatic: ON requests a reviewed handoff at the verified boundary",async()=>{
    const b=browser();b.run("hmiUnifiedRunning=true");b.change(true);
    assert.equal(b.run("hmiUnifiedReviewHandoffRequested"),true);
    assert.match(b.c.hmiUnifiedStatus.textContent,/next batch will await approval/);
    b.change(false);assert.equal(b.run("hmiUnifiedReviewHandoffRequested"),false);
    assert.equal(b.c.imports.length,0);assert.equal(b.c.prepares.length,0);b.clean();
});
// Keep Node alive until every scenario finishes; unresolved promises must fail.
(async()=>{
    let passed=0,failed=0;
    for(const{name,body}of scenarios){let timer;
        try{await Promise.race([body(),new Promise((_,reject)=>{
            timer=setTimeout(()=>reject(Error("Scenario did not finish")),3000);})]);
            passed++;console.log("PASS "+name);
        }catch(error){failed++;console.error("FAIL "+name,error);}finally{clearTimeout(timer);}
    }
    assert.equal(passed+failed,scenarios.length);
    console.log(`HMI scenarios: ${passed} passed, ${failed} failed, ${scenarios.length} executed`);
    assert.equal(failed,0);console.log("HMI review checkbox transitions: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
