# Python: pytest-bdd + Playwright

Verified against `pytest-bdd` 7.x/8.x, `pytest` 8.x and `playwright` 1.4x.
> **Lane**: this file is the **web lane** - cucumber + Playwright against a
> browser. Native/hybrid mobile apps and real devices are the mobile lane:
> `appium.md`. Responsive web at a phone viewport stays here: `responsive-web.md`.


`behave` is the alternative runner (it emits cucumber JSON natively with
`-f json -o file`). Use it only if the team already uses it; pytest-bdd
integrates with the rest of the Python test suite and fixtures, which is why
these templates target it.

## 1. Dependencies

```bash
pip install pytest pytest-bdd playwright
playwright install chromium        # add firefox webkit as needed
```

`pyproject.toml`:

```toml
[project.optional-dependencies]
test = ["pytest>=8", "pytest-bdd>=7.3", "playwright>=1.49"]

[tool.pytest.ini_options]
bdd_features_base_dir = "features"
testpaths = ["tests"]
markers = ["smoke", "ui", "api", "wip", "manual"]
```

## 2. Layout

```
features/
  checkout.feature
tests/
  conftest.py            # env contract, Playwright fixtures, hooks, results writer
  step_defs/
    __init__.py
    conftest.py          # shared steps
    test_checkout.py     # scenarios() binding + step definitions
```

pytest-bdd needs a **test module** that binds the feature file; feature files
alone collect nothing:

```python
# tests/step_defs/test_checkout.py
from pytest_bdd import scenarios

scenarios("checkout.feature")
```

## 3. `tests/conftest.py`

