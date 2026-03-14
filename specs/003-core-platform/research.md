# Research: Core Platform Overhaul

## Topic: SQLite Column Rename Support
**Decision**: Use `ALTER TABLE users RENAME COLUMN email TO username`
**Rationale**: SQLite supports `ALTER TABLE RENAME COLUMN` since version 3.25.0 (2018-09-15). Node.js better-sqlite3 bundles SQLite 3.40+. Since we use `CREATE TABLE IF NOT EXISTS`, the schema creation handles fresh databases. For existing databases, we'll add a migration check.
**Alternatives Considered**: 
- Create new table with `username`, copy data, drop old table (unnecessary complexity)
- Add `username` column alongside `email` (dual-identity confusion)

## Topic: Recovery Key Entropy
**Decision**: 32-byte random hex (64 hex characters)
**Rationale**: Provides 256 bits of entropy. Combined with bcrypt storage (10 rounds) and single-use semantics, this is secure against brute-force. The key is long but hex-only characters are unambiguous.
**Alternatives Considered**:
- 16-byte key (128 bits — still secure but shorter margin)
- Base32 encoding (shorter but requires case-insensitive handling)
- Passphrase-style (user-friendly but variable entropy)

## Topic: Seed Data Gating
**Decision**: Check `process.env.SEED_DATA === 'true'` in `seedIfNeeded()`
**Rationale**: Minimal change to existing code. Tests that need seed data can set the env var or call seed explicitly. Production starts clean.
**Alternatives Considered**:
- Separate CLI seed command (over-engineering for current scale)
- Fixture files loaded by test harness (more test infrastructure needed)

## Topic: Admin Panel State Isolation
**Decision**: Use separate React components for each sub-view, rendered conditionally based on active tab state. Each component manages its own local state via useState.
**Rationale**: When a component is unmounted (tab switch), its local state is naturally destroyed. This provides state isolation without explicit reset logic.
**Alternatives Considered**:
- Single component with form reset logic (error-prone, the current bug source)
- useReducer with explicit state scoping (over-engineering)

## Topic: Overlay/Drawer Pattern
**Decision**: Use CSS-based overlay with fixed positioning on mobile viewports (< 768px). Backdrop is a semi-transparent div. Escape key and backdrop click dismiss.
**Rationale**: Pure CSS + minimal JS. No additional library needed. Matches existing Tailwind CSS usage.
**Alternatives Considered**:
- Headless UI Dialog component (adds dependency)
- Radix UI Sheet (adds dependency)
