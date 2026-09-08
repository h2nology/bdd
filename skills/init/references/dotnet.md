# C# / .NET: Reqnroll + Microsoft.Playwright

Reqnroll is the maintained successor of SpecFlow; the binding attributes are
source-compatible, so an existing SpecFlow project migrates by swapping the
packages. Verified against Reqnroll 2.x, .NET 8, Microsoft.Playwright 1.4x.
> **Lane**: this file is the **web lane** - cucumber + Playwright against a
> browser. Native/hybrid mobile apps and real devices are the mobile lane:
> `appium.md`. Responsive web at a phone viewport stays here: `responsive-web.md`.


## 1. Dependencies

```bash
dotnet new nunit -n Bdd.Tests
cd Bdd.Tests
dotnet add package Reqnroll.NUnit          # or Reqnroll.xUnit / Reqnroll.MsTest
dotnet add package Microsoft.Playwright
dotnet add package FluentAssertions
dotnet build
pwsh bin/Debug/net8.0/playwright.ps1 install chromium
```

The `playwright.ps1` script only exists after the first build. On Linux/macOS
without PowerShell: `dotnet tool install --global Microsoft.Playwright.CLI`
then `playwright install chromium`.

## 2. Layout

```
Bdd.Tests/
  Features/
    Checkout.feature
  StepDefinitions/
    CheckoutSteps.cs
  Support/
    BddConfig.cs
    PlaywrightDriver.cs
    Hooks.cs
    FlowCapture.cs
    CucumberJsonWriter.cs
  reqnroll.json
  Bdd.Tests.csproj
```

`.feature` files inside the project are picked up by Reqnroll's MSBuild
generator automatically; no manual code-behind is required.

## 3. `reqnroll.json`

```json
{
  "$schema": "https://schemas.reqnroll.net/reqnroll-config-latest.json",
  "language": { "feature": "en" },
  "bindingCulture": { "name": "en-US" },
  "runtime": { "missingOrPendingStepsOutcome": "Error" }
}
```

`missingOrPendingStepsOutcome: Error` makes undefined steps fail the build
instead of silently passing - required for honest coverage numbers.

## 4. `Support/BddConfig.cs`

```csharp
namespace Bdd.Tests.Support;

public static class BddConfig
{
    public static string BaseUrl => Env("BDD_BASE_URL", "http://localhost:3000");
    public static string Browser => Env("BDD_BROWSER", "chromium");
    public static bool Headed => Environment.GetEnvironmentVariable("BDD_HEADED") == "1";
    public static float SlowMo => float.Parse(Env("BDD_SLOWMO", "0"));
    public static string? Device => Environment.GetEnvironmentVariable("BDD_DEVICE");
    public static int Timeout => int.Parse(Env("BDD_TIMEOUT", "30000"));
    public static bool FlowCapture => Environment.GetEnvironmentVariable("BDD_FLOW_CAPTURE") == "1";
    public static string FlowDir => Env("BDD_FLOW_DIR", "bdd-artifacts/flow");
    public static string Trace => Env("BDD_TRACE", "off");
    public static string ResultsFile => Env("BDD_RESULTS", "bdd-artifacts/cucumber.json");

    private static string Env(string key, string fallback)
    {
        var value = Environment.GetEnvironmentVariable(key);
        return string.IsNullOrWhiteSpace(value) ? fallback : value;
    }
}
```

## 5. `Support/PlaywrightDriver.cs`

Reqnroll's context injection creates one instance per scenario and disposes it
afterwards, which gives each scenario an isolated browser context.

