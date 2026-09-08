# Java: cucumber-jvm + Playwright for Java

Verified against cucumber-jvm 7.x, JUnit Platform 1.10+, and
`com.microsoft.playwright:playwright` 1.4x. Confirm the latest versions before
pinning; the coordinates below use properties so they are easy to bump.
> **Lane**: this file is the **web lane** - cucumber + Playwright against a
> browser. Native/hybrid mobile apps and real devices are the mobile lane:
> `appium.md`. Responsive web at a phone viewport stays here: `responsive-web.md`.


## 1. Dependencies

### Maven (`pom.xml`)

```xml
<properties>
  <maven.compiler.release>17</maven.compiler.release>
  <cucumber.version>7.20.1</cucumber.version>
  <junit.jupiter.version>5.11.3</junit.jupiter.version>
  <playwright.version>1.49.0</playwright.version>
</properties>

<dependencies>
  <dependency>
    <groupId>io.cucumber</groupId><artifactId>cucumber-java</artifactId>
    <version>${cucumber.version}</version><scope>test</scope>
  </dependency>
  <dependency>
    <groupId>io.cucumber</groupId><artifactId>cucumber-junit-platform-engine</artifactId>
    <version>${cucumber.version}</version><scope>test</scope>
  </dependency>
  <dependency>
    <groupId>org.junit.platform</groupId><artifactId>junit-platform-suite</artifactId>
    <version>1.11.3</version><scope>test</scope>
  </dependency>
  <dependency>
    <groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId>
    <version>${junit.jupiter.version}</version><scope>test</scope>
  </dependency>
  <dependency>
    <groupId>com.microsoft.playwright</groupId><artifactId>playwright</artifactId>
    <version>${playwright.version}</version><scope>test</scope>
  </dependency>
  <dependency>
    <groupId>org.assertj</groupId><artifactId>assertj-core</artifactId>
    <version>3.26.3</version><scope>test</scope>
  </dependency>
</dependencies>

<build>
  <plugins>
    <plugin>
      <groupId>org.apache.maven.plugins</groupId><artifactId>maven-surefire-plugin</artifactId>
      <version>3.5.2</version>
    </plugin>
  </plugins>
</build>
```

Install the browsers once:

```bash
mvn -q exec:java -Dexec.mainClass=com.microsoft.playwright.CLI -Dexec.args="install chromium" -Dexec.classpathScope=test
```

### Gradle (`build.gradle.kts`)

```kotlin
dependencies {
    testImplementation("io.cucumber:cucumber-java:7.20.1")
    testImplementation("io.cucumber:cucumber-junit-platform-engine:7.20.1")
    testImplementation("org.junit.platform:junit-platform-suite:1.11.3")
    testImplementation("org.junit.jupiter:junit-jupiter:5.11.3")
    testImplementation("com.microsoft.playwright:playwright:1.49.0")
    testImplementation("org.assertj:assertj-core:3.26.3")
}

tasks.test {
    useJUnitPlatform()
    systemProperties(
        "cucumber.junit-platform.naming-strategy" to "long",
    )
}
```

## 2. Layout

```
src/test/resources/features/checkout.feature
src/test/resources/junit-platform.properties
src/test/java/com/example/bdd/RunCucumberTest.java
src/test/java/com/example/bdd/BddConfig.java
src/test/java/com/example/bdd/PlaywrightContext.java
src/test/java/com/example/bdd/CurrentStep.java
src/test/java/com/example/bdd/StepTracker.java
src/test/java/com/example/bdd/Hooks.java
src/test/java/com/example/bdd/FlowCapture.java
src/test/java/com/example/bdd/steps/CheckoutSteps.java
```

## 3. `junit-platform.properties`

```properties
cucumber.glue=com.example.bdd
cucumber.plugin=message:bdd-artifacts/cucumber.ndjson, html:bdd-artifacts/cucumber.html, com.example.bdd.StepTracker
cucumber.filter.tags=not @wip and not @manual
cucumber.publish.quiet=true
cucumber.execution.parallel.enabled=false
```

`message:` produces the ndjson that `coverage.cjs` reads. `StepTracker` is the
listener from section 6 - it must be registered as a plugin.

## 4. Runner - `RunCucumberTest.java`

