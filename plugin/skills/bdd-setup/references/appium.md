# Mobile lane: cucumber + Appium

The mobile lane drives **real devices, emulators and simulators** through an
Appium server: native apps, hybrid apps, and mobile browsers on actual devices.
Playwright is never used here.

| Target | Lane | Driver |
|---|---|---|
| Desktop browser | web | Playwright (see the language reference) |
| Responsive web at a phone viewport | web | Playwright device emulation (`responsive-web.md`) |
| Native Android / iOS app | **mobile** | **Appium** (this file) |
| Hybrid app / WebView screens | **mobile** | **Appium**, switching into the WEBVIEW context |
| Mobile browser on a real device or emulator | **mobile** | **Appium** with `browserName` |

The feature files are shared: Gherkin is driver-agnostic. What differs is the
step definition layer and the tags that select the lane (see section 9).

## 1. Prerequisites

```bash
npm i -g appium                       # Appium 2.x server
appium driver install uiautomator2    # Android native
appium driver install xcuitest        # iOS native (macOS only)
appium driver doctor uiautomator2     # verify the toolchain, per driver
appium                                # start the server on http://127.0.0.1:4723
```

Platform toolchains, which Appium cannot install for you:

- **Android**: JDK 17, Android SDK platform-tools + build-tools, an AVD.
  `adb devices` must list a device; `emulator -list-avds` lists AVDs.
- **iOS**: Xcode + command line tools, `xcrun simctl list devices` for
  simulators. Real devices additionally need signing and `WebDriverAgent`
  provisioning - **macOS only**, and this is where most setup time goes.
- **Flutter apps**: UiAutomator2/XCUITest only see the rendered canvas. Use
  `appium-flutter-integration-driver` and tell the user their app needs the
  Flutter driver extension compiled in; otherwise locators will not resolve.

Appium 2's base path is `/`. Appium 1 used `/wd/hub` - if a project's config has
that path, it is on Appium 1 and the capability names below need the pre-W3C form.

## 2. Environment contract - mobile lane

The web-lane variables (`BDD_BASE_URL`, `BDD_FLOW_CAPTURE`, `BDD_FLOW_DIR`,
`BDD_TIMEOUT`) keep their meaning. These are added:

| Variable | Default | Meaning |
|---|---|---|
| `BDD_DRIVER` | `playwright` | Set to `appium` to select the mobile lane |
| `BDD_PLATFORM` | `android` | `android` \| `ios` |
| `BDD_APPIUM_URL` | `http://127.0.0.1:4723` | Appium server base URL |
| `BDD_AUTOMATION_NAME` | `UiAutomator2` / `XCUITest` | Automation backend |
| `BDD_DEVICE_NAME` | `Android Emulator` / `iPhone 15` | `appium:deviceName` |
| `BDD_PLATFORM_VERSION` | unset | OS version, e.g. `14` or `17.5` |
| `BDD_UDID` | unset | Real device / simulator udid |
| `BDD_APP` | unset | Path or URL to the `.apk` / `.aab` / `.app` / `.ipa` |
| `BDD_APP_PACKAGE` | unset | Android package of an already-installed app |
| `BDD_APP_ACTIVITY` | unset | Android launch activity |
| `BDD_BUNDLE_ID` | unset | iOS bundle id of an already-installed app |
| `BDD_NO_RESET` | unset | `1` to keep app data between scenarios (faster, less isolated) |
| `BDD_BROWSER_NAME` | unset | `Chrome` / `Safari` to drive a mobile browser instead of an app |

`BDD_DEVICE` stays a **web-lane** variable (a Playwright viewport profile). The
mobile lane uses `BDD_DEVICE_NAME`, which is the Appium capability. Do not mix them.

## 3. Capabilities

Appium 2 is W3C-only: every non-standard capability carries the `appium:` prefix.

```json
{
  "platformName": "Android",
  "appium:automationName": "UiAutomator2",
  "appium:deviceName": "Android Emulator",
  "appium:app": "/abs/path/app-debug.apk",
  "appium:autoGrantPermissions": true,
  "appium:newCommandTimeout": 120,
  "appium:fullReset": false,
  "appium:noReset": false
}
```

