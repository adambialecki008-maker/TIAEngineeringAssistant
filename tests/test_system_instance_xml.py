from pathlib import Path

from engine.tia.xml_parser import parse_structure_xml


def test_system_instance_xml_preserves_real_expansion_without_inventing_members(tmp_path: Path):
    source = tmp_path / "timer.xml"
    source.write_text('''<Document><Section Name="Static">
      <Member Name="Timer" Datatype="IEC_TIMER"><Member Name="ET" Datatype="Time"/></Member>
      <Member Name="Counter" Datatype="IEC_COUNTER"/>
    </Section></Document>''', encoding="utf-8")
    members = parse_structure_xml(source)
    assert [(item.path, item.level) for item in members] == [("Timer", 0), ("Timer.ET", 1), ("Counter", 0)]
    assert members[0].system_instance is True
    assert members[1].system_instance is False
    assert members[2].system_instance is True
