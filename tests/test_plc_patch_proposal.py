"""Point 6: safe SCL change proposal regression, no source writes."""
import hashlib

from fastapi.testclient import TestClient

from engine.main import app
from engine.plc_code_review import ReviewInputFile
from engine.plc_patch_proposal import (
    SclPatchPreviewRequest,
    preview_scl_change,
)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def proposal(source: str, original: str, replacement: str,
             start: int = 3, end: int = 3, name: str = "folder/FB_Demo.scl"):
    return SclPatchPreviewRequest(
        file=ReviewInputFile(name=name, content=source),
        expected_sha256=digest(source),
        start_line=start, end_line=end,
        expected_original=original, replacement_text=replacement,
    )


def test_scl_proposal_preview_preserves_original_and_has_unified_diff():
    source = "FUNCTION_BLOCK FB_Demo\nBEGIN\n#Value := 1;\nEND_FUNCTION_BLOCK\n"
    original = source[:]
    preview = preview_scl_change(proposal(source, "#Value := 1;\n", "#Value := 2;"))
    assert preview.preview_only is True
    assert preview.requires_explicit_approval is True
    assert preview.output_filename == "FB_Demo.reviewed.scl"
    assert preview.source_file == "folder/FB_Demo.scl"
    assert preview.original_sha256 == digest(original)
    assert preview.modified_sha256 == digest(preview.proposed_content)
    assert "-#Value := 1;" in preview.unified_diff
    assert "+#Value := 2;" in preview.unified_diff
    assert "#Value := 1;\n" in original
    assert "#Value := 2;\n" in preview.proposed_content
    assert "uncompiled" in preview.validation_status
    assert preview.validation_warnings


def test_scl_proposal_crlf_remains_crlf_and_handles_multiline_replacement():
    source = "FUNCTION_BLOCK FB_Demo\r\nBEGIN\r\n#Value := 1;\r\nEND_FUNCTION_BLOCK\r\n"
    item = proposal(source, "#Value := 1;\r\n", "#Value := 2;\n#Flag := TRUE;")
    preview = preview_scl_change(item)
    assert "#Value := 2;\r\n#Flag := TRUE;\r\n" in preview.proposed_content
    assert "\n" not in preview.proposed_content.replace("\r\n", "")


def test_scl_proposal_rejects_stale_digest_and_modified_source_range():
    from fastapi import HTTPException
    source = "FUNCTION_BLOCK FB_Demo\nBEGIN\n#Value := 1;\nEND_FUNCTION_BLOCK\n"
    stale = proposal(source, "#Value := 1;\n", "#Value := 2;")
    stale.expected_sha256 = "0" * 64
    try:
        preview_scl_change(stale)
        assert False, "Expected stale hash rejection"
    except HTTPException as exc:
        assert exc.status_code == 409

    mismatch = proposal(source, "#Value := 8;\n", "#Value := 2;")
    try:
        preview_scl_change(mismatch)
        assert False, "Expected original-range rejection"
    except HTTPException as exc:
        assert exc.status_code == 409


def test_scl_proposal_rejects_xml_paths_or_changed_block_identity():
    from fastapi import HTTPException
    source = "FUNCTION_BLOCK FB_Demo\nBEGIN\n#Value := 1;\nEND_FUNCTION_BLOCK\n"
    for name in ("snapshot/FB_Demo.xml", "../FB_Demo.scl", "C:\\wrong.scl"):
        try:
            preview_scl_change(proposal(source, "#Value := 1;\n", "#Value := 2;", name=name))
            assert False, "Expected unsafe source name to be rejected"
        except HTTPException as exc:
            assert exc.status_code == 422
    try:
        preview_scl_change(proposal(
            source, "FUNCTION_BLOCK FB_Demo\n",
            "FUNCTION_BLOCK FB_Replaced", start=1, end=1,
        ))
        assert False, "Should not replace block identity"
    except HTTPException as exc:
        assert exc.status_code == 422


def test_scl_proposal_rejects_noop_and_oversized_ranges():
    from fastapi import HTTPException
    source = "FUNCTION_BLOCK FB_Demo\nBEGIN\n#Value := 1;\nEND_FUNCTION_BLOCK\n"
    try:
        preview_scl_change(proposal(source, "#Value := 1;\n", "#Value := 1;"))
        assert False, "No-op proposal must be rejected"
    except HTTPException as exc:
        assert exc.status_code == 422
    request = proposal(source, "#Value := 1;\n", "#Value := 2;")
    request.end_line = 300
    try:
        preview_scl_change(request)
        assert False, "Out-of-range patch must be rejected"
    except HTTPException as exc:
        assert exc.status_code == 422


def test_scl_proposal_api_returns_preview_without_overwriting_file():
    source = "FUNCTION_BLOCK FB_Demo\nBEGIN\n#Value := 1;\nEND_FUNCTION_BLOCK\n"
    body = proposal(source, "#Value := 1;\n", "#Value := 2;").model_dump()
    response = TestClient(app).post("/api/v1/code-review/preview-scl-change", json=body)
    assert response.status_code == 200
    preview = response.json()
    assert preview["preview_only"] is True
    assert preview["requires_explicit_approval"] is True
    assert preview["proposed_content"] != source
    assert source == body["file"]["content"]
    assert preview["original_sha256"] == digest(source)