```python
"""BDD harness: environment contract, Playwright fixtures, flow capture, results."""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import pytest
from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright


# --------------------------------------------------------------------------- env
def _flag(name: str) -> bool:
    return os.environ.get(name) == "1"


BASE_URL = os.environ.get("BDD_BASE_URL", "http://localhost:3000")
BROWSER_NAME = os.environ.get("BDD_BROWSER", "chromium")
HEADED = _flag("BDD_HEADED")
SLOWMO = float(os.environ.get("BDD_SLOWMO", "0"))
DEVICE = os.environ.get("BDD_DEVICE") or None
TIMEOUT = int(os.environ.get("BDD_TIMEOUT", "30000"))
FLOW_CAPTURE = _flag("BDD_FLOW_CAPTURE")
FLOW_DIR = Path(os.environ.get("BDD_FLOW_DIR", "bdd-artifacts/flow"))
TRACE = os.environ.get("BDD_TRACE", "off")
RESULTS_FILE = Path(os.environ.get("BDD_RESULTS", "bdd-artifacts/cucumber.json"))


def slugify(value: str) -> str:
    """Filename-safe, and not ASCII-only.

    ``\w`` is Unicode-aware in Python 3, so CJK, Cyrillic and accented Latin
    survive. Stripping them instead collapses every non-Latin scenario name to
    the same fallback, and traces and flow screenshots overwrite each other.
    """
    slug = re.sub(r"[^\w]+", "-", value.lower()).strip("-_")
    return (slug or "x")[:60]


# ---------------------------------------------------------------------- fixtures
@pytest.fixture(scope="session")
def playwright_instance():
    with sync_playwright() as playwright:
        yield playwright


@pytest.fixture(scope="session")
def browser(playwright_instance) -> Browser:
    launcher = getattr(playwright_instance, BROWSER_NAME, playwright_instance.chromium)
    instance = launcher.launch(headless=not HEADED, slow_mo=SLOWMO)
    yield instance
    instance.close()


@pytest.fixture
def context(browser: Browser, playwright_instance) -> BrowserContext:
    options: dict = {"base_url": BASE_URL}
    if DEVICE:
        profile = playwright_instance.devices.get(DEVICE)
        if profile is None:
            raise ValueError(f'Unknown BDD_DEVICE "{DEVICE}"')
        options.update(profile)
    ctx = browser.new_context(**options)
    if TRACE != "off":
        ctx.tracing.start(screenshots=True, snapshots=True, sources=True)
    yield ctx
    ctx.close()


@pytest.fixture
def page(context: BrowserContext) -> Page:
    p = context.new_page()
    p.set_default_timeout(TIMEOUT)
    return p


@pytest.fixture
def bdd_state() -> dict:
    """Per-scenario scratch space; keeps step definitions free of globals."""
    return {"step_index": 0, "steps": []}


# ------------------------------------------------------------------------- hooks
def _capture(page: Page, scenario, step, status: str, state: dict) -> None:
    if not FLOW_CAPTURE or page is None:
        return
    try:
        index = state["step_index"]
        shot = FLOW_DIR / slugify(scenario.name) / f"{index:03d}-{slugify(step.name)}.png"
        shot.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(shot))
        record = {
            "scenario": scenario.name,
            "scenarioUri": getattr(scenario.feature, "rel_filename", None),
            "scenarioLine": getattr(scenario, "line_number", None),
            "tags": sorted("@" + t for t in scenario.tags),
            "stepIndex": index,
            "keyword": step.keyword,
            "step": step.name,
            "status": status,
            "url": page.url,
            "title": page.title(),
            "screenshot": str(shot),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "device": DEVICE or "desktop",
        }
        flow_file = FLOW_DIR / "flow.ndjson"
        flow_file.parent.mkdir(parents=True, exist_ok=True)
        with flow_file.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as error:  # diagnostics only - never fail the scenario
        print(f"[bdd] flow capture failed: {error}")


def pytest_bdd_before_scenario(request, feature, scenario):
    request.getfixturevalue("bdd_state")["step_index"] = 0


def pytest_bdd_after_step(request, feature, scenario, step, step_func, step_func_args):
    state = request.getfixturevalue("bdd_state")
    state["steps"].append({"keyword": step.keyword, "name": step.name, "status": "passed"})
    _capture(request.getfixturevalue("page"), scenario, step, "passed", state)
    state["step_index"] += 1


def pytest_bdd_step_error(request, feature, scenario, step, step_func, step_func_args, exception):
    state = request.getfixturevalue("bdd_state")
    state["steps"].append({
        "keyword": step.keyword, "name": step.name, "status": "failed",
        "error": f"{type(exception).__name__}: {exception}",
    })
    _capture(request.getfixturevalue("page"), scenario, step, "failed", state)
    state["step_index"] += 1


def pytest_bdd_after_scenario(request, feature, scenario):
    state = request.getfixturevalue("bdd_state")
    _RESULTS.setdefault(feature.rel_filename, {
        "uri": feature.rel_filename,
        "name": feature.name,
        "tags": [{"name": "@" + t} for t in sorted(feature.tags)],
        "elements": [],
    })["elements"].append({
        "type": "scenario",
        "name": scenario.name,
        "line": getattr(scenario, "line_number", 0),
        "tags": [{"name": "@" + t} for t in sorted(scenario.tags)],
        "steps": [
            {
                "keyword": s["keyword"] + " ",
                "name": s["name"],
                "result": {
                    "status": s["status"],
                    **({"error_message": s["error"]} if s.get("error") else {}),
                },
            }
            for s in state["steps"]
        ],
    })


# --------------------------------------------------- cucumber JSON results writer
_RESULTS: dict = {}


def pytest_sessionfinish(session, exitstatus):
    """Emit legacy cucumber JSON so coverage.cjs can read tags and step statuses.

    pytest's own --junitxml also works but carries no tags, which makes
    requirement attribution fall back to the spec files only.
    """
    if not _RESULTS:
        return
    RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_FILE.write_text(
        json.dumps(list(_RESULTS.values()), indent=2, ensure_ascii=False), encoding="utf-8"
    )
```

## 4. Step definitions

