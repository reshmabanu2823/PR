import httpx
import respx
from app import tools

HIT = {"title": "Chief Minister of Karnataka", "url": "https://example.org/cm", "snippet": "Head of government."}


async def test_omniroute_search_used_when_key_set(monkeypatch):
    monkeypatch.setenv("OMNIROUTE_API_KEY", "sk-test")
    monkeypatch.setenv("OMNIROUTE_BASE_URL", "http://omni.test/")
    with respx.mock:
        route = respx.post("http://omni.test/v1/search").mock(
            return_value=httpx.Response(200, json={"results": [HIT, {"title": "", "url": "", "snippet": ""}]}))
        result = await tools.perform_web_search("current cm of karnataka")
    assert result["success"] and result["provider"] == "omniroute"
    assert result["results"] == [HIT]
    request = route.calls.last.request
    assert request.headers["authorization"] == "Bearer sk-test"
    assert b"duckduckgo-free" in request.content


async def test_omniroute_failure_falls_back_to_ddgs(monkeypatch):
    monkeypatch.setenv("OMNIROUTE_API_KEY", "sk-test")
    monkeypatch.setenv("OMNIROUTE_BASE_URL", "http://omni.test")
    fake = type("D", (), {"__enter__": lambda s: s, "__exit__": lambda s, *a: False,
                          "text": lambda s, q, max_results: [{"title": "T", "href": "https://x.org", "body": "B"}]})
    monkeypatch.setattr("ddgs.DDGS", lambda: fake(), raising=False)
    with respx.mock:
        respx.post("http://omni.test/v1/search").mock(return_value=httpx.Response(502))
        result = await tools.perform_web_search("anything")
    assert result["provider"] == "ddgs"


async def test_omniroute_skipped_without_key(monkeypatch):
    monkeypatch.delenv("OMNIROUTE_API_KEY", raising=False)
    fake = type("D", (), {"__enter__": lambda s: s, "__exit__": lambda s, *a: False,
                          "text": lambda s, q, max_results: [{"title": "T", "href": "https://x.org", "body": "B"}]})
    monkeypatch.setattr("ddgs.DDGS", lambda: fake(), raising=False)
    with respx.mock:  # any OmniRoute call would raise: nothing is mocked
        result = await tools.perform_web_search("anything")
    assert result["provider"] == "ddgs"
