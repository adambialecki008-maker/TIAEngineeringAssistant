from fastapi.testclient import TestClient
from engine.main import app
from engine.plc_code_review import ReviewInputFile, analyze_files


def test_scl_and_xml_analysis_resolves_loaded_udt_and_reports_missing_type():
    report = analyze_files([
        ReviewInputFile(name="Types.scl", content="TYPE UDT_Motor\nEND_TYPE"),
        ReviewInputFile(name="Motor.scl", content="FUNCTION_BLOCK FB_Motor\nVAR_INPUT\n Value : UDT_Motor;\n Missing : UDT_No;\nEND_VAR"),
        ReviewInputFile(name="Lad.xml", content='<Document Name="FB_Lad"><Section Name="Static"><Member Name="Delay" Datatype="TON_TIME"/></Section><CompileUnit/></Document>'),
    ])
    assert [item.name for item in report.files] == ["UDT_Motor", "FB_Motor", "FB_Lad"]
    assert report.files[1].dependencies == ["UDT_Motor"]
    assert any(f.category == "Unresolved dependency" and f.evidence == "UDT_No" for f in report.findings)
    assert report.files[2].networks == ["network 1"]


def test_invalid_and_unsupported_files_do_not_stop_other_files():
    report = analyze_files([ReviewInputFile(name="bad.xml", content="<broken"), ReviewInputFile(name="notes.txt", content="x"), ReviewInputFile(name="ok.scl", content="FUNCTION FC_Ok")])
    assert report.files[0].verification_status == "failed"
    assert "unsupported extension" in report.file_warnings[0]
    assert report.files[-1].name == "FC_Ok"


def test_code_review_api_is_read_only():
    response = TestClient(app).post("/api/v1/code-review/analyze-files", json=[{"name":"DB.scl", "content":"DATA_BLOCK DB_A"}])
    assert response.status_code == 200
    assert response.json()["read_only"] is True


def test_multi_instance_cycles_and_iec_context_are_reported_from_loaded_source():
    report = analyze_files([
        ReviewInputFile(name="A.scl", content="FUNCTION_BLOCK FB_A\nVAR_STATIC\n B : FB_B;\n Timer : TON_TIME;\nEND_VAR"),
        ReviewInputFile(name="B.scl", content="FUNCTION_BLOCK FB_B\nVAR_STATIC\n A : FB_A;\nEND_VAR"),
        ReviewInputFile(name="Bad.scl", content="FUNCTION FC_Bad\nVAR_INPUT\n Timer : TON_TIME;\n Call : TON;\nEND_VAR"),
    ])
    cycles = [item for item in report.findings if item.category == "Cyclic multi-instance dependency"]
    assert {item.block for item in cycles} == {"FB_A", "FB_B"}
    assert all(item.evidence == "FB_A -> FB_B -> FB_A" for item in cycles)
    assert any(item.category == "Invalid IEC instance context" and item.evidence == "TON_TIME" for item in report.findings)
    assert any(item.category == "Invalid instruction declaration" and item.evidence == "TON" for item in report.findings)


def test_scl_quoted_identifiers_and_array_of_udt_are_resolved():
    report = analyze_files([
        ReviewInputFile(name="MotorType.scl", content='TYPE "UDT_Motor"\nEND_TYPE'),
        ReviewInputFile(name="Motor.scl", content=(
            'FUNCTION_BLOCK "FB_Motor"\nVAR_INPUT\n'
            '    "Motors" : ARRAY[1..4] OF "UDT_Motor";\n'
            '    "Label" : STRING[24];\nEND_VAR\n'
        )),
    ])
    assert report.files[1].name == "FB_Motor"
    assert [(d.name, d.data_type) for d in report.files[1].declarations] == [
        ("Motors", 'ARRAY[1..4] OF "UDT_Motor"'), ("Label", "STRING[24]"),
    ]
    assert report.files[1].dependencies == ["UDT_Motor"]
    assert not any(x.category == "Unresolved dependency" for x in report.findings)