```json
{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "appium:deviceName": "iPhone 15",
  "appium:platformVersion": "17.5",
  "appium:app": "/abs/path/App.app",
  "appium:autoAcceptAlerts": true,
  "appium:newCommandTimeout": 120
}
```

Isolation rules that matter for BDD:

- **One session per scenario** is the isolated default: the app restarts, so no
  scenario inherits another's state. It costs 5-20 seconds per scenario.
- `noReset: true` keeps app data and is much faster, but scenarios then leak
  state into each other. Only use it with `BDD_NO_RESET=1` set deliberately, and
  say so in the report - it breaks the "any order" guarantee.
- Never point the mobile lane at a shared staging account without asking: a
  scenario that sends a real notification or payment is not undoable.

## 4. Screen identity for the flow map

The page flow map needs a stable name per screen. A native app has no URL, so
the capture records `screen` instead of `url`
(see `${CLAUDE_PLUGIN_ROOT}/skills/flow-map/references/capture-contract.md`).

| Platform | Source of the screen name | Quality |
|---|---|---|
| Android | `driver.getCurrentActivity()` (plus package) | Good - free, stable |
| Android (single-activity Compose/Fragment apps) | Every screen reports the same activity | Useless alone - needs the app to expose a name |
| iOS | No equivalent API | Needs the app to expose a name |

The reliable, cross-platform answer: **have the app expose the screen name as an
accessibility identifier on its root container**, e.g. `screen:cart`,
`screen:checkout-payment`. Then:

1. The capture reads that identifier and records it as `screen`.
2. The same identifier doubles as an anchor for step definitions.
3. Accessibility identifiers are also what makes the app testable at all, so
   this is not test-only scaffolding.

If the app cannot be changed, fall back in this order: Android activity name →
visible navigation-bar title → a name the step definition sets explicitly
(`world.setScreen("cart")`). Tell the user which fallback you used and how
reliable the resulting diagram is; a diagram built on nav-bar titles breaks when
the copy changes.

## 5. TypeScript / JavaScript

The runner, `cucumber.mjs`, results and reports are unchanged - see
`typescript.md`. Only the driver differs.

```bash
npm i -D webdriverio
```

`features/support/mobile-env.ts`:

```typescript
export const mobile = {
  driverName: process.env.BDD_DRIVER ?? 'playwright',
  platform: (process.env.BDD_PLATFORM ?? 'android').toLowerCase(),
  serverUrl: process.env.BDD_APPIUM_URL ?? 'http://127.0.0.1:4723',
  deviceName: process.env.BDD_DEVICE_NAME,
  platformVersion: process.env.BDD_PLATFORM_VERSION,
  udid: process.env.BDD_UDID,
  app: process.env.BDD_APP,
  appPackage: process.env.BDD_APP_PACKAGE,
  appActivity: process.env.BDD_APP_ACTIVITY,
  bundleId: process.env.BDD_BUNDLE_ID,
  browserName: process.env.BDD_BROWSER_NAME,
  noReset: process.env.BDD_NO_RESET === '1',
};

export const isMobileLane = mobile.driverName === 'appium';
```

`features/support/appium-driver.ts`:

