# Placeholders are English here for legibility. In the real file, write the prose
# - names, descriptions and step text - in the team's language, and keep the
# keywords (Feature/Rule/Background/Scenario/Given/When/Then) and tags English.
# No `# language:` header is needed when the keywords stay English.
@<capability-tag> @REQ-<id>
Feature: <Capability, not a screen>
  As a <role>
  I want <capability>
  So that <business value>

  # Assumptions still unconfirmed with the business go here, with a date,
  # and are removed once answered.

  Background:
    Given <shared, incidental setup - no assertions>

  @REQ-<id> @smoke @ui
  Scenario: <Outcome, stated in domain language>
    Given <state that is already true>
    When <the single behaviour under test>
    Then <observable outcome>
    And <second observable outcome, e.g. what must NOT have happened>

  Rule: <A business rule that constrains this capability>

    @REQ-<id>
    Scenario: <Case that illustrates the rule>
      Given <state>
      When <behaviour>
      Then <outcome>

    @REQ-<id>
    Scenario Outline: <Same behaviour, "<varying>" data>
      Given <state>
      When <behaviour with "<input>">
      Then the result is "<result>"

      Examples:
        | input   | result   |
        | <value> | <value>  |
        | <value> | <value>  |