def test_simaticml_block_metadata_preferred_over_filename_and_iec_internals_ignored():
    report = analyze_files([ReviewInputFile(
        name="exports/export-001.xml",
        content=(
            '<Document><SW.Blocks.FB><AttributeList>'
            '<Name>FB_Drive</Name><ProgrammingLanguage>KOP</ProgrammingLanguage>'
            '<Interface><Sections><Section Name="Static">'
            '<Member Name="Timer" Datatype="TON_TIME"><Sections>'
            '<Section Name="Static"><Member Name="ET" Datatype="Time"/>'
            '</Section></Sections></Member>'
            '<Member Name="State" Datatype="Struct"><Sections>'
            '<Section Name="Static"><Member Name="Flag" Datatype="Bool"/>'
            '</Section></Sections></Member>'
            '</Section></Sections></Interface></AttributeList>'
            '<ObjectList><SW.Blocks.CompileUnit/></ObjectList>'
            '</SW.Blocks.FB></Document>'
        ),
    )])
    block = report.files[0]
    assert (block.name, block.block_type, block.language) == ("FB_Drive", "FB", "LAD")
    assert [d.name for d in block.declarations] == ["Timer", "State", "State.Flag"]
    assert block.networks == ["network 1"]
    assert not report.findings


def test_iec_projection_same_names_and_nested_structs_do_not_false_flag_duplicates():
    report = analyze_files([ReviewInputFile(name="FB_Test.xml", content=(
        '<SW.Blocks.FB Name="FB_Test"><Section Name="Static">'
        '<Member Name="A" Datatype="Struct"><Member Name="Enabled" Datatype="Bool"/></Member>'
        '<Member Name="B" Datatype="Struct"><Member Name="Enabled" Datatype="Bool"/></Member>'
        '<Member Name="Timer" Datatype="TON_TIME"><Member Name="Enabled" Datatype="Bool"/></Member>'
        '</Section></SW.Blocks.FB>'
    ))])
    assert not any(f.category == "Duplicate declaration" for f in report.findings)
    assert not any(f.category == "Invalid IEC instance context" for f in report.findings)
    assert [d.name for d in report.files[0].declarations] == [
        "A", "A.Enabled", "B", "B.Enabled", "Timer",
    ]


def test_multi_instance_cycles_are_static_only_and_case_insensitive():
    report = analyze_files([
        ReviewInputFile(name="one.scl", content=(
            'FUNCTION_BLOCK "FB_One"\nVAR_INPUT\n InputRef : "FB_Two";\nEND_VAR\n'
        )),
        ReviewInputFile(name="two.scl", content=(
            'FUNCTION_BLOCK "FB_Two"\nVAR_STATIC\n Back : "fb_one";\nEND_VAR\n'
        )),
    ])
    assert not any(f.category == "Cyclic multi-instance dependency" for f in report.findings)

    report = analyze_files([
        ReviewInputFile(name="one.scl", content=(
            'FUNCTION_BLOCK "FB_One"\nVAR_STATIC\n Child : "fb_two";\nEND_VAR'
        )),
        ReviewInputFile(name="two.scl", content=(
            'FUNCTION_BLOCK "FB_Two"\nVAR_STATIC\n Back : "FB_ONE";\nEND_VAR'
        )),
    ])
    cycles = [f for f in report.findings if f.category == "Cyclic multi-instance dependency"]
    assert len(cycles) == 2
    assert all(f.evidence == "FB_One -> FB_Two -> FB_One" for f in cycles)


def test_multiple_xml_blocks_or_scl_headers_report_partial_not_misattributed():
    xml = analyze_files([ReviewInputFile(name="many.xml", content=(
        '<Document><SW.Blocks.FB/><SW.Blocks.FC/></Document>'
    ))]).files[0]
    assert xml.verification_status == "partial"
    assert xml.block_type == "Unknown"
    assert "Multiple TIA blocks" in xml.parsing_warnings[0]
    scl = analyze_files([ReviewInputFile(name="many.scl", content=(
        'FUNCTION_BLOCK FB_A\nVAR_INPUT\n Value : Bool;\nEND_VAR\n'
        'FUNCTION_BLOCK FB_B\nVAR_INPUT\n Flag : Bool;\nEND_VAR'
    ))]).files[0]
    assert scl.name == "FB_A"
    assert scl.verification_status == "partial"
    assert len(scl.declarations) == 1
    assert "Several SCL block headers" in scl.parsing_warnings[0]