```typescript
import { remote, type Browser } from 'webdriverio';
import { mobile } from './mobile-env';

function capabilities(): Record<string, unknown> {
  const ios = mobile.platform === 'ios';
  const caps: Record<string, unknown> = {
    platformName: ios ? 'iOS' : 'Android',
    'appium:automationName': process.env.BDD_AUTOMATION_NAME ?? (ios ? 'XCUITest' : 'UiAutomator2'),
    'appium:deviceName': mobile.deviceName ?? (ios ? 'iPhone 15' : 'Android Emulator'),
    'appium:newCommandTimeout': 120,
    'appium:noReset': mobile.noReset,
  };
  if (mobile.platformVersion) caps['appium:platformVersion'] = mobile.platformVersion;
  if (mobile.udid) caps['appium:udid'] = mobile.udid;
  if (mobile.app) caps['appium:app'] = mobile.app;
  if (mobile.appPackage) caps['appium:appPackage'] = mobile.appPackage;
  if (mobile.appActivity) caps['appium:appActivity'] = mobile.appActivity;
  if (mobile.bundleId) caps['appium:bundleId'] = mobile.bundleId;
  if (mobile.browserName) caps.browserName = mobile.browserName;
  if (ios) caps['appium:autoAcceptAlerts'] = true;
  else caps['appium:autoGrantPermissions'] = true;
  return caps;
}

export async function createAppiumDriver(): Promise<Browser> {
  const url = new URL(mobile.serverUrl);
  return remote({
    protocol: url.protocol.replace(':', ''),
    hostname: url.hostname,
    port: Number(url.port || (url.protocol === 'https:' ? 443 : 4723)),
    path: url.pathname === '/' ? '/' : url.pathname,
    logLevel: 'warn',
    capabilities: capabilities(),
  });
}

/** Screen name for the flow map: app-provided identifier first, activity second. */
export async function currentScreen(driver: Browser): Promise<string> {
  try {
    const root = await driver.$('~screen-name');
    if (await root.isExisting()) {
      const value = await root.getAttribute(mobile.platform === 'ios' ? 'value' : 'content-desc');
      if (value) return value;
    }
  } catch { /* fall through */ }
  if (mobile.platform !== 'ios') {
    try { return await driver.getCurrentActivity(); } catch { /* fall through */ }
  }
  return 'unknown';
}
```

Extend the World from `typescript.md` with the mobile driver, so step
definitions never touch the driver factory directly:

```typescript
// features/support/world.ts - add to BddWorld
import type { Browser as AppiumBrowser } from 'webdriverio';

export class BddWorld extends World {
  // ...existing Playwright fields...
  /** Set by the Before hook in the mobile lane only. */
  mobile!: AppiumBrowser;
}
```

Hooks - the mobile branch of `features/support/hooks.ts`:

```typescript
Before(async function (this: BddWorld, { pickle }) {
  this.stepIndex = 0;
  this.scenarioSlug = slugify(pickle.name);
  if (isMobileLane) {
    this.mobile = await createAppiumDriver();
    return;                                  // no browser, no context, no page
  }
  /* ...existing Playwright branch... */
});

AfterStep(async function (this: BddWorld, { pickle, pickleStep, result }) {
  const common = {
    scenario: pickle.name,
    scenarioUri: pickle.uri,
    tags: (pickle.tags ?? []).map((t) => t.name),
    stepIndex: this.stepIndex++,
    keyword: String(pickleStep?.type ?? ''),
    step: pickleStep?.text ?? '',
    status: String(result.status).toLowerCase(),
    scenarioSlug: this.scenarioSlug,
  };
  if (isMobileLane) await captureMobileStep({ driver: this.mobile, ...common });
  else await captureStep({ page: this.page, ...common });
});

After(async function (this: BddWorld, { result }) {
  if (isMobileLane) {
    if (result?.status === Status.FAILED && this.mobile) {
      this.attach(Buffer.from(await this.mobile.takeScreenshot(), 'base64'), 'image/png');
    }
    await this.mobile?.deleteSession();
    return;
  }
  /* ...existing Playwright branch... */
});
```

`features/support/mobile-capture.ts`:

```typescript
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Browser } from 'webdriverio';
import { env } from './env';
import { mobile } from './mobile-env';
import { currentScreen } from './appium-driver';
import { slugify } from './flow-capture';

export async function captureMobileStep(input: {
  driver: Browser; scenario: string; scenarioUri?: string; tags: string[];
  stepIndex: number; keyword: string; step: string; status: string; scenarioSlug: string;
}): Promise<void> {
  if (!env.flowCapture || !input.driver) return;
  try {
    const shot = join(env.flowDir, input.scenarioSlug,
      `${String(input.stepIndex).padStart(3, '0')}-${slugify(input.step)}.png`);
    mkdirSync(dirname(shot), { recursive: true });
    writeFileSync(shot, Buffer.from(await input.driver.takeScreenshot(), 'base64'));

    const file = join(env.flowDir, 'flow.ndjson');
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify({
      scenario: input.scenario,
      scenarioUri: input.scenarioUri ?? null,
      tags: input.tags,
      stepIndex: input.stepIndex,
      keyword: input.keyword,
      step: input.step,
      status: input.status,
      screen: await currentScreen(input.driver),
      screenshot: shot,
      timestamp: new Date().toISOString(),
      platform: mobile.platform,
      driver: 'appium',
      device: mobile.deviceName ?? mobile.platform,
    }) + '\n');
  } catch (error) {
    console.warn('[bdd] mobile flow capture failed:', (error as Error).message);
  }
}
```

Step definitions use the same phrasing as the web lane, with a mobile
implementation selected by tag:

```typescript
// features/step_definitions/checkout.mobile.steps.ts
Given('I am on the {string} screen', async function (this: BddWorld, name: string) {
  await this.mobile.$(`~screen:${name}`).waitForDisplayed({ timeout: 15000 });
});

When('I sign in as {string}', async function (this: BddWorld, email: string) {
  await this.mobile.$('~login-email').setValue(email);
  await this.mobile.$('~login-password').setValue(process.env.BDD_TEST_PASSWORD ?? 'test-password');
  await this.mobile.$('~login-submit').click();
});
```

Two implementations of one step phrasing cannot both be loaded in one run, or
cucumber reports an ambiguous step. Keep the lanes in separate `import` globs
and select them in the cucumber profile (section 9).

## 6. Java

```xml
<dependency>
  <groupId>io.appium</groupId><artifactId>java-client</artifactId>
  <version>9.3.0</version><scope>test</scope>
</dependency>
```

```java
package com.example.bdd;

import io.appium.java_client.AppiumDriver;
import io.appium.java_client.android.AndroidDriver;
import io.appium.java_client.android.options.UiAutomator2Options;
import io.appium.java_client.ios.IOSDriver;
import io.appium.java_client.ios.options.XCUITestOptions;
import org.openqa.selenium.By;

import java.net.URL;
import java.time.Duration;

public final class AppiumContext {
    private static final ThreadLocal<AppiumDriver> DRIVER = new ThreadLocal<>();

    private AppiumContext() {
    }

    public static AppiumDriver driver() {
        return DRIVER.get();
    }

    static void openScenario() throws Exception {
        URL server = new URL(BddConfig.APPIUM_URL);
        AppiumDriver driver;
        if ("ios".equalsIgnoreCase(BddConfig.PLATFORM)) {
            XCUITestOptions options = new XCUITestOptions()
                    .setDeviceName(BddConfig.deviceNameOr("iPhone 15"))
                    .setAutoAcceptAlerts(true)
                    .setNewCommandTimeout(Duration.ofSeconds(120));
            if (BddConfig.APP != null) options.setApp(BddConfig.APP);
            if (BddConfig.BUNDLE_ID != null) options.setBundleId(BddConfig.BUNDLE_ID);
            if (BddConfig.PLATFORM_VERSION != null) options.setPlatformVersion(BddConfig.PLATFORM_VERSION);
            driver = new IOSDriver(server, options);
        } else {
            UiAutomator2Options options = new UiAutomator2Options()
                    .setDeviceName(BddConfig.deviceNameOr("Android Emulator"))
                    .setAutoGrantPermissions(true)
                    .setNoReset(BddConfig.NO_RESET)
                    .setNewCommandTimeout(Duration.ofSeconds(120));
            if (BddConfig.APP != null) options.setApp(BddConfig.APP);
            if (BddConfig.APP_PACKAGE != null) options.setAppPackage(BddConfig.APP_PACKAGE);
            if (BddConfig.APP_ACTIVITY != null) options.setAppActivity(BddConfig.APP_ACTIVITY);
            driver = new AndroidDriver(server, options);
        }
        driver.manage().timeouts().implicitlyWait(Duration.ofMillis(BddConfig.TIMEOUT));
        DRIVER.set(driver);
    }

    static void closeScenario() {
        AppiumDriver driver = DRIVER.get();
        if (driver != null) {
            driver.quit();
            DRIVER.remove();
        }
    }

    /** Screen name for the flow map. */
    public static String currentScreen() {
        AppiumDriver driver = DRIVER.get();
        if (driver == null) return "unknown";
        try {
            var root = driver.findElements(By.xpath("//*[@content-desc='screen-name' or @name='screen-name']"));
            if (!root.isEmpty()) {
                String value = root.get(0).getAttribute("content-desc");
                if (value == null) value = root.get(0).getAttribute("value");
                if (value != null && !value.isBlank()) return value;
            }
        } catch (RuntimeException ignored) {
            // fall through to the activity name
        }
        if (driver instanceof AndroidDriver android) {
            try {
                return android.currentActivity();
            } catch (RuntimeException ignored) {
                // fall through
            }
        }
        return "unknown";
    }
}
```

