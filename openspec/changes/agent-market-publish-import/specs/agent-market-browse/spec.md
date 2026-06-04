## ADDED Requirements

### Requirement: User can browse all published agents

The system SHALL display all published agents in a browsable list, sorted by import count descending.

#### Scenario: Market list loads successfully
- **WHEN** user navigates to the Market tab
- **THEN** system displays a list of all published agents
- **THEN** each item shows: name, provider, model, creator name, import count, tags
- **THEN** items are sorted by import count (highest first)

#### Scenario: Loading state
- **WHEN** user navigates to Market tab and data is loading
- **THEN** system displays skeleton loading placeholders

#### Scenario: Empty market
- **WHEN** there are no published agents
- **THEN** system displays empty state message: "No agents in market yet"
- **THEN** system shows a suggestion to publish an agent

#### Scenario: Error state
- **WHEN** market list fails to load
- **THEN** system displays error message with retry button

### Requirement: User can search and filter market listings

The system SHALL support searching and filtering published agents by name, provider, and tags.

#### Scenario: Search by name
- **WHEN** user types a search query in the search bar
- **THEN** system filters listings whose name contains the query (case-insensitive)

#### Scenario: Filter by provider
- **WHEN** user selects a provider filter (Claude, OpenCode, Custom)
- **THEN** system only shows agents matching that provider

#### Scenario: Filter by tag
- **WHEN** user clicks on a tag
- **THEN** system filters listings containing that tag

### Requirement: User can view published agent detail

The system SHALL display a detail page for each published agent showing full configuration information.

#### Scenario: View published agent detail
- **WHEN** user clicks on a published agent in the market list
- **THEN** system displays: name, provider, model, system prompt, description, tags, creator, import count, publish date
- **THEN** system shows a prominent "Import Agent" button

#### Scenario: Loading state for detail
- **WHEN** user navigates to detail page and data is loading
- **THEN** system displays loading indicator

#### Scenario: Error state for detail
- **WHEN** published agent detail fails to load
- **THEN** system displays error message with option to go back to market list

#### Scenario: Non-existent published agent
- **WHEN** user navigates to a published agent that does not exist
- **THEN** system displays 404 message with link back to market list

### Requirement: Market tab navigation in agent page

The system SHALL add a "Market" tab alongside existing "All Agents" and "Contacts" tabs.

#### Scenario: Switch to Market tab
- **WHEN** user clicks "Market" tab in the agent list page
- **THEN** the view switches to show the market browsing interface
- **THEN** the "Market" tab is highlighted as active