def test_scl_udt_type_struct_fields_and_nested_array_dependencies():
    report = analyze_files([
        ReviewInputFile(name="motor.scl", content='TYPE "UDT_Motor"\nSTRUCT\n Enabled : Bool;\nEND_STRUCT;\nEND_TYPE'),
        ReviewInputFile(name="pump.scl", content=(
            'TYPE "UDT_Pump"\nVERSION : 0.1\nSTRUCT\n'
            ' Motor : "UDT_Motor";\n'
            ' Settings : Struct\n'
            '   Speed : Real;\n'
            '   Modes : ARRAY[0..2] OF "UDT_Motor";\n'
            ' END_STRUCT;\n'
            'END_STRUCT;\nEND_TYPE'
        )),
    ])
    block = report.files[1]
    assert block.verification_status == "parsed"
    assert [(row.name, row.section, row.data_type) for row in block.declarations] == [
        ("Motor", "Struct", '"UDT_Motor"'),
        ("Settings", "Struct", "Struct"),
        ("Settings.Speed", "Struct", "Real"),
        ("Settings.Modes", "Struct", 'ARRAY[0..2] OF "UDT_Motor"'),
    ]
    assert block.dependencies == ["UDT_Motor"]
    assert not report.findings


def test_scl_nested_struct_fields_in_fb_and_missing_closing_struct_is_partial():
    report = analyze_files([
        ReviewInputFile(name="drive.scl", content=(
            'FUNCTION_BLOCK "FB_Drive"\nVAR_STATIC\n'
            ' Drive : Struct\n'
            '  Run : Bool;\n'
            '  Details : Struct\n'
            '   Fault : Bool;\n'
            '  END_STRUCT;\n'
            ' END_STRUCT;\n'
            ' Timer : TON_TIME;\nEND_VAR'
        )),
        ReviewInputFile(name="incomplete.scl", content='TYPE "UDT_Bad"\nSTRUCT\n Missing : Struct\n Running : Bool;\nEND_TYPE'),
    ])
    assert [m.name for m in report.files[0].declarations] == [
        "Drive", "Drive.Run", "Drive.Details", "Drive.Details.Fault", "Timer",
    ]
    assert not report.findings
    assert report.files[1].verification_status == "partial"
    assert any("Unclosed STRUCT" in warning for warning in report.files[1].parsing_warnings)


def test_simaticml_program_network_member_is_not_interface_declaration():
    source = (
        '<Document><SW.Blocks.FC><AttributeList><Name>FC_Calc</Name>'
        '<ProgrammingLanguage>FBD</ProgrammingLanguage>'
        '<Interface><Sections><Section Name="Input">'
        '<Member Name="Source" Datatype="Bool"/></Section></Sections></Interface>'
        '</AttributeList><ObjectList><SW.Blocks.CompileUnit>'
        '<Network><Member Name="Source" Datatype="Int"/>'
        '<Member Name="Ghost" Datatype="UDT_NotExported"/></Network>'
        '</SW.Blocks.CompileUnit></ObjectList></SW.Blocks.FC></Document>'
    )
    report = analyze_files([ReviewInputFile(name="fc-export.xml", content=source)])
    assert (report.files[0].name, report.files[0].language) == ("FC_Calc", "FBD")
    assert [(x.name, x.data_type) for x in report.files[0].declarations] == [("Source", "Bool")]
    assert report.files[0].networks == ["network 1"]
    assert not report.findings


def test_simaticml_missing_interface_reports_partial_without_scanning_program_members():
    source = (
        '<Document><SW.Blocks.FB><AttributeList><Name>FB_OnlyLogic</Name></AttributeList>'
        '<ObjectList><SW.Blocks.CompileUnit><Member Name="Bad" Datatype="UnknownType"/>'
        '</SW.Blocks.CompileUnit></ObjectList></SW.Blocks.FB></Document>'
    )
    report = analyze_files([ReviewInputFile(name="logic.xml", content=source)])
    assert report.files[0].declarations == []
    assert report.files[0].networks == ["network 1"]
    assert "No supported declaration Interface/Sections" in report.files[0].parsing_warnings[0]
    assert not report.findings