Add the mobile fields to `BddConfig` (`APPIUM_URL`, `PLATFORM`, `APP`,
`APP_PACKAGE`, `APP_ACTIVITY`, `BUNDLE_ID`, `PLATFORM_VERSION`, `NO_RESET`,
`DRIVER`) following the pattern already in `java.md`, then branch in `Hooks`:

```java
@Before
public void openDriver(Scenario scenario) throws Exception {
    if (BddConfig.isMobileLane()) AppiumContext.openScenario();
    else PlaywrightContext.openScenario();
}

@AfterStep
public void captureStep(Scenario scenario) {
    if (BddConfig.isMobileLane()) MobileFlowCapture.capture(scenario, AppiumContext.driver());
    else FlowCapture.capture(scenario, PlaywrightContext.page());
}
```

`MobileFlowCapture` mirrors `FlowCapture` from `java.md`, with two changes: the
screenshot comes from `driver.getScreenshotAs(OutputType.BYTES)` written with
`Files.write(...)`, and the record carries `"screen"` (from
`AppiumContext.currentScreen()`), `"platform"` and `"driver":"appium"` instead
of `"url"` and `"title"`.

## 7. Python

```bash
pip install Appium-Python-Client
```

```python
# tests/conftest.py - mobile lane additions
import base64
import os

import pytest
from appium import webdriver as appium_webdriver
from appium.options.android import UiAutomator2Options
from appium.options.ios import XCUITestOptions

DRIVER_NAME = os.environ.get("BDD_DRIVER", "playwright")
PLATFORM = os.environ.get("BDD_PLATFORM", "android").lower()
APPIUM_URL = os.environ.get("BDD_APPIUM_URL", "http://127.0.0.1:4723")
IS_MOBILE_LANE = DRIVER_NAME == "appium"


def _options():
    if PLATFORM == "ios":
        options = XCUITestOptions()
        options.device_name = os.environ.get("BDD_DEVICE_NAME", "iPhone 15")
        options.auto_accept_alerts = True
        if os.environ.get("BDD_BUNDLE_ID"):
            options.bundle_id = os.environ["BDD_BUNDLE_ID"]
    else:
        options = UiAutomator2Options()
        options.device_name = os.environ.get("BDD_DEVICE_NAME", "Android Emulator")
        options.auto_grant_permissions = True
        options.no_reset = os.environ.get("BDD_NO_RESET") == "1"
        if os.environ.get("BDD_APP_PACKAGE"):
            options.app_package = os.environ["BDD_APP_PACKAGE"]
        if os.environ.get("BDD_APP_ACTIVITY"):
            options.app_activity = os.environ["BDD_APP_ACTIVITY"]
    if os.environ.get("BDD_APP"):
        options.app = os.environ["BDD_APP"]
    if os.environ.get("BDD_PLATFORM_VERSION"):
        options.platform_version = os.environ["BDD_PLATFORM_VERSION"]
    if os.environ.get("BDD_UDID"):
        options.udid = os.environ["BDD_UDID"]
    options.new_command_timeout = 120
    return options


@pytest.fixture
def mobile_driver():
    """One Appium session per scenario, so no scenario inherits app state."""
    if not IS_MOBILE_LANE:
        pytest.skip("mobile lane not selected (set BDD_DRIVER=appium)")
    driver = appium_webdriver.Remote(APPIUM_URL, options=_options())
    driver.implicitly_wait(int(os.environ.get("BDD_TIMEOUT", "30000")) / 1000)
    yield driver
    driver.quit()


def current_screen(driver) -> str:
    """Screen name for the flow map: app identifier first, activity second."""
    try:
        from appium.webdriver.common.appiumby import AppiumBy

        found = driver.find_elements(AppiumBy.ACCESSIBILITY_ID, "screen-name")
        if found:
            value = found[0].get_attribute("content-desc") or found[0].get_attribute("value")
            if value:
                return value
    except Exception:
        pass
    if PLATFORM != "ios":
        try:
            return driver.current_activity
        except Exception:
            pass
    return "unknown"


def capture_mobile_step(driver, scenario, step, status: str, state: dict) -> None:
    if not FLOW_CAPTURE or driver is None:
        return
    try:
        index = state["step_index"]
        shot = FLOW_DIR / slugify(scenario.name) / f"{index:03d}-{slugify(step.name)}.png"
        shot.parent.mkdir(parents=True, exist_ok=True)
        shot.write_bytes(base64.b64decode(driver.get_screenshot_as_base64()))
        record = {
            "scenario": scenario.name,
            "scenarioUri": getattr(scenario.feature, "rel_filename", None),
            "scenarioLine": getattr(scenario, "line_number", None),
            "tags": sorted("@" + t for t in scenario.tags),
            "stepIndex": index,
            "keyword": step.keyword,
            "step": step.name,
            "status": status,
            "screen": current_screen(driver),
            "screenshot": str(shot),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "platform": PLATFORM,
            "driver": "appium",
            "device": os.environ.get("BDD_DEVICE_NAME", PLATFORM),
        }
        flow_file = FLOW_DIR / "flow.ndjson"
        flow_file.parent.mkdir(parents=True, exist_ok=True)
        with flow_file.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as error:
        print(f"[bdd] mobile flow capture failed: {error}")
```