```java
package com.example.bdd;

import org.junit.platform.suite.api.ConfigurationParameter;
import org.junit.platform.suite.api.IncludeEngines;
import org.junit.platform.suite.api.SelectClasspathResource;
import org.junit.platform.suite.api.Suite;

import static io.cucumber.junit.platform.engine.Constants.GLUE_PROPERTY_NAME;

@Suite
@IncludeEngines("cucumber")
@SelectClasspathResource("features")
@ConfigurationParameter(key = GLUE_PROPERTY_NAME, value = "com.example.bdd")
public class RunCucumberTest {
}
```

## 5. Environment contract - `BddConfig.java`

```java
package com.example.bdd;

public final class BddConfig {
    public static final String BASE_URL = env("BDD_BASE_URL", "http://localhost:3000");
    public static final String BROWSER = env("BDD_BROWSER", "chromium");
    public static final boolean HEADED = "1".equals(System.getenv("BDD_HEADED"));
    public static final double SLOWMO = Double.parseDouble(env("BDD_SLOWMO", "0"));
    public static final String DEVICE = System.getenv("BDD_DEVICE");
    public static final int TIMEOUT = Integer.parseInt(env("BDD_TIMEOUT", "30000"));
    public static final boolean FLOW_CAPTURE = "1".equals(System.getenv("BDD_FLOW_CAPTURE"));
    public static final String FLOW_DIR = env("BDD_FLOW_DIR", "bdd-artifacts/flow");
    public static final String TRACE = env("BDD_TRACE", "off");

    private BddConfig() {
    }

    private static String env(String key, String fallback) {
        String value = System.getenv(key);
        return value == null || value.isBlank() ? fallback : value;
    }
}
```

## 6. Step tracking - cucumber-jvm's missing piece

`@AfterStep` receives only the `Scenario`; it does **not** expose the step text.
Register a `ConcurrentEventListener` that records the step about to run, and read
it from the hook. `TestStepStarted` is emitted on the executing thread before the
step body runs, so a `ThreadLocal` is safe here.

```java
package com.example.bdd;

public final class CurrentStep {
    private static final ThreadLocal<String> KEYWORD = new ThreadLocal<>();
    private static final ThreadLocal<String> TEXT = new ThreadLocal<>();
    private static final ThreadLocal<Integer> INDEX = ThreadLocal.withInitial(() -> 0);

    private CurrentStep() {
    }

    static void set(String keyword, String text) {
        KEYWORD.set(keyword);
        TEXT.set(text);
    }

    static void resetIndex() {
        INDEX.set(0);
    }

    public static String keyword() {
        return KEYWORD.get() == null ? "" : KEYWORD.get().trim();
    }

    public static String text() {
        return TEXT.get() == null ? "" : TEXT.get();
    }

    public static int nextIndex() {
        int current = INDEX.get();
        INDEX.set(current + 1);
        return current;
    }
}
```

```java
package com.example.bdd;

import io.cucumber.plugin.ConcurrentEventListener;
import io.cucumber.plugin.event.EventPublisher;
import io.cucumber.plugin.event.PickleStepTestStep;
import io.cucumber.plugin.event.TestCaseStarted;
import io.cucumber.plugin.event.TestStepStarted;

public class StepTracker implements ConcurrentEventListener {
    @Override
    public void setEventPublisher(EventPublisher publisher) {
        publisher.registerHandlerFor(TestCaseStarted.class, event -> CurrentStep.resetIndex());
        publisher.registerHandlerFor(TestStepStarted.class, event -> {
            if (event.getTestStep() instanceof PickleStepTestStep step) {
                CurrentStep.set(step.getStep().getKeyword(), step.getStep().getText());
            }
        });
    }
}
```

## 7. Browser lifecycle - `PlaywrightContext.java`

`Playwright` and `Browser` are **not** thread-safe: one instance per thread.

