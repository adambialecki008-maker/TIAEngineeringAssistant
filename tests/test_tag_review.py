from app.models import PlcTag
from app.tag_review import review_tags


def test_valid_tags_return_no_issues() -> None:
    tags = [
        PlcTag(
            name="Motor01Running",
            data_type="Bool",
            address="%I0.0",
            comment="Motor running feedback",
        ),
        PlcTag(
            name="Motor01Start",
            data_type="Bool",
            address="%Q0.0",
            comment="Motor start command",
        ),
    ]

    result = review_tags(tags)

    assert result.summary.total_tags == 2
    assert result.summary.errors == 0
    assert result.summary.warnings == 0
    assert result.issues == []


def test_duplicate_name_is_error() -> None:
    tags = [
        PlcTag(
            name="Motor01Running",
            data_type="Bool",
            address="%I0.0",
            comment="Feedback",
        ),
        PlcTag(
            name="motor01running",
            data_type="Bool",
            address="%I0.1",
            comment="Second feedback",
        ),
    ]

    result = review_tags(tags)

    assert result.summary.errors == 1
    assert result.issues[0].code == "DUPLICATE_TAG_NAME"


def test_duplicate_address_is_error() -> None:
    tags = [
        PlcTag(
            name="Motor01Running",
            data_type="Bool",
            address="%I0.0",
            comment="Feedback",
        ),
        PlcTag(
            name="Motor02Running",
            data_type="Bool",
            address="%I0.0",
            comment="Feedback",
        ),
    ]

    result = review_tags(tags)

    assert result.summary.errors == 1
    assert result.issues[0].code == "DUPLICATE_ADDRESS"


def test_missing_comment_is_warning() -> None:
    tags = [
        PlcTag(
            name="Motor01Running",
            data_type="Bool",
            address="%I0.0",
        )
    ]

    result = review_tags(tags)

    assert result.summary.warnings == 1
    assert result.issues[0].code == "MISSING_COMMENT"


def test_invalid_tag_name_is_warning() -> None:
    tags = [
        PlcTag(
            name="Motor 01 Running",
            data_type="Bool",
            address="%I0.0",
            comment="Feedback",
        )
    ]

    result = review_tags(tags)

    assert result.summary.warnings == 1
    assert result.issues[0].code == "TAG_NAME_FORMAT"