```csharp
using Microsoft.Playwright;

namespace Bdd.Tests.Support;

public sealed class PlaywrightDriver : IAsyncDisposable
{
    private IPlaywright? _playwright;
    private IBrowser? _browser;
    private IBrowserContext? _context;
    private IPage? _page;

    public IPage Page => _page ?? throw new InvalidOperationException("Call InitializeAsync first");
    public IBrowserContext Context => _context!;

    public async Task InitializeAsync()
    {
        _playwright = await Playwright.CreateAsync();
        var launchOptions = new BrowserTypeLaunchOptions
        {
            Headless = !BddConfig.Headed,
            SlowMo = BddConfig.SlowMo,
        };
        _browser = BddConfig.Browser switch
        {
            "firefox" => await _playwright.Firefox.LaunchAsync(launchOptions),
            "webkit" => await _playwright.Webkit.LaunchAsync(launchOptions),
            _ => await _playwright.Chromium.LaunchAsync(launchOptions),
        };

        var contextOptions = new BrowserNewContextOptions { BaseURL = BddConfig.BaseUrl };
        if (!string.IsNullOrEmpty(BddConfig.Device))
        {
            if (!_playwright.Devices.TryGetValue(BddConfig.Device, out var profile))
                throw new ArgumentException($"Unknown BDD_DEVICE \"{BddConfig.Device}\"");
            contextOptions = profile.ToBrowserNewContextOptions();
            contextOptions.BaseURL = BddConfig.BaseUrl;
        }

        _context = await _browser.NewContextAsync(contextOptions);
        if (BddConfig.Trace != "off")
        {
            await _context.Tracing.StartAsync(new TracingStartOptions
            {
                Screenshots = true, Snapshots = true, Sources = true,
            });
        }
        _page = await _context.NewPageAsync();
        _page.SetDefaultTimeout(BddConfig.Timeout);
    }

    public async Task StopTracingAsync(bool keep, string name)
    {
        if (_context is null || BddConfig.Trace == "off") return;
        var options = new TracingStopOptions();
        if (keep)
        {
            Directory.CreateDirectory("bdd-artifacts/traces");
            options.Path = Path.Combine("bdd-artifacts/traces", $"{FlowCapture.Slugify(name)}.zip");
        }
        await _context.Tracing.StopAsync(options);
    }

    public async ValueTask DisposeAsync()
    {
        if (_context is not null) await _context.CloseAsync();
        if (_browser is not null) await _browser.CloseAsync();
        _playwright?.Dispose();
    }
}
```

Launching a browser per scenario is slower than reusing one. If the suite grows,
move `_playwright`/`_browser` into a `[BeforeTestRun]`-managed static holder and
keep only the context/page per scenario.

## 6. `Support/Hooks.cs`

```csharp
using Microsoft.Playwright;
using Reqnroll;

namespace Bdd.Tests.Support;

[Binding]
public class Hooks
{
    private readonly PlaywrightDriver _driver;
    private readonly ScenarioContext _scenario;
    private readonly FeatureContext _feature;
    private int _stepIndex;

    public Hooks(PlaywrightDriver driver, ScenarioContext scenario, FeatureContext feature)
    {
        _driver = driver;
        _scenario = scenario;
        _feature = feature;
    }

    [BeforeScenario(Order = 0)]
    public async Task OpenBrowser()
    {
        await _driver.InitializeAsync();
        _stepIndex = 0;
        CucumberJsonWriter.BeginScenario(_feature, _scenario);
    }

    [AfterStep]
    public async Task CaptureStep()
    {
        var info = _scenario.StepContext.StepInfo;
        var status = _scenario.TestError is null ? "passed" : "failed";
        CucumberJsonWriter.RecordStep(info, status, _scenario.TestError?.Message);
        await FlowCapture.CaptureAsync(_driver.Page, _feature, _scenario, info, status, _stepIndex++);
    }

    [AfterScenario]
    public async Task CloseBrowser()
    {
        var failed = _scenario.TestError is not null;
        if (failed)
        {
            var shot = await _driver.Page.ScreenshotAsync(new PageScreenshotOptions { FullPage = true });
            Directory.CreateDirectory("bdd-artifacts/failures");
            await File.WriteAllBytesAsync(
                Path.Combine("bdd-artifacts/failures",
                    $"{FlowCapture.Slugify(_scenario.ScenarioInfo.Title)}.png"), shot);
        }
        await _driver.StopTracingAsync(
            BddConfig.Trace == "on" || (BddConfig.Trace == "retain-on-failure" && failed),
            _scenario.ScenarioInfo.Title);
        CucumberJsonWriter.EndScenario();
    }

    [AfterTestRun]
    public static void WriteResults() => CucumberJsonWriter.Flush();
}
```

`ScenarioContext.TestError` inside `[AfterStep]` is non-null exactly when the
step that just ran threw - that is how the step status is derived.

## 7. `Support/FlowCapture.cs`