```java
package com.example.bdd;

import com.microsoft.playwright.*;

public final class PlaywrightContext {
    private static final ThreadLocal<Playwright> PLAYWRIGHT = new ThreadLocal<>();
    private static final ThreadLocal<Browser> BROWSER = new ThreadLocal<>();
    private static final ThreadLocal<BrowserContext> CONTEXT = new ThreadLocal<>();
    private static final ThreadLocal<Page> PAGE = new ThreadLocal<>();

    private PlaywrightContext() {
    }

    public static Page page() {
        return PAGE.get();
    }

    public static BrowserContext context() {
        return CONTEXT.get();
    }

    static void openScenario() {
        if (PLAYWRIGHT.get() == null) {
            PLAYWRIGHT.set(Playwright.create());
            BROWSER.set(launch(PLAYWRIGHT.get()));
        }
        Browser.NewContextOptions options = new Browser.NewContextOptions()
                .setBaseURL(BddConfig.BASE_URL);
        MobileProfile.apply(options, BddConfig.DEVICE);
        CONTEXT.set(BROWSER.get().newContext(options));
        if (!"off".equals(BddConfig.TRACE)) {
            CONTEXT.get().tracing().start(new Tracing.StartOptions()
                    .setScreenshots(true).setSnapshots(true).setSources(true));
        }
        Page page = CONTEXT.get().newPage();
        page.setDefaultTimeout(BddConfig.TIMEOUT);
        PAGE.set(page);
    }

    static void closeScenario() {
        if (CONTEXT.get() != null) {
            CONTEXT.get().close();
            CONTEXT.remove();
        }
        PAGE.remove();
    }

    /** Called from a JVM shutdown hook: cucumber-jvm has no reliable AfterAll per thread. */
    static void shutdown() {
        if (BROWSER.get() != null) {
            BROWSER.get().close();
            BROWSER.remove();
        }
        if (PLAYWRIGHT.get() != null) {
            PLAYWRIGHT.get().close();
            PLAYWRIGHT.remove();
        }
    }

    private static Browser launch(Playwright playwright) {
        BrowserType.LaunchOptions options = new BrowserType.LaunchOptions()
                .setHeadless(!BddConfig.HEADED)
                .setSlowMo(BddConfig.SLOWMO);
        return switch (BddConfig.BROWSER) {
            case "firefox" -> playwright.firefox().launch(options);
            case "webkit" -> playwright.webkit().launch(options);
            default -> playwright.chromium().launch(options);
        };
    }
}
```

Playwright for Java has **no** `devices` registry (unlike Node, Python and .NET),
so viewport emulation is set field by field - see `responsive-web.md` for the
`MobileProfile` helper referenced above. For native Android/iOS apps use the
Appium lane (`appium.md`), which replaces `PlaywrightContext` with
`AppiumContext`.

## 8. Hooks - `Hooks.java`

```java
package com.example.bdd;

import io.cucumber.java.After;
import io.cucumber.java.AfterStep;
import io.cucumber.java.Before;
import io.cucumber.java.Scenario;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Tracing;

import java.nio.file.Path;
import java.nio.file.Paths;

public class Hooks {

    static {
        Runtime.getRuntime().addShutdownHook(new Thread(PlaywrightContext::shutdown));
    }

    @Before
    public void openBrowser(Scenario scenario) {
        PlaywrightContext.openScenario();
    }

    @AfterStep
    public void captureStep(Scenario scenario) {
        FlowCapture.capture(scenario, PlaywrightContext.page());
    }

    @After
    public void closeBrowser(Scenario scenario) {
        Page page = PlaywrightContext.page();
        if (scenario.isFailed() && page != null) {
            scenario.attach(page.screenshot(new Page.ScreenshotOptions().setFullPage(true)),
                    "image/png", "failure");
        }
        boolean keepTrace = "on".equals(BddConfig.TRACE)
                || ("retain-on-failure".equals(BddConfig.TRACE) && scenario.isFailed());
        if (!"off".equals(BddConfig.TRACE) && PlaywrightContext.context() != null) {
            Tracing.StopOptions stop = new Tracing.StopOptions();
            if (keepTrace) {
                Path target = Paths.get("bdd-artifacts/traces", FlowCapture.slugify(scenario.getName()) + ".zip");
                target.getParent().toFile().mkdirs();
                stop.setPath(target);
            }
            PlaywrightContext.context().tracing().stop(stop);
        }
        PlaywrightContext.closeScenario();
    }
}
```

## 9. Flow capture - `FlowCapture.java`