def test_flgnet_reports_real_parts_wires_symbol_and_call_without_logic_guessing():
    source = (
        '<Document><SW.Blocks.FB><AttributeList><Name>FB_Line</Name>'
        '<Interface><Sections/></Interface></AttributeList><ObjectList>'
        '<SW.Blocks.CompileUnit><AttributeList><ProgrammingLanguage>LAD</ProgrammingLanguage>'
        '<NetworkSource><FlgNet xmlns="http://www.siemens.com/automation/Openness/SW/NetworkSource/FlgNet/v4">'
        '<Parts>'
        '<Access Scope="LocalVariable" UId="21"><Symbol><Component Name="Start"/></Symbol></Access>'
        '<Part Name="Contact" UId="23"/>'
        '<Call UId="24"><CallInfo Name="FB_Motor" BlockType="FB"/></Call>'
        '</Parts>'
        '<Wires><Wire UId="25"><IdentCon UId="21"/><NameCon UId="23" Name="operand"/></Wire>'
        '<Wire UId="26"><Powerrail/><NameCon UId="23" Name="in"/></Wire>'
        '<Wire UId="27"><NameCon UId="23" Name="out"/><NameCon UId="24" Name="en"/></Wire>'
        '</Wires></FlgNet></NetworkSource></AttributeList></SW.Blocks.CompileUnit>'
        '</ObjectList></SW.Blocks.FB></Document>'
    )
    report = analyze_files([ReviewInputFile(name="line.xml", content=source)])
    block = report.files[0]
    assert block.networks == ["network 1"]
    assert len(block.network_details) == 1
    network = block.network_details[0]
    assert network.language == "LAD"
    assert [(part.uid, part.kind, part.name, part.symbol) for part in network.nodes] == [
        ("21", "Access", "", "Start"), ("23", "Part", "Contact", ""),
        ("24", "Call", "FB_Motor", ""),
    ]
    assert len(network.wires) == 3
    assert [(endpoint.kind, endpoint.uid, endpoint.port) for endpoint in network.wires[0].endpoints] == [
        ("IdentCon", "21", ""), ("NameCon", "23", "operand"),
    ]
    assert "not logic-verified" in network.verification_status
    assert not report.findings


def test_flgnet_mixed_languages_and_dangling_ref_are_review_warning_not_logic_fault():
    source = (
        '<SW.Blocks.FC Name="FC_Test"><Section Name="Input"><Member Name="Enable" Datatype="Bool"/></Section>'
        '<SW.Blocks.CompileUnit><AttributeList><ProgrammingLanguage>FBD</ProgrammingLanguage>'
        '<NetworkSource><FlgNet><Parts><Part Name="And" UId="30"/></Parts>'
        '<Wires><Wire UId="31"><NameCon UId="404" Name="in1"/>'
        '<NameCon UId="30" Name="out"/></Wire></Wires></FlgNet></NetworkSource>'
        '</AttributeList></SW.Blocks.CompileUnit>'
        '<SW.Blocks.CompileUnit><AttributeList><ProgrammingLanguage>LAD</ProgrammingLanguage>'
        '<NetworkSource><FlgNet><Parts><Part Name="Coil" UId="40"/></Parts>'
        '<Wires><Wire UId="41"><OpenCon UId="43"/>'
        '<NameCon UId="40" Name="out"/></Wire></Wires></FlgNet></NetworkSource>'
        '</AttributeList></SW.Blocks.CompileUnit></SW.Blocks.FC>'
    )
    report = analyze_files([ReviewInputFile(name="x.xml", content=source)])
    block = report.files[0]
    assert [network.language for network in block.network_details] == ["FBD", "LAD"]
    assert len(report.findings) == 1
    finding = report.findings[0]
    assert (finding.category, finding.location, finding.severity) == (
        "FlgNet structural review", "network 1", "warning",
    )
    assert "404" in finding.explanation
    assert finding.verification_status == "requires TIA verification"


