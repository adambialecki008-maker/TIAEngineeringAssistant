from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROGRAM = (ROOT / "openness_adapter" / "Program.cs").read_text(encoding="utf-8")
SERVICE = (ROOT / "openness_adapter" / "TiaService.cs").read_text(encoding="utf-8")
TIA_JS = (ROOT / "gui" / "js" / "tia.js").read_text(encoding="utf-8")
CONNECTION_MONITOR = (
    ROOT / "gui" / "js" / "tia_connection_monitor.js"
).read_text(encoding="utf-8")


def test_fast_plc_inventory_skips_details_before_rendering_plc_rows():
    assert 'case "list-project-plcs-fast"' in PROGRAM
    start = SERVICE.index("public static int ListProjectPlcsFast")
    end = SERVICE.index("public static int ListProjectLanguages", start)
    fast_method = SERVICE[start:end]
    assert "EnumeratePlcTargets" in fast_method
    assert "WritePlc(" in fast_method
    assert "WritePlcMetrics" not in fast_method
    assert "WriteProjectHmis" not in fast_method


def test_overview_renders_fast_plc_inventory_before_detailed_context():
    fast = TIA_JS.index('"/api/v1/tia/plcs?"')
    render = TIA_JS.index("renderExistingPlcs();", fast)
    detailed = TIA_JS.index('"/api/v1/tia/project-context?"', fast)
    assert fast < render < detailed


def test_saved_active_target_stays_unverified_until_fast_inventory_confirms_it():
    assert "awaiting TIA verification" in TIA_JS
    assert '"tia-active-plc-validation"' in TIA_JS
    assert "activeTargetVerified = false" in TIA_JS
    assert "detailedContextLoading" in TIA_JS
    assert "dataset.tiaTargetVerified === \"true\"" in CONNECTION_MONITOR
    assert "dataset.tiaTargetVerified" in TIA_JS