In `pytest_bdd_after_step` / `pytest_bdd_step_error`, branch on
`IS_MOBILE_LANE` and call `capture_mobile_step(request.getfixturevalue("mobile_driver"), ...)`
instead of `_capture(...)`.

## 8. C# / .NET

```bash
dotnet add package Appium.WebDriver
```

Match the `Appium.WebDriver` major version to the Selenium version already in
the project - a mismatch fails at runtime with a missing-method error, not at
compile time.

```csharp
using OpenQA.Selenium.Appium;
using OpenQA.Selenium.Appium.Android;
using OpenQA.Selenium.Appium.Enums;
using OpenQA.Selenium.Appium.iOS;

namespace Bdd.Tests.Support;

public sealed class AppiumDriverFactory : IDisposable
{
    public AppiumDriver Driver { get; private set; } = null!;

    public void Initialize()
    {
        var ios = BddConfig.Platform.Equals("ios", StringComparison.OrdinalIgnoreCase);
        var options = new AppiumOptions
        {
            PlatformName = ios ? "iOS" : "Android",
            AutomationName = ios ? AutomationName.iOSXcuiTest : AutomationName.AndroidUIAutomator2,
            DeviceName = BddConfig.DeviceName ?? (ios ? "iPhone 15" : "Android Emulator"),
        };
        if (!string.IsNullOrEmpty(BddConfig.App)) options.App = BddConfig.App;
        if (!string.IsNullOrEmpty(BddConfig.PlatformVersion)) options.PlatformVersion = BddConfig.PlatformVersion;
        options.AddAdditionalAppiumOption("newCommandTimeout", 120);
        if (ios) options.AddAdditionalAppiumOption("autoAcceptAlerts", true);
        else
        {
            options.AddAdditionalAppiumOption("autoGrantPermissions", true);
            options.AddAdditionalAppiumOption("noReset", BddConfig.NoReset);
            if (!string.IsNullOrEmpty(BddConfig.AppPackage))
                options.AddAdditionalAppiumOption("appPackage", BddConfig.AppPackage);
            if (!string.IsNullOrEmpty(BddConfig.AppActivity))
                options.AddAdditionalAppiumOption("appActivity", BddConfig.AppActivity);
        }

        var server = new Uri(BddConfig.AppiumUrl);
        Driver = ios ? new IOSDriver(server, options) : new AndroidDriver(server, options);
        Driver.Manage().Timeouts().ImplicitWait = TimeSpan.FromMilliseconds(BddConfig.Timeout);
    }

    /// <summary>Screen name for the flow map: app identifier first, activity second.</summary>
    public string CurrentScreen()
    {
        try
        {
            var root = Driver.FindElements(MobileBy.AccessibilityId("screen-name"));
            if (root.Count > 0)
            {
                var value = root[0].GetAttribute("content-desc") ?? root[0].GetAttribute("value");
                if (!string.IsNullOrWhiteSpace(value)) return value;
            }
        }
        catch (Exception) { /* fall through to the activity name */ }

        if (Driver is AndroidDriver android)
        {
            try { return android.CurrentActivity; } catch (Exception) { /* fall through */ }
        }
        return "unknown";
    }

    public void Dispose() => Driver?.Quit();
}
```

