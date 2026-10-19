"""Offline Siemens XML indexing must be exhaustive and evidence-based."""
import json

from engine.tia_offline_audit import analyze_exported_plc, audit_artifacts


def _scl_source():
    return b"""<Document><SW.Blocks.FC><AttributeList><Name>fc_Main</Name></AttributeList>
    <ObjectList><SW.Blocks.CompileUnit>
    <AttributeList><ProgrammingLanguage>SCL</ProgrammingLanguage>
    <NetworkSource><StructuredText>
    <Token Text="CASE"/><Blank Num="1"/>
    <Access Scope="GlobalVariable"><Symbol>
    <Component Name="db_Auto"/><Component Name="Step"/></Symbol></Access>
    <Blank Num="1"/><Token Text="OF"/><NewLine Num="1"/>
    <Token Text="1"/><Token Text=":"/><NewLine Num="1"/>
    <Access Scope="GlobalVariable"><Symbol>
    <Component Name="db_State"/><Component Name="Flag"/></Symbol></Access>
    <Blank Num="1"/><Token Text=":="/><Blank Num="1"/>
    <Access Scope="LiteralConstant"><Constant><ConstantValue>true</ConstantValue>
    </Constant></Access><Token Text=";"/><NewLine Num="1"/>
    <Token Text="END_CASE"/><Token Text=";"/>
    </StructuredText></NetworkSource></AttributeList>
    </SW.Blocks.CompileUnit>
    <SW.Blocks.CompileUnit><AttributeList>
    <ProgrammingLanguage>LAD</ProgrammingLanguage><NetworkSource>
    <FlgNet><Parts>
    <Access UId="1" Scope="GlobalVariable"><Symbol>
    <Component Name="db_State"/><Component Name="Coil"/></Symbol></Access>
    <Part UId="2" Name="Coil"/>
    <Call UId="3"><CallInfo Name="fc_Helper" BlockType="FC"/></Call>
    </Parts><Wires><Wire UId="4"><IdentCon UId="1"/>
    <NameCon UId="2" Name="operand"/></Wire></Wires></FlgNet>
    </NetworkSource></AttributeList></SW.Blocks.CompileUnit>
    </ObjectList></SW.Blocks.FC></Document>"""


def test_scl_case_lad_coil_and_call_graph_are_separately_indexed():
    prefix = "tia-project/plc/Station/PLC1/blocks/root/"
    files = {
        prefix + "000001_fc_Main.xml": _scl_source(),
        prefix + "000002_fc_Helper.xml": (
            b'<Document><SW.Blocks.FC><AttributeList><Name>fc_Helper</Name>'
            b'</AttributeList></SW.Blocks.FC></Document>'
        ),
        prefix + "000003_Broken.xml": b"<Document><SW.Blocks.FC>",
        "tia-project/hmi/SCREEN.xml": b"<NOT_VALID",
    }
    audit = analyze_exported_plc(files)
    cov = audit["coverage"]
    assert cov["plc_xml_in_archive"] == 3
    assert cov["plc_xml_parsed"] == 2
    assert cov["plc_xml_parse_failed"] == 1
    assert cov["network_languages"] == {"LAD": 1, "SCL": 1}
    assert cov["network_count"] == 2
    main = next(block for block in audit["blocks"] if block["name"] == "fc_Main")
    assert main["scl_writes"] == ["db_State.Flag"]
    assert main["lad_coil_writes"] == ["db_State.Coil"]
    assert main["case_statements"][0]["state_expression"] == "db_Auto.Step"
    assert main["calls"] == ["fc_Helper"]
    assert audit["call_edges"][0]["resolution"] == "unique"
    assert any(item["signal"] == "db_State.Flag" for item in audit["signals"])
    artifacts = audit_artifacts(audit, {"by_scope": {"plc": {"analyzed": 1}}})
    assert set(artifacts) == {
        "review/ENGINEERING_AUDIT.json", "review/ENGINEERING_SUMMARY.md",
        "review/LLM_BRIEF_PL.md", "review/LOGIC_FINDINGS.json",
        "review/LAD_FBD_WIRING.json",
    }
    assert "2/3" in artifacts["review/ENGINEERING_SUMMARY.md"].decode()
    assert json.loads(artifacts["review/ENGINEERING_AUDIT.json"])["coverage"] == cov


def test_offline_audit_all_plc_xml_not_limited_to_250():
    paths = {
        "tia-project/plc/Device/PLC/blocks/root/"
        + f"{idx:06d}_FC_{idx}.xml": (
            f'<Document><SW.Blocks.FC><AttributeList><Name>FC_{idx}</Name>'
            '</AttributeList></SW.Blocks.FC></Document>'
        ).encode()
        for idx in range(265)
    }
    result = analyze_exported_plc(paths)
    assert result["coverage"]["plc_xml_parsed"] == 265
    assert len(result["blocks"]) == 265
    assert "findings" not in result
    assert result["review_candidates"]["multiple_writing_blocks"] == []