```csharp
using System.Text;
using System.Text.Json;
using Microsoft.Playwright;
using Reqnroll;

namespace Bdd.Tests.Support;

public static class FlowCapture
{
    private static readonly SemaphoreSlim Lock = new(1, 1);

    public static string Slugify(string value)
    {
        var chars = value.ToLowerInvariant()
            .Select(c => char.IsLetterOrDigit(c) ? c : '-')
            .ToArray();
        var slug = new string(chars);
        while (slug.Contains("--")) slug = slug.Replace("--", "-");
        slug = slug.Trim('-');
        return string.IsNullOrEmpty(slug) ? "x" : slug[..Math.Min(60, slug.Length)];
    }

    public static async Task CaptureAsync(
        IPage page, FeatureContext feature, ScenarioContext scenario,
        StepInfo step, string status, int index)
    {
        if (!BddConfig.FlowCapture) return;
        try
        {
            var slug = Slugify(scenario.ScenarioInfo.Title);
            var shotPath = Path.Combine(BddConfig.FlowDir, slug,
                $"{index:D3}-{Slugify(step.Text)}.png");
            Directory.CreateDirectory(Path.GetDirectoryName(shotPath)!);
            await page.ScreenshotAsync(new PageScreenshotOptions { Path = shotPath });

            var record = new
            {
                scenario = scenario.ScenarioInfo.Title,
                scenarioUri = feature.FeatureInfo.Title,
                scenarioLine = (int?)null,
                tags = scenario.ScenarioInfo.CombinedTags.Select(t => "@" + t).ToArray(),
                stepIndex = index,
                keyword = step.StepDefinitionType.ToString(),
                step = step.Text,
                status,
                url = page.Url,
                title = await page.TitleAsync(),
                screenshot = shotPath,
                timestamp = DateTime.UtcNow.ToString("o"),
                device = BddConfig.Device ?? "desktop",
            };

            var line = JsonSerializer.Serialize(record) + "\n";
            var file = Path.Combine(BddConfig.FlowDir, "flow.ndjson");
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            await Lock.WaitAsync();
            try
            {
                await File.AppendAllTextAsync(file, line, Encoding.UTF8);
            }
            finally
            {
                Lock.Release();
            }
        }
        catch (Exception error)
        {
            // Diagnostics only - a failed screenshot must not fail the scenario.
            Console.Error.WriteLine($"[bdd] flow capture failed: {error.Message}");
        }
    }
}
```

`scenarioUri` should be the feature **file** path so coverage can match on
uri+name. `FeatureContext` exposes the title, not the path; if the file names
differ from the titles, set `scenarioUri` to the known relative path
(`$"Features/{feature.FeatureInfo.Title}.feature"`) or leave it null - the
coverage matcher falls back to matching on scenario name alone.

## 8. `Support/CucumberJsonWriter.cs`

Reqnroll does not emit cucumber messages, so write legacy cucumber JSON, which
`coverage.cjs` parses natively (tags and per-step statuses included).

```csharp
using System.Text.Json;
using Reqnroll;

namespace Bdd.Tests.Support;

public static class CucumberJsonWriter
{
    private sealed class StepRecord
    {
        public string keyword { get; set; } = "";
        public string name { get; set; } = "";
        public Dictionary<string, object?> result { get; set; } = new();
    }

    private sealed class ScenarioRecord
    {
        public string type { get; set; } = "scenario";
        public string name { get; set; } = "";
        public int line { get; set; }
        public List<Dictionary<string, string>> tags { get; set; } = new();
        public List<StepRecord> steps { get; set; } = new();
    }

    private sealed class FeatureRecord
    {
        public string uri { get; set; } = "";
        public string name { get; set; } = "";
        public List<Dictionary<string, string>> tags { get; set; } = new();
        public List<ScenarioRecord> elements { get; set; } = new();
    }

    private static readonly object Gate = new();
    private static readonly Dictionary<string, FeatureRecord> Features = new();
    private static readonly ThreadLocal<ScenarioRecord?> Current = new();

    public static void BeginScenario(FeatureContext feature, ScenarioContext scenario)
    {
        var uri = $"Features/{feature.FeatureInfo.Title}.feature";
        var record = new ScenarioRecord
        {
            name = scenario.ScenarioInfo.Title,
            tags = scenario.ScenarioInfo.Tags.Select(t => new Dictionary<string, string> { ["name"] = "@" + t }).ToList(),
        };
        lock (Gate)
        {
            if (!Features.TryGetValue(uri, out var featureRecord))
            {
                featureRecord = new FeatureRecord
                {
                    uri = uri,
                    name = feature.FeatureInfo.Title,
                    tags = feature.FeatureInfo.Tags.Select(t => new Dictionary<string, string> { ["name"] = "@" + t }).ToList(),
                };
                Features[uri] = featureRecord;
            }
            featureRecord.elements.Add(record);
        }
        Current.Value = record;
    }

    public static void RecordStep(StepInfo info, string status, string? error)
    {
        var record = Current.Value;
        if (record is null) return;
        var step = new StepRecord
        {
            keyword = info.StepDefinitionType + " ",
            name = info.Text,
        };
        step.result["status"] = status;
        if (error is not null) step.result["error_message"] = error;
        lock (Gate) record.steps.Add(step);
    }

    public static void EndScenario() => Current.Value = null;

    public static void Flush()
    {
        lock (Gate)
        {
            if (Features.Count == 0) return;
            var file = BddConfig.ResultsFile;
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            File.WriteAllText(file, JsonSerializer.Serialize(
                Features.Values, new JsonSerializerOptions { WriteIndented = true }));
        }
    }
}
```