Register it the way `PlaywrightDriver` is registered in `dotnet.md` (Reqnroll
context injection, one instance per scenario), and branch in `Hooks` on
`BddConfig.IsMobileLane`.

## 9. Running the two lanes from one set of feature files

Tag by lane so each job runs its own suite:

```gherkin
@web @REQ-1042
Scenario: Pay with a valid credit card on the website

@mobile @android @REQ-1042
Scenario: Pay with a valid credit card in the Android app
```

Both scenarios may carry the same requirement tag - the coverage report then
shows the requirement covered on both platforms, which is usually what a
stakeholder wants to see.

When the *same* scenario must run on both lanes, keep one scenario and two step
definition sets, selected by the runner profile. cucumber-js profiles:

```javascript
// cucumber.mjs
const shared = {
  // No `paths` key: it would override a path given on the command line, so
  // `cucumber-js features/one.feature` would silently run everything. The
  // default is already `features/**/*.feature`.
  format: ['summary', 'message:bdd-artifacts/cucumber.ndjson'],
};

export default {                       // web lane
  ...shared,
  import: ['./tsx-register.mjs', 'features/support/**/*.ts', 'features/step_definitions/web/**/*.ts'],
  tags: 'not @mobile and not @wip',
};

export const mobile = {                // BDD_DRIVER=appium npx cucumber-js -p mobile
  ...shared,
  import: ['./tsx-register.mjs', 'features/support/**/*.ts', 'features/step_definitions/mobile/**/*.ts'],
  format: ['summary', 'message:bdd-artifacts/cucumber-mobile.ndjson'],
  tags: 'not @web and not @wip',
};
```

Loading both step definition directories in one run makes every shared step
phrasing ambiguous - keep them separate. Java: two `@Suite` runner classes with
different `cucumber.glue`. Python: separate step_defs packages selected by
`-p` / markers. .NET: separate assemblies or `[Scope(Tag = "mobile")]` on the
bindings.

```bash
# web lane
npx cucumber-js
# mobile lane, Android emulator
BDD_DRIVER=appium BDD_PLATFORM=android BDD_APP=./app/build/outputs/apk/debug/app-debug.apk \
  BDD_FLOW_CAPTURE=1 npx cucumber-js -p mobile
# mobile lane, iOS simulator
BDD_DRIVER=appium BDD_PLATFORM=ios BDD_APP=./build/App.app BDD_DEVICE_NAME="iPhone 15" \
  npx cucumber-js -p mobile
```