def test_flgnet_without_parts_or_wires_reports_partial_topology_not_exception():
    source = (
        '<SW.Blocks.FB Name="FB_Min"><SW.Blocks.CompileUnit>'
        '<NetworkSource><FlgNet><Parts><Part Name="Contact" UId="1"/></Parts>'
        '</FlgNet></NetworkSource></SW.Blocks.CompileUnit></SW.Blocks.FB>'
    )
    report = analyze_files([ReviewInputFile(name="min.xml", content=source)])
    assert len(report.files[0].network_details) == 1
    assert not report.files[0].network_details[0].wires
    assert any("Wires is absent" in x.explanation for x in report.findings)
    assert all(x.verification_status == "requires TIA verification" for x in report.findings)


def test_scl_ignores_nested_multiline_comments_fake_blocks_and_ghost_types():
    source = (
        'FUNCTION_BLOCK "FB_Actual"\n'
        '(*\nFUNCTION_BLOCK "FB_Fake"\nVAR_INPUT\n Fake : UDT_Phantom;\n'
        '(* nested\n VAR_STATIC\n Ghost : UDT_Never;\n*)\n*)\n'
        'VAR_INPUT\n'
        ' // Shadow : UDT_Missing;\n'
        ' "Real" : Bool; (* inline *)\n'
        ' "URL" : STRING[40] := \'http://localhost/(*placeholder*)//x\';\n'
        ' (* two (* nested *) levels *) "Valid" : Int;\n'
        'END_VAR\n'
    )
    report = analyze_files([ReviewInputFile(name="real.scl", content=source)])
    block = report.files[0]
    assert block.name == "FB_Actual"
    assert block.verification_status == "parsed"
    assert [(item.name, item.location) for item in block.declarations] == [
        ("Real", "line 13"), ("URL", "line 14"), ("Valid", "line 15"),
    ]
    assert not report.findings


def test_scl_comments_preserve_quoted_names_and_report_unclosed_comment():
    source = (
        'FUNCTION_BLOCK "FB_//Symbol"\n'
        'VAR_INPUT\n'
        ' "Name(*embedded*)" : Bool;\n'
        ' Actual : Int; (* unfinished\n'
        ' Phantom : UDT_Ignore;\n'
    )
    report = analyze_files([ReviewInputFile(name="quoted.scl", content=source)])
    block = report.files[0]
    assert block.name == "FB_//Symbol"
    assert [member.name for member in block.declarations] == ["Name(*embedded*)", "Actual"]
    assert block.verification_status == "partial"
    assert "Unclosed SCL block comment" in block.parsing_warnings[0]
    assert not report.findings


def test_scl_comment_after_block_header_does_not_hide_second_real_block():
    report = analyze_files([ReviewInputFile(
        name="multi.scl",
        content="FUNCTION_BLOCK FB_First // first\n(* ignored header:\nFUNCTION FC_Fake\n*)\n"
                "FUNCTION_BLOCK FB_Second\n",
    )])
    assert report.files[0].name == "FB_First"
    assert report.files[0].verification_status == "partial"
    assert any("Several SCL block headers" in warning for warning in report.files[0].parsing_warnings)


def test_scl_fb_instance_and_fc_calls_resolve_only_loaded_blocks():
    report = analyze_files([
        ReviewInputFile(name="run.scl", content=(
            'FUNCTION_BLOCK "FB_Run"\nVAR_STATIC\n Motor : "FB_Motor";\nEND_VAR\n'
            'VAR_INPUT\n Value : Int;\nEND_VAR\n'
            'BEGIN\n#Motor(IN := TRUE);\n#Value := "FC_Scale"(X := 3);\n'
            '// "FC_Ghost"();\n#Motor := 1;\nEND_FUNCTION_BLOCK'
        )),
        ReviewInputFile(name="motor.scl", content='FUNCTION_BLOCK "FB_Motor"\nEND_FUNCTION_BLOCK'),
        ReviewInputFile(name="scale.scl", content='FUNCTION "FC_Scale" : Int\nEND_FUNCTION'),
    ])
    calls = report.files[0].calls
    assert [(c.target, c.location, c.instance, c.resolution) for c in calls] == [
        ("FB_Motor", "line 9", "Motor", "loaded block"),
        ("FC_Scale", "line 10", "", "loaded block"),
    ]
    assert {"FB_Motor", "FC_Scale"} <= set(report.files[0].dependencies)
    assert not any(c.target == "FC_Ghost" for c in calls)


