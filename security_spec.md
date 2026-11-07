# Security Specification - Fuel SpeedSheet

## 1. Data Invariants
- `fuel_records/{recordId}`:
  - Document ID must match `isValidId` (alphanumeric, hyphens, underscores up to 128 chars).
  - Must contain required fields: `vehicleNumber`, `fuelAmount`, `fuelUnit`, `couponNumber`, `date`, `fuelType`, `ratePerUnit`, `totalCost`.
  - Strictly typed: `fuelAmount` > 0 and <= 10000, `fuelUnit` in ['L', 'gal'], `date` strictly `YYYY-MM-DD`.
  - Rate per unit and total cost must be non-negative numbers within valid bounds.
  - Ghost keys outside the schema are strictly rejected.
- `settings/{settingId}`:
  - Global shared settings (e.g., `settings/general`) holding current fuel rates and unit configurations.
  - Must maintain valid decimal rates for Diesel and Petrol and valid units.

## 2. Dirty Dozen Payloads Handled
1. Record with empty vehicle number -> rejected (minimum 3 characters).
2. Record with negative fuel amount -> rejected (`fuelAmount > 0`).
3. Record with invalid unit (e.g. "kg") -> rejected (`fuelUnit in ['L', 'gal']`).
4. Record with malformed date (e.g. "yesterday") -> rejected (must match `^\d{4}-\d{2}-\d{2}$`).
5. Record with ghost keys (`isVerified: true`, `backdoor: "admin"`) -> rejected (`keys().hasOnly(...)`).
6. Record with oversized coupon number (> 40 chars) -> rejected (`couponNumber.size() <= 40`).
7. Record with 1MB injection string into ID -> rejected (`isValidId(recordId)` enforces <= 128 chars).
8. Record with negative ratePerUnit -> rejected (`ratePerUnit > 0`).
9. Record with negative totalCost -> rejected (`totalCost >= 0`).
10. Settings with 0 or negative diesel rate -> rejected (`dieselRate > 0`).
11. Settings with unrecognized volume unit -> rejected (`defaultUnit in ['L', 'gal']`).
12. Arbitrary write to unauthorized collection (`/users`, `/admin`, `/secrets`) -> default-deny catchall blocks.
