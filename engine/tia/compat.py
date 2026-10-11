def run_adapter(
    *arguments: str,
) -> list[str]:
    # Late import preserves compatibility with tests that monkeypatch
    # engine.tia_openness._run_adapter.
    import engine.tia_openness as facade

    return facade._run_adapter(
        *arguments
    )
