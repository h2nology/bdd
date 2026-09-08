# This template is English so the placeholders read clearly. Write the real file
# in the team's language: put `# language: zh-CN` (or zh-TW / ja) on the first
# line and use that dialect's keywords throughout. Tags stay English either way.
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
    Example: <Case that illustrates the rule>
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
