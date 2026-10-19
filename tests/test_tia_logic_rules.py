"""Source-backed PLC logic detection; Siemens real-world encoding fixtures."""
import json

from engine.tia_logic_rules import inspect_scl_boolean_logic
from engine.tia_offline_audit import analyze_exported_plc, audit_artifacts


HYDRAULIC_SCL = """
IF NOT di_A1Softstarter44U1Confirm AND NOT db_OutA1.MotorM1Softstart
   AND NOT db_OutHyd1.Pressure1On AND NOT db_OutHyd1.Pressure2On
   AND NOT db_OutA1.MotorM2Softstart AND NOT di_A1Softstarter44U1Confirm
   AND NOT db_HYD.Pressure1Ok AND NOT db_HYD.Pressure2Ok THEN
    db_HYD.HydStoped := true;
ELSE
    db_HYD.HydStoped := false;
END_IF;
IF di_A1Softstarter44U1Confirm OR di_A1Softstarter45U1Confirm THEN
    db_HYD.HydIsOn := true;
ELSE
    db_HYD.HydIsOn := false;
END_IF;
"""


def test_real_hydraulic_defect_duplicate_and_overlapping_statuses():
    findings, coverage = inspect_scl_boolean_logic(
        HYDRAULIC_SCL, path="tia-project/plc/P/blocks/fc_check_Hyd_OnOrStoped.xml",
        block="fc_check_Hyd_OnOrStoped", plc="PPFKA2", network=1,
    )
    assert coverage["simple_boolean_conditions"] == 2
    by_rule = {item["rule"]: item for item in findings}
    assert set(by_rule) == {"SCL_DUPLICATE_AND_OPERAND", "SCL_OPPOSING_STATUS_OVERLAP"}
    duplicated = by_rule["SCL_DUPLICATE_AND_OPERAND"]
    assert duplicated["repeated_operands"] == [
        {"signal": "DI_A1SOFTSTARTER44U1CONFIRM", "negated": True},
    ]
    conflicting = by_rule["SCL_OPPOSING_STATUS_OVERLAP"]
    example = conflicting["counterexample"]
    assert example["DI_A1SOFTSTARTER45U1CONFIRM"] is True
    assert example["DI_A1SOFTSTARTER44U1CONFIRM"] is False
    assert all(not value for name, value in example.items()
               if name != "DI_A1SOFTSTARTER45U1CONFIRM")
    assert "fc_check_Hyd_OnOrStoped.xml" in conflicting["source_path"]
    assert conflicting["network"] == 1
    assert conflicting["priority"] == "P1"


def test_unrelated_status_names_no_unsound_proof_and_unknown_syntax_skipped():
    text = """
    IF A AND A THEN x.Stopped := true; ELSE x.Stopped := false; END_IF;
    IF B THEN y.IsOn := true; ELSE y.IsOn := false; END_IF;
    IF A = B AND A THEN x.Target := true; ELSE x.Target := false; END_IF;
    """
    findings, coverage = inspect_scl_boolean_logic(
        text, path="p.xml", block="F", plc="P", network=1,
    )
    assert coverage["unsupported_boolean_conditions"] == 1
    assert not any(item["rule"] == "SCL_OPPOSING_STATUS_OVERLAP" for item in findings)
    assert any(item["rule"] == "SCL_DUPLICATE_AND_OPERAND" for item in findings)


def test_opposing_conditions_without_overlap_are_not_reported():
    text = """
    IF A THEN db.MotorStopped := true; ELSE db.MotorStopped := false; END_IF;
    IF NOT A THEN db.MotorIsOn := true; ELSE db.MotorIsOn := false; END_IF;
    """
    findings, coverage = inspect_scl_boolean_logic(
        text, path="p.xml", block="F", plc="P", network=1,
    )
    assert coverage["simple_status_assignments"] == 2
    assert findings == []


def test_real_siemens_structuredtext_xml_encoding_and_zip_report():
    text = """<Document xmlns:s="http://www.siemens.com/automation/Openness/SW/NetworkSource/StructuredText/v4">
    <SW.Blocks.FC><AttributeList><Name>fc_check_Hyd_OnOrStoped</Name></AttributeList>
    <ObjectList><SW.Blocks.CompileUnit><AttributeList>
    <ProgrammingLanguage>SCL</ProgrammingLanguage><NetworkSource>
    <s:StructuredText>
    <s:Token Text="IF"/><s:Blank Num="1"/><s:Token Text="NOT"/><s:Blank Num="1"/>
    <s:Access Scope="GlobalVariable"><s:Symbol><s:Component Name="FeedbackA"/></s:Symbol></s:Access>
    <s:Blank Num="1"/><s:Token Text="AND"/><s:Blank Num="1"/>
    <s:Token Text="NOT"/><s:Blank Num="1"/>
    <s:Access Scope="GlobalVariable"><s:Symbol><s:Component Name="FeedbackA"/></s:Symbol></s:Access>
    <s:Blank Num="1"/><s:Token Text="THEN"/><s:NewLine Num="1"/>
    <s:Access Scope="GlobalVariable"><s:Symbol><s:Component Name="db"/><s:Component Name="MotorStopped"/></s:Symbol></s:Access>
    <s:Blank Num="1"/><s:Token Text=":="/><s:Blank Num="1"/>
    <s:Access Scope="LiteralConstant"><s:Constant><s:ConstantValue>true</s:ConstantValue></s:Constant></s:Access>
    <s:Token Text=";"/><s:NewLine Num="1"/>
    <s:Token Text="ELSE"/><s:NewLine Num="1"/>
    <s:Access Scope="GlobalVariable"><s:Symbol><s:Component Name="db"/><s:Component Name="MotorStopped"/></s:Symbol></s:Access>
    <s:Blank Num="1"/><s:Token Text=":="/><s:Blank Num="1"/>
    <s:Access Scope="LiteralConstant"><s:Constant><s:ConstantValue>false</s:ConstantValue></s:Constant></s:Access>
    <s:Token Text=";"/><s:NewLine Num="1"/><s:Token Text="END_IF"/><s:Token Text=";"/>
    </s:StructuredText></NetworkSource></AttributeList>
    </SW.Blocks.CompileUnit></ObjectList></SW.Blocks.FC></Document>"""
    path = "tia-project/plc/Device/PPFKA2/blocks/03-Logic/000168_fc_check_Hyd_OnOrStoped.xml"
    report = analyze_exported_plc({path: text.encode()})
    assert report["coverage"]["plc_xml_parsed"] == 1
    assert report["coverage"]["boolean_logic"]["duplicate_operands"] == 1
    assert report["logic_findings"][0]["source_path"] == path
    assert report["logic_findings"][0]["block"] == "fc_check_Hyd_OnOrStoped"
    assert report["logic_findings"][0]["network"] == 1
    package = audit_artifacts(report, {"by_scope": {}})
    serialized = json.loads(package["review/LOGIC_FINDINGS.json"])
    assert serialized["findings"][0]["rule"] == "SCL_DUPLICATE_AND_OPERAND"
    assert "fc_check_Hyd_OnOrStoped" in package["review/ENGINEERING_SUMMARY.md"].decode()


def test_missing_or_complicated_scl_is_not_invented_as_a_logic_defect():
    findings, counts = inspect_scl_boolean_logic(
        "IF A[1] AND B THEN x.Stopped := true; ELSE x.Stopped := false; END_IF;",
        path="missing.xml", block="Missing", plc="PLC", network=1,
    )
    assert counts["unsupported_boolean_conditions"] == 1
    assert findings == []