def test_scl_unloaded_function_call_is_context_not_false_error():
    report = analyze_files([ReviewInputFile(name="run.scl", content=(
        'FUNCTION_BLOCK FB_Run\nBEGIN\n"FC_External"(Value := 1);\n'
        'ABS(-7);\nEND_FUNCTION_BLOCK'
    ))])
    assert len(report.files[0].calls) == 1
    assert report.files[0].calls[0].target == "FC_External"
    assert report.files[0].calls[0].resolution == "requires project context"
    assert report.findings == []


def test_flgnet_explicit_callinfo_resolves_only_loaded_fb_fc():
    flgnet = (
        '<Document><SW.Blocks.FB><AttributeList><Name>FB_Master</Name></AttributeList>'
        '<ObjectList><SW.Blocks.CompileUnit><NetworkSource>'
        '<FlgNet><Parts><Call UId="1"><CallInfo Name="FC_Compute" BlockType="FC"/></Call>'
        '<Call UId="2"><CallInfo Name="FB_Remote" BlockType="FB"/></Call></Parts>'
        '<Wires/></FlgNet></NetworkSource></SW.Blocks.CompileUnit></ObjectList>'
        '</SW.Blocks.FB></Document>'
    )
    report = analyze_files([
        ReviewInputFile(name="master.xml", content=flgnet),
        ReviewInputFile(name="compute.scl", content="FUNCTION FC_Compute : Int\nEND_FUNCTION"),
    ])
    calls = report.files[0].calls
    assert [(c.target, c.location, c.source, c.resolution) for c in calls] == [
        ("FC_Compute", "network 1", "FlgNet", "loaded block"),
        ("FB_Remote", "network 1", "FlgNet", "requires project context"),
    ]
    assert "FC_Compute" in report.files[0].dependencies
    assert not report.findings


def test_declaration_only_scl_does_not_produce_call_edges():
    report = analyze_files([ReviewInputFile(name="iface.scl", content=(
        'FUNCTION_BLOCK FB_Interface\nVAR_STATIC\n'
        ' FB_Remote : FB_External;\nEND_VAR\nEND_FUNCTION_BLOCK'
    ))])
    assert report.files[0].calls == []



def test_named_scl_call_parameters_are_compared_with_loaded_fb_interface():
    report = analyze_files([
        ReviewInputFile(name="run.scl", content=(
            'FUNCTION_BLOCK FB_Run\nVAR_STATIC\n Motor : FB_Motor;\nEND_VAR\nBEGIN\n'
            '#Motor(Start := TRUE, Ready => #Ack, Cmd := Func(3, 4));\n'
            '#Motor(Start => TRUE, Ready := #Ack, Ghost := 1, Start := TRUE);\n'
            'END_FUNCTION_BLOCK'
        )),
        ReviewInputFile(name="motor.scl", content=(
            'FUNCTION_BLOCK FB_Motor\nVAR_INPUT\n Start : Bool;\nEND_VAR\n'
            'VAR_OUTPUT\n Ready : Bool;\nEND_VAR\n'
            'VAR_IN_OUT\n Cmd : Int;\nEND_VAR\nEND_FUNCTION_BLOCK'
        )),
    ])
    calls = report.files[0].calls
    assert len(calls) == 2
    assert all(call.arguments_complete for call in calls)
    assert [(arg.name, arg.operator) for arg in calls[0].arguments] == [
        ("Start", ":="), ("Ready", "=>"), ("Cmd", ":="),
    ]
    assert not any(f.location == "line 6" for f in report.findings)
    assert {f.category for f in report.findings} == {
        "Unknown call parameter", "Duplicate call parameter", "Call parameter direction",
    }
    assert len([f for f in report.findings if f.category == "Call parameter direction"]) == 2
    assert all(f.location == "line 7" and f.verification_status == "verified" for f in report.findings)