## 9. Step definitions

```csharp
using Bdd.Tests.Support;
using Microsoft.Playwright;
using Reqnroll;
using static Microsoft.Playwright.Assertions;

namespace Bdd.Tests.StepDefinitions;

[Binding]
public class CheckoutSteps
{
    private static readonly Dictionary<string, string> Routes = new()
    {
        ["cart"] = "/cart", ["checkout"] = "/checkout", ["home"] = "/",
    };

    private readonly PlaywrightDriver _driver;

    public CheckoutSteps(PlaywrightDriver driver) => _driver = driver;

    [Given("I am on the {string} page")]
    public async Task GivenIAmOnPage(string name)
    {
        if (!Routes.TryGetValue(name, out var route))
            throw new ArgumentException($"Unknown page \"{name}\" - add it to Routes");
        await _driver.Page.GotoAsync(route);
    }

    [When("I sign in as {string}")]
    public async Task WhenISignInAs(string email)
    {
        await _driver.Page.GotoAsync("/login");
        await _driver.Page.GetByLabel("Email").FillAsync(email);
        await _driver.Page.GetByLabel("Password").FillAsync(
            Environment.GetEnvironmentVariable("BDD_TEST_PASSWORD") ?? "test-password");
        await _driver.Page.GetByRole(AriaRole.Button, new() { Name = "Sign in" }).ClickAsync();
    }

    [Then("I see the error {string}")]
    public async Task ThenISeeTheError(string message)
    {
        await Expect(_driver.Page.GetByRole(AriaRole.Alert)).ToContainTextAsync(message);
    }
}
```

## 10. Run and verify

```bash
BDD_BASE_URL=http://localhost:5000 dotnet test
BDD_FLOW_CAPTURE=1 BDD_DEVICE="iPhone 15" dotnet test --filter "TestCategory=smoke"   # responsive web
node "${CLAUDE_PLUGIN_ROOT}/scripts/coverage.cjs" Features/ --results bdd-artifacts/cucumber.json
```

Gherkin tags become NUnit/xUnit categories, so `@smoke` filters as
`--filter "TestCategory=smoke"` (NUnit) or `--filter "Category=smoke"` (xUnit).

On Windows PowerShell, set env vars with `$env:BDD_DEVICE="iPhone 15"` before
`dotnet test`.

## 11. Non-English step text

A `# language: zh-CN` feature file needs step definitions that match its text.
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

```csharp
[Given(@"我的购物车中有 ""(.*)""，单价 (.*) 元")]
public async Task 购物车中有商品(string sku, decimal price) =>
    await _api.SeedCartAsync(sku, price);

[Then(@"订单总额为 (.*) 元")]
public async Task 订单总额为(decimal total) =>
    await Expect(_page.GetByTestId("order-total")).ToHaveTextAsync(total.ToString("F2"));
```

Reqnroll accepts both regular expressions and cucumber expressions; with regex the
escaping rules are the regex ones, so `(` and `)` always need escaping regardless
of language.

**Save the binding files as UTF-8 with BOM.** Without the BOM, `csc` may read them
as the system codepage on a non-UTF-8 machine and the attribute strings will not
match. Setting `<EnableDefaultItems>` or an `.editorconfig` `charset = utf-8-bom`
for `*.cs` keeps this stable across contributors.
