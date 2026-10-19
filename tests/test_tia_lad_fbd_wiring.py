"""Siemens FlgNet direct gate topology and conservative findings."""
from xml.etree import ElementTree as ET

from engine.tia_lad_fbd_wiring import inspect_lad_fbd_network


def _unit(*, different_inputs=False, negate_second=False):
    y = "FeedbackB" if different_inputs else "FeedbackA"
    negated = '<Negated Name="in2"/>' if negate_second else ""
    return ET.fromstring(f"""<SW.Blocks.CompileUnit>
    <AttributeList><ProgrammingLanguage>LAD</ProgrammingLanguage><NetworkSource>
    <FlgNet xmlns="http://www.siemens.com/automation/Openness/SW/NetworkSource/FlgNet/v5">
      <Parts>
        <Access UId="1" Scope="GlobalVariable"><Symbol>
          <Component Name="FeedbackA"/></Symbol></Access>
        <Access UId="2" Scope="GlobalVariable"><Symbol>
          <Component Name="{y}"/></Symbol></Access>
        <Part Name="A" UId="3">{negated}</Part>
        <Part Name="Coil" UId="4"/>
        <Access UId="5" Scope="GlobalVariable"><Symbol>
          <Component Name="db"/><Component Name="MotorReady"/></Symbol></Access>
      </Parts>
      <Wires>
        <Wire UId="7"><IdentCon UId="1"/><NameCon UId="3" Name="in1"/></Wire>
        <Wire UId="8"><IdentCon UId="2"/><NameCon UId="3" Name="in2"/></Wire>
        <Wire UId="9"><NameCon UId="3" Name="out"/><NameCon UId="4" Name="in"/></Wire>
        <Wire UId="10"><IdentCon UId="5"/><NameCon UId="4" Name="operand"/></Wire>
      </Wires>
    </FlgNet></NetworkSource></AttributeList></SW.Blocks.CompileUnit>""")


def _review(unit):
    return inspect_lad_fbd_network(
        unit, path="tia-project/plc/S7/PLC/blocks/a.xml",
        block="FB_Example", plc="PLC", ordinal=8, language="LAD",
    )


def test_full_wiring_and_duplicate_and_operand_have_exact_evidence():
    topology, findings = _review(_unit())
    assert topology["status"] == "indexed"
    assert len(topology["wires"]) == 4
    assert len(topology["parts"]) == 2
    assert len(topology["accesses"]) == 3
    assert len(findings) == 1
    finding = findings[0]
    assert finding["rule"] == "LAD_FBD_DUPLICATE_DIRECT_GATE_INPUT"
    assert finding["gate_type"] == "A"
    assert finding["input_pins"] == ["in1", "in2"]
    assert finding["signal"] == "FeedbackA"
    assert finding["network"] == 8
    assert finding["source_path"].endswith("/a.xml")


def test_distinct_inputs_and_negated_pin_not_wrongly_marked_duplicate():
    for arg in ({"different_inputs": True}, {"negate_second": True}):
        _, findings = _review(_unit(**arg))
        assert findings == []


def test_unknown_or_partial_network_does_not_create_hypothetical_findings():
    unit = ET.fromstring("<SW.Blocks.CompileUnit><AttributeList/></SW.Blocks.CompileUnit>")
    data, findings = _review(unit)
    assert data["status"] == "no_flgnet"
    assert findings == []