def test_multiline_scl_call_with_quotes_and_nested_commas_keeps_line_location():
    report = analyze_files([
        ReviewInputFile(name="caller.scl", content=(
            'FUNCTION FC_Runner : Int\nBEGIN\n'
            'FC_Target(\n'
            ' Name := \'a,b\'+CONCAT(IN1 := \'c,d\', IN2 := \'e\'),\n'
            ' Mode := 1\n'
            ');\nEND_FUNCTION'
        )),
        ReviewInputFile(name="target.scl", content=(
            'FUNCTION FC_Target : Int\nVAR_INPUT\n Name : String[20];\n Mode : Int;\n'
            'END_VAR\nEND_FUNCTION'
        )),
    ])
    assert len(report.files[0].calls) == 1
    call = report.files[0].calls[0]
    assert call.location == "line 3"
    assert call.arguments_complete is True
    assert [a.name for a in call.arguments] == ["Name", "Mode"]
    assert not report.findings


def test_partial_positional_or_unclosed_calls_skip_interface_diagnostics():
    report = analyze_files([
        ReviewInputFile(name="caller.scl", content=(
            'FUNCTION FC_Runner : Int\nBEGIN\nFC_Target(1, Wrong := 5);\n'
            'FC_Target(Wrong := 1;\nEND_FUNCTION'
        )),
        ReviewInputFile(name="target.scl", content=(
            'FUNCTION FC_Target : Int\nVAR_INPUT\n Known : Int;\nEND_VAR\nEND_FUNCTION'
        )),
    ])
    assert len(report.files[0].calls) == 2
    assert all(not c.arguments_complete and not c.arguments for c in report.files[0].calls)
    assert not any(f.category in {
        "Unknown call parameter", "Duplicate call parameter", "Call parameter direction",
    } for f in report.findings)


def test_non_loaded_and_partial_xml_call_interfaces_do_not_claim_verified_error():
    partial = (
        '<Document><SW.Blocks.FC><AttributeList><Name>FC_XML</Name>'
        '<Interface><Sections><Section Name="Input">'
        '<Member Name="Start" Datatype="Bool"/>'
        '</Section></Sections></Interface></AttributeList></SW.Blocks.FC></Document>'
    )
    report = analyze_files([
        ReviewInputFile(name="runner.scl", content=(
            'FUNCTION_BLOCK FB_Run\nBEGIN\nFC_XML(Unknown := TRUE);\n'
            'FC_External(NotKnown := 1);\nEND_FUNCTION_BLOCK'
        )),
        ReviewInputFile(name="external.xml", content=partial),
    ])
    findings = [f for f in report.findings if f.category == "Unknown call parameter"]
    assert len(findings) == 1
    assert findings[0].verification_status == "requires TIA verification"
    assert findings[0].evidence == "FC_XML(Unknown := ...)"



def test_call_type_review_flags_only_proven_disjoint_literal_categories():
    report = analyze_files([
        ReviewInputFile(name="caller.scl", content=(
            "FUNCTION_BLOCK FB_Main\nBEGIN\n"
            "FC_Check(Flag := INT#1, Amount := TRUE, Message := BOOL#FALSE);\n"
            "FC_Check(Flag := FALSE, Amount := DINT#123, Message := 'hello');\n"
            "FC_Check(Flag := 1, Amount := 2.0, Message := 'x');\n"
            "END_FUNCTION_BLOCK"
        )),
        ReviewInputFile(name="callee.scl", content=(
            "FUNCTION FC_Check : Int\nVAR_INPUT\n"
            " Flag : Bool;\n Amount : Real;\n Message : String[30];\n"
            "END_VAR\nEND_FUNCTION"
        )),
    ])
    findings = [f for f in report.findings if f.category == "Call parameter type mismatch"]
    assert len(findings) == 3
    assert {f.location for f in findings} == {"line 3"}
    assert all(f.verification_status == "verified" for f in findings)
    calls = report.files[0].calls
    assert [(a.actual_type, a.type_origin) for a in calls[0].arguments] == [
        ("INT", "literal"), ("Bool", "literal"), ("Bool", "literal"),
    ]
    assert calls[2].arguments[0].actual_type == ""
    assert calls[2].arguments[1].actual_type == ""
    assert calls[2].arguments[2].actual_type == ""  # 'x' might be CHAR


