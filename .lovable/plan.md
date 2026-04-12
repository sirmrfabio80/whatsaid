

# Plan: Disable Pricing CTAs and Remove Credits Page

## Summary

Disable navigation on the three pricing card CTA buttons (they currently go to `/credits`), remove the Credits page entirely, and clean up all references to it.

## Changes

### 1. Disable pricing card CTA navigation (`src/pages/Pricing.tsx`)
- In `handleCta()`, replace `navigate("/credits")` with a no-op (e.g. `toast` saying "Coming soon" or simply `return`)
- The buttons remain visible but do nothing when clicked for authenticated users

### 2. Delete Credits page
- Delete `src/pages/Credits.tsx`

### 3. Remove Credits route (`src/App.tsx`)
- Remove the `import Credits` line and the `<Route path="/credits" ...>` entry

### 4. Remove Credits nav links (`src/components/Navbar.tsx`)
- Remove the `/credits` dropdown menu item (line ~102) and mobile nav link (line ~176)

### 5. Clean up pricing lib (`src/lib/pricing.ts`)
- Remove the `CREDIT_PACKS` export (no longer used anywhere)

### 6. Clean up locale files
- Remove `creditsPage.*` and `nav.credits` translation keys from `en.json`, `fr.json`, `it.json`

## Not modified
- Legal/compliance pages, footer, auth, database, edge functions — untouched

