# Web lane: responsive and viewport testing with Playwright

This is the **web** lane only: a real browser with a phone-sized viewport,
emulated touch and a mobile user agent. It answers "does the site work at this
breakpoint", and nothing more.

**Real mobile is the Appium lane.** Native apps, hybrid apps, WebViews, and
browsers on actual devices or emulators go through `appium.md`. Emulation is not
a device: it does not exercise the OS keyboard, real network behaviour, app
permission dialogs, or a specific vendor's WebView build. Be explicit with the
user about which of the two they are getting.

## Enabling it in a run

```bash
BDD_DEVICE="iPhone 15" npm run test:bdd
BDD_DEVICE="Pixel 7" mvn test
BDD_DEVICE="iPhone 15" pytest
BDD_DEVICE="Galaxy S9+" dotnet test
```

`BDD_DEVICE` is a **web-lane** variable (a Playwright device profile). The mobile
lane uses `BDD_DEVICE_NAME`, which is the Appium capability. Keep them distinct.

Tag scenarios that only make sense at a small viewport, and run them as their own
job:

```gherkin
@web @viewport:phone @REQ-1055
Scenario: The cart summary collapses into a drawer at phone width
```

```bash
BDD_DEVICE="iPhone 15" npm run test:bdd -- --tags '@viewport:phone'
```

## Where the profile is applied

On the **browser context**, not the page - it must be set at context creation,
so all templates apply it in the scenario `Before` hook.

| Language | API |
|---|---|
| TypeScript/JavaScript | `import { devices } from 'playwright'` then `browser.newContext({ ...devices['iPhone 15'] })` |
| Python | `playwright.devices["iPhone 15"]` spread into `browser.new_context(**profile)` |
| C#/.NET | `playwright.Devices["iPhone 15"].ToBrowserNewContextOptions()` |
| Java | **No device registry** - set the fields manually (see below) |

Listing the available names:

```bash
node -e "console.log(Object.keys(require('playwright').devices).join('\n'))"
python -c "from playwright.sync_api import sync_playwright;\
 p=sync_playwright().start(); print('\n'.join(p.devices))"
```

## Java: `MobileProfile` helper

Playwright for Java exposes no `devices` map, so the fields are set explicitly.
Viewport, touch and scale factor are enough for layout and interaction testing.
If the application sniffs the user agent, paste the exact UA string from
Playwright's device descriptor rather than inventing one:

```bash
node -e "console.log(JSON.stringify(require('playwright').devices['iPhone 15'], null, 2))"
```

```java
package com.example.bdd;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.options.ViewportSize;

import java.util.Map;

/** Viewport emulation for Playwright Java, which has no devices registry. */
public final class MobileProfile {

    private record Profile(int width, int height, double scale, boolean touch, boolean mobile) {
    }

    private static final Map<String, Profile> PROFILES = Map.of(
            "iPhone 15", new Profile(393, 659, 3, true, true),
            "iPhone SE", new Profile(320, 568, 2, true, true),
            "Pixel 7", new Profile(412, 839, 2.625, true, true),
            "Galaxy S9+", new Profile(320, 658, 4.5, true, true),
            "iPad Pro 11", new Profile(834, 1194, 2, true, true),
            "tablet", new Profile(768, 1024, 2, true, true)
    );

    private MobileProfile() {
    }

    static void apply(Browser.NewContextOptions options, String device) {
        if (device == null || device.isBlank()) {
            return;
        }
        Profile profile = PROFILES.get(device);
        if (profile == null) {
            throw new IllegalArgumentException(
                    "Unknown BDD_DEVICE \"" + device + "\". Known: " + PROFILES.keySet());
        }
        options.setViewportSize(new ViewportSize(profile.width(), profile.height()))
                .setDeviceScaleFactor(profile.scale())
                .setHasTouch(profile.touch())
                .setIsMobile(profile.mobile());
        // Set a user agent too when the app serves different markup per UA:
        // options.setUserAgent("<paste from Playwright's device descriptor>");
    }
}
```

Add `BDD_USER_AGENT` to the environment contract if UA-dependent behaviour needs
to vary per run.

## Gotchas

- **`isMobile` is Chromium-only.** Firefox and WebKit reject it, so `BDD_DEVICE`
  with `BDD_BROWSER=firefox` fails. Guard it: either force chromium when a
  device profile is set, or drop `isMobile` for non-chromium browsers - and say
  which you chose.
- **Touch vs click.** With `hasTouch`, use `tap()` where the app listens for
  touch events; `click()` still works for most UIs but produces no `touchstart`.
- **A deterministic viewport beats a device name** when the requirement is about
  a breakpoint. Set the viewport to the breakpoint width instead of guessing
  which phone happens to be that wide.
- **Device names are exact strings.** `"iphone 15"` is not `"iPhone 15"`; the
  templates fail loudly on an unknown name rather than silently running desktop.
- **Screenshots change size**, so a flow map mixes desktop and emulated shots.
  The capture record carries `device` and the report shows it as a chip; run the
  responsive suite separately when the report must stay readable.
- **Emulation proves nothing about the app.** If the user's question is "does our
  Android app work", this lane cannot answer it - go to `appium.md`.