```python
# tests/step_defs/test_checkout.py
import os

from playwright.sync_api import Page, expect
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("checkout.feature")

ROUTES = {"cart": "/cart", "checkout": "/checkout", "home": "/"}


@given(parsers.parse('I am on the "{name}" page'))
def on_page(page: Page, name: str) -> None:
    if name not in ROUTES:
        raise ValueError(f"Unknown page {name!r} - add it to ROUTES")
    page.goto(ROUTES[name])


@when(parsers.parse('I sign in as "{email}"'))
def sign_in(page: Page, email: str) -> None:
    page.goto("/login")
    page.get_by_label("Email").fill(email)
    page.get_by_label("Password").fill(os.environ.get("BDD_TEST_PASSWORD", "test-password"))
    page.get_by_role("button", name="Sign in").click()


@then(parsers.parse('I see the error "{message}"'))
def see_error(page: Page, message: str) -> None:
    expect(page.get_by_role("alert")).to_contain_text(message)
```

Data tables arrive as a `datatable` argument (pytest-bdd 7.2+):

```python
@given("the following products exist:")
def products_exist(datatable):
    header, *rows = datatable
    products = [dict(zip(header, row)) for row in rows]
    ...
```

## 5. Run and verify

```bash
BDD_BASE_URL=http://localhost:8000 pytest -m "not wip"
BDD_FLOW_CAPTURE=1 BDD_DEVICE="iPhone 15" pytest -k checkout   # responsive web viewport
node "${CLAUDE_PLUGIN_ROOT}/scripts/coverage.cjs" features/ --results bdd-artifacts/cucumber.json
```

Tag filtering: pytest-bdd converts Gherkin tags into pytest markers, so
`@smoke` becomes `-m smoke`. Register every tag in `markers` to avoid warnings.

## 6. Behave alternative

If the project uses `behave`, the equivalents are:

| Concern | behave |
|---|---|
| Config | `behave.ini` |
| Hooks | `features/environment.py` - `before_all`, `before_scenario`, `after_step`, `after_scenario` |
| Results | `behave -f json -o bdd-artifacts/cucumber.json` (native, richer than the writer above) |
| Step text | `context.` carries the world; the step is `step.keyword` / `step.name` in `after_step(context, step)` |

The environment contract and the flow-capture record schema stay identical.

## 7. Non-English step text

A feature file whose step text is not English needs step definitions that match
it. The keywords stay English, so nothing changes about how the glue is wired up
- only the text being matched.
Three things make this work, and one of them is a trap.

**The text is matched literally.** A cucumber expression is compiled to a regular
expression, and CJK characters in it are ordinary literals. Nothing special is
needed to match them.

**Parameter names stay English.** `{string}` and `{float}` match by position, not
by name, so the handler's parameters keep their English names while the step text
is not English. Only the text between the parameters has to match.

**The trap: ASCII punctuation is syntax.** In a cucumber expression, `(` `)` marks
optional text, `{` `}` marks a parameter, `/` marks alternatives and `\` escapes.
Full-width CJK punctuation - `，` `。` `（` `）` `：` - carries none of that meaning
and is safe. So write `单价 {float} 元` freely, but escape a half-width `(` as
`\(` if the step text really contains one. Mixing the two is where this bites:
`我的购物车中有 "ESP-100" (含税)` needs the parentheses escaped, `（含税）` does not.

```python
@given(parsers.parse('我的购物车中有 "{sku}"，单价 {price:f} 元'))
def cart_contains(api, sku: str, price: float):
    api.seed_cart(sku=sku, price=price)


@then(parsers.parse('订单总额为 {total:f} 元'))
def order_total_is(page, total: float):
    expect(page.get_by_test_id('order-total')).to_have_text(f'{total:.2f}')
```

Note that pytest-bdd uses `parsers.parse` / `parsers.cfparse` rather than cucumber
expressions, so the placeholder syntax is `{name:f}`, not `{float}` - the escaping
trap above applies to `{` and `}` here too.

Python 3 source is UTF-8 by default and `scenarios()` opens feature files as
UTF-8, so no encoding declaration is needed. Function names should stay ASCII:
pytest node ids end up in CI output and command-line `-k` filters.