```java
package com.example.bdd;

import com.microsoft.playwright.Page;
import io.cucumber.java.Scenario;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.stream.Collectors;

public final class FlowCapture {

    private FlowCapture() {
    }

    public static String slugify(String value) {
        String slug = value.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        return slug.isEmpty() ? "x" : slug.substring(0, Math.min(60, slug.length()));
    }

    public static void capture(Scenario scenario, Page page) {
        if (!BddConfig.FLOW_CAPTURE || page == null) {
            return;
        }
        try {
            int index = CurrentStep.nextIndex();
            String slug = slugify(scenario.getName());
            Path shot = Paths.get(BddConfig.FLOW_DIR, slug,
                    String.format("%03d-%s.png", index, slugify(CurrentStep.text())));
            Files.createDirectories(shot.getParent());
            page.screenshot(new Page.ScreenshotOptions().setPath(shot));

            String tags = scenario.getSourceTagNames().stream()
                    .map(FlowCapture::jsonString).collect(Collectors.joining(","));
            String record = "{"
                    + "\"scenario\":" + jsonString(scenario.getName()) + ","
                    + "\"scenarioUri\":" + jsonString(scenario.getUri().toString()) + ","
                    + "\"scenarioLine\":" + scenario.getLine() + ","
                    + "\"tags\":[" + tags + "],"
                    + "\"stepIndex\":" + index + ","
                    + "\"keyword\":" + jsonString(CurrentStep.keyword()) + ","
                    + "\"step\":" + jsonString(CurrentStep.text()) + ","
                    + "\"status\":" + jsonString(scenario.getStatus().name().toLowerCase()) + ","
                    + "\"url\":" + jsonString(page.url()) + ","
                    + "\"title\":" + jsonString(page.title()) + ","
                    + "\"screenshot\":" + jsonString(shot.toString()) + ","
                    + "\"timestamp\":" + jsonString(Instant.now().toString()) + ","
                    + "\"device\":" + jsonString(BddConfig.DEVICE == null ? "desktop" : BddConfig.DEVICE)
                    + "}\n";

            Path file = Paths.get(BddConfig.FLOW_DIR, "flow.ndjson");
            Files.createDirectories(file.getParent());
            Files.writeString(file, record, StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException | RuntimeException e) {
            // Diagnostics only: never fail a scenario because a screenshot failed.
            System.err.println("[bdd] flow capture failed: " + e.getMessage());
        }
    }

    private static String jsonString(String value) {
        if (value == null) {
            return "null";
        }
        StringBuilder out = new StringBuilder("\"");
        for (char c : value.toCharArray()) {
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        return out.append('"').toString();
    }
}
```

`scenario.getStatus()` inside `@AfterStep` reflects the status so far, which is
exactly what the flow map needs: the step that broke the flow is marked failed.

## 10. Step definitions

```java
package com.example.bdd.steps;

import com.example.bdd.PlaywrightContext;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.assertions.PlaywrightAssertions;
import com.microsoft.playwright.options.AriaRole;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

public class CheckoutSteps {

    private Page page() {
        return PlaywrightContext.page();
    }

    @Given("I am on the {string} page")
    public void iAmOnPage(String name) {
        String route = switch (name) {
            case "cart" -> "/cart";
            case "checkout" -> "/checkout";
            case "home" -> "/";
            default -> throw new IllegalArgumentException("Unknown page: " + name);
        };
        page().navigate(route);
    }

    @When("I sign in as {string}")
    public void iSignInAs(String email) {
        page().navigate("/login");
        page().getByLabel("Email").fill(email);
        page().getByLabel("Password").fill(System.getenv().getOrDefault("BDD_TEST_PASSWORD", "test-password"));
        page().getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Sign in")).click();
    }

    @Then("I see the error {string}")
    public void iSeeTheError(String message) {
        PlaywrightAssertions.assertThat(page().getByRole(AriaRole.ALERT)).containsText(message);
    }
}
```

## 11. Run and verify

```bash
BDD_BASE_URL=http://localhost:8080 mvn test
BDD_FLOW_CAPTURE=1 BDD_DEVICE="iPhone 15" mvn test -Dcucumber.filter.tags='@smoke'   # responsive web
node "${CLAUDE_PLUGIN_ROOT}/scripts/coverage.cjs" src/test/resources/features \
  --results bdd-artifacts/cucumber.ndjson
```

Gradle: `./gradlew test` with the same environment variables.

## 12. Parallel execution

```properties
cucumber.execution.parallel.enabled=true
cucumber.execution.parallel.config.strategy=fixed
cucumber.execution.parallel.config.fixed.parallelism=4
```

The `ThreadLocal` design above is what makes this safe. `flow.ndjson` receives
interleaved lines from several threads; each line is written in one
`Files.writeString` append call, and `flow-map.cjs` re-groups by scenario.