Keep the two lanes' results in separate files. One file per lane is what lets a
scenario that passes on the web and fails on mobile be seen as two results
rather than one overwriting the other - the results file is overwritten by every
run, so a shared path silently loses a lane.

## 10. Locators and gestures

**Accessibility id is the only locator worth building on**: it is the same
strategy name on both platforms (`~id` in WebdriverIO,
`AppiumBy.ACCESSIBILITY_ID`, `MobileBy.AccessibilityId`), it survives layout
changes, and it is what screen readers use - so adding it improves the product.
Android maps it to `contentDescription`, iOS to `accessibilityIdentifier`.

Avoid: XPath over the whole tree (slow and brittle on both platforms), and
coordinate taps (break on every device size).

Platform-specific fallbacks, when the app cannot be changed:

- Android: `-android uiautomator` with `UiSelector`.
- iOS: `-ios predicate string` or `-ios class chain`.

Gestures are Appium `execute_script` extensions or W3C actions:

```javascript
await driver.execute('mobile: scrollGesture', {
  left: 100, top: 100, width: 200, height: 400, direction: 'down', percent: 1.0,
});
await driver.execute('mobile: swipe', { elementId, direction: 'left' });   // iOS
```

Never `driver.pause()` as a wait. Wait for the element or state the step is about.

## 11. Hybrid apps and WebViews

A hybrid screen is native chrome around a WebView. Switch contexts to interact
with the web content:

```javascript
const contexts = await driver.getContexts();          // ['NATIVE_APP', 'WEBVIEW_com.example.shop']
await driver.switchContext(contexts.find((c) => c.startsWith('WEBVIEW')));
const url = await driver.getUrl();                     // now meaningful
await driver.switchContext('NATIVE_APP');
```

When a capture happens in a WebView context, record **both** `screen` (the
native host screen) and `url` (the WebView location). The flow map prefers `url`
when present, so hybrid flows appear as web pages inside a native journey - note
this in the report so the reader is not surprised.

Android WebView debugging needs a matching Chromedriver;
`appium:chromedriverAutodownload: true` lets Appium fetch it.

## 12. CI

- **Android**: works on Linux runners with a KVM-enabled image. On GitHub
  Actions, `reactivecircus/android-emulator-runner` starts an AVD. Budget several
  minutes for boot before the first scenario.
- **iOS**: requires a macOS runner. Simulators only; real devices need a device
  farm.
- Start the Appium server as a background step (`appium --log appium.log &`) and
  wait for `http://127.0.0.1:4723/status` to answer before running the suite.
- Publish `bdd-artifacts/` as a build artifact; mobile screenshots are the only
  evidence available after a runner is torn down.
- Device farms (BrowserStack, Sauce Labs, AWS Device Farm) are drop-in: change
  `BDD_APPIUM_URL` and add the vendor's capabilities. Ask before sending an app
  binary to a third-party service - it leaves the user's infrastructure.

## 13. Pitfalls

- **Session startup dominates the run.** One session per scenario is correct but
  slow; parallelize across devices rather than reusing sessions, and tell the
  user the wall-clock cost before they wire it into a pre-commit hook.
- **`noReset: true` breaks scenario independence.** Only with explicit opt-in.
- **iOS real devices need signing.** If the user has no provisioning profile,
  simulators are the only option - say so early rather than after an hour of
  WebDriverAgent errors.
- **Single-activity Android apps make the flow map useless** unless the app
  exposes screen names. Check this before promising a diagram.
- **Implicit waits plus explicit waits compound.** Pick explicit waits in step
  definitions and keep the implicit wait small.
- **A scenario that grants a permission changes device state.** Use
  `autoGrantPermissions` / `autoAcceptAlerts` so the permission dialog is not
  part of the scenario unless the requirement is about the dialog.
- **App version drift.** Record the app build id in the capture record
  (`buildId`) so a flow map can be traced to the binary it came from.
