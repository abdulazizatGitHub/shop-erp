# ADR-0013 — Multi-unit selling

Status: ACCEPTED
Date: 2026-08-28

## Decision

Items may be sold in a unit different from their stock unit.
Two conversion types are supported:

Type 1 — Fixed system conversions.
Standard physical conversions that never change per item.
Stored in a new uom_conversion table.
Examples: 1 liter = 1000 ml, 1 kg = 1000 g, 1 foot = 12 inches.
Managed by the owner from the settings UI (Phase 4+).
Seeded with the most common conversions at bootstrap.

Type 2 — Item-specific conversions.
Conversions that depend on the specific item variant.
Stored as alt_uom_id + alt_uom_factor_milli on the item row.
Examples: 1 kg of 1/4 inch copper pipe = X feet (varies by
pipe specification). Factor is set per item at item creation
or import time.

## Schema changes (implemented as migrations this phase)

Migration A — uom_conversion table:
CREATE TABLE uom_conversion (
id TEXT PRIMARY KEY,
tenant_id TEXT NOT NULL REFERENCES tenant(id),
from_uom_id TEXT NOT NULL REFERENCES uom(id),
to_uom_id TEXT NOT NULL REFERENCES uom(id),
factor_milli INTEGER NOT NULL,
-- how many to_uom milli-units per 1 from_uom unit
-- e.g. liter->ml: factor_milli = 1000000
-- (1 liter = 1000 ml, stored as 1000 * 1000)
UNIQUE (tenant_id, from_uom_id, to_uom_id)
)

Migration B — item table additions:
alt_uom_id TEXT REFERENCES uom(id) -- nullable
alt_uom_factor_milli INTEGER -- nullable
-- how many stock_uom milli-units per 1 alt_uom unit
-- e.g. copper pipe stocked in kg, sold by the foot: if 1 foot
-- of this pipe weighs 0.305 kg, alt_uom_factor_milli = 305
-- (milli-kg per foot). Same direction as the existing
-- item.purchase_to_stock_factor column (0001_init.sql: "buy 1
-- Cylinder ... factor = 11300" = milli-stock-units per 1
-- purchase-unit) — alt_uom_factor_milli follows the identical
-- convention, not its inverse.
-- If you only know the inverse ratio (e.g. "1 kg ~= 3.28 feet
-- of this pipe"), divide 1000 by that number to get the
-- factor: 1000 / 3.28 ~= 305.
-- NULL means item sells in stock_uom only

Migration C — sale_line table additions:
sale_uom_id TEXT REFERENCES uom(id) -- nullable
sale_to_stock_factor INTEGER -- nullable
-- copied from item.alt_uom_factor_milli at time of sale
-- NULL means sale happened in stock_uom (existing behavior)

## Stock quantity computation in createSale

Current (unchanged when sale_uom_id IS NULL):
stock_qty_milli = input_qty_milli

New (when sale_uom_id IS NOT NULL):
stock_qty_milli = Math.round(
(input_qty_milli * sale_to_stock_factor) / 1000
)
This is INTEGER arithmetic. No float stored. The Math.round
is the only permitted rounding step.

sale_line stores:
quantity — qty in the sale_uom (what customer bought)
sale_uom_id — the unit the customer bought in
sale_to_stock_factor — conversion factor used
stock_movement.quantity — always in stock_uom milli-units

## Item import CSV additions

Two optional columns added to the item import template:
Alt Unit — name of the alternative selling UoM (must match
a uom.name in the database exactly)
Alt Factor — conversion factor: how many stock_uom units
per 1 alt_uom unit (decimal, e.g. 0.305 for a
copper pipe stocked in kg where 1 foot weighs
0.305 kg — the same direction as Migration B's
alt_uom_factor_milli, not its inverse)
Stored as Math.round(factor * 1000) milli-units.
If both blank: item sells in stock_uom only. No alt unit.
If one is present and the other absent: reject the row.

## Reason

Multiple item categories are sold in two different units
depending on customer and context. Copper pipe sells primarily
in feet but occasionally in kg. Compressor oil sells in liters
or ml. Welding rod sells in kg or pieces. Forcing the salesman
to manually convert and enter stock units creates errors and
slows the 30-second sale requirement. The system handles
conversion transparently.

## Correction against the original draft of this ADR

The phase-kickoff draft's own worked examples ("1 kg = 3280
milli-feet (3.28 feet)" in Migration B; "3.28 for 1 kg of copper
pipe = 3.28 feet" in the CSV section) contradicted the field they
were illustrating. Both fields are defined as "how many stock_uom
milli-units per 1 alt_uom unit" — but a value of 3.28 (or 3280
milli-units) is the _feet-per-kg_ ratio, the inverse direction. Working
the `createSale` formula backwards against the draft's own numbers
confirms this: `Math.round((input_qty_milli * sale_to_stock_factor) /
1000)` with `sale_to_stock_factor = 3280` and a 10-foot sale
(`input_qty_milli = 10_000`) yields `32,800,000` milli-kg — 32.8
tonnes of pipe for a 10-foot sale, which is nonsensical. The
corrected examples above (305 milli-kg per foot) are the direction
that makes the formula produce a sane result (10 feet -> 3.05 kg)
and matches the existing `item.purchase_to_stock_factor` column's
established convention (`0001_init.sql`'s own comment: "buy 1
Cylinder ... factor = 11300" = milli-stock-units per 1
purchase-unit). Caught while working out P3.5-4's hand-calculated
test values, before any migration was written — recorded here rather
than silently fixed, per CLAUDE.md Golden Rule 6.

## Note on existing conventions this touches

`packages/core/src/import/item-columns.ts`'s `ITEM_COLUMNS` already
has a `Purchase Unit` / `Units per Purchase Unit` pair with the
identical "both present or both absent" validation shape this ADR's
`Alt Unit` / `Alt Factor` pair needs (see
`packages/core/src/import/item-import.ts` lines 165-195) — P3.5-3c
follows that existing pattern rather than inventing a new one.