def test_call_type_review_uses_unambiguous_local_variable_declarations():
    report = analyze_files([
        ReviewInputFile(name="caller.scl", content=(
            "FUNCTION_BLOCK FB_Main\nVAR_INPUT\n IsReady : Bool;\n"
            "END_VAR\nVAR_TEMP\n Count : DInt;\nEND_VAR\nBEGIN\n"
            "FC_Check(Flag := #Count, Amount := #IsReady);\n"
            "FC_Check(Flag := #IsReady, Amount := #Count);\n"
            "END_FUNCTION_BLOCK"
        )),
        ReviewInputFile(name="callee.scl", content=(
            "FUNCTION FC_Check : Int\nVAR_INPUT\n"
            " Flag : Bool;\n Amount : Real;\nEND_VAR\nEND_FUNCTION"
        )),
    ])
    flagged = [x for x in report.findings if x.category == "Call parameter type mismatch"]
    assert len(flagged) == 2
    assert {f.location for f in flagged} == {"line 9"}
    assert all("local declaration" in f.explanation for f in flagged)
    assert not any(f.location == "line 10" for f in flagged)


def test_call_type_review_ignores_expressions_structs_and_missing_context():
    report = analyze_files([
        ReviewInputFile(name="caller.scl", content=(
            "FUNCTION_BLOCK FB_Main\nBEGIN\n"
            "FC_Check(Flag := NOT TRUE, Amount := SIN(1), Message := #DB.Value);\n"
            "FC_External(Flag := BOOL#TRUE);\nEND_FUNCTION_BLOCK"
        )),
        ReviewInputFile(name="callee.scl", content=(
            "FUNCTION FC_Check : Int\nVAR_INPUT\n"
            " Flag : Bool;\n Amount : Real;\n Message : String;\nEND_VAR\nEND_FUNCTION"
        )),
    ])
    assert not any(x.category == "Call parameter type mismatch" for x in report.findings)
    assert all(not arg.actual_type for arg in report.files[0].calls[0].arguments)


def test_call_type_review_partial_tia_xml_requires_manual_verification():
    xml = (
        '<Document><SW.Blocks.FC><AttributeList><Name>FC_Check</Name>'
        '<Interface><Sections><Section Name="Input">'
        '<Member Name="Flag" Datatype="Bool"/>'
        '</Section></Sections></Interface></AttributeList></SW.Blocks.FC></Document>'
    )
    report = analyze_files([
        ReviewInputFile(name="caller.scl", content=(
            "FUNCTION_BLOCK FB_Main\nBEGIN\nFC_Check(Flag := DINT#5);\nEND_FUNCTION_BLOCK"
        )),
        ReviewInputFile(name="fc.xml", content=xml),
    ])
    issues = [f for f in report.findings if f.category == "Call parameter type mismatch"]
    assert len(issues) == 1
    assert issues[0].verification_status == "requires TIA verification"
    assert issues[0].location == "line 3"


def test_call_type_review_skips_duplicate_local_declaration_evidence():
    report = analyze_files([
        ReviewInputFile(name="caller.scl", content=(
            "FUNCTION_BLOCK FB_Main\nVAR_INPUT\n Value : Bool;\n"
            "END_VAR\nVAR_TEMP\n Value : Int;\nEND_VAR\nBEGIN\n"
            "FC_Check(Flag := #Value);\nEND_FUNCTION_BLOCK"
        )),
        ReviewInputFile(name="callee.scl", content=(
            "FUNCTION FC_Check : Int\nVAR_INPUT\n Flag : Bool;\nEND_VAR\nEND_FUNCTION"
        )),
    ])
    assert any(f.category == "Duplicate declaration" for f in report.findings)
    assert not any(f.category == "Call parameter type mismatch" for f in report.findings)
    assert report.files[0].calls[0].arguments[0].actual_type == ""
