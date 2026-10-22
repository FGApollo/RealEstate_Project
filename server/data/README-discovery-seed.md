# Discovery sample data

The October 8, 2026 refresh corrected four inconsistent listing titles/categories,
added **10 rental samples for each of the six discovery categories** (60 total),
and refreshed every existing listing's thumbnail and gallery using photographs
of property in Ho Chi Minh City.

New listings are marked `[Mẫu]` and their descriptions state that they are sample
data. All replacement photographs are explicitly described as illustrations,
with their original source links. There are five sourced photographs per category;
these are reused across sample listings. Photo source locations are recorded in
`discoveryImages.json`. Original downloaded bytes are preserved in project storage.

The sample owner is a dedicated agent with a null password and an inactive account.
No passwords, contact details, reviews, verification claims, or user interactions
are fabricated. Sample prices and locations support browsing and filter testing.

## Applied corrections

| ID | Correction |
| --- | --- |
| 70 | Rename to `Phòng trọ làng đại học`; retain `Phòng Trọ` |
| 65 | Rename to `Chung cư Metro Tower`; change category to `Chung Cư` |
| 66 | Rename to `Chung cư Kim Oanh`; change category to `Chung Cư` |
| 61 | Rename to `Nhà ở của conculenmen`; retain `Nhà Ở` |

## Operations

Run from the project root with its configured Supabase environment:

```text
node server/scripts/seedDiscovery.js --prepare
node server/scripts/seedDiscovery.js --apply
node server/scripts/seedDiscovery.js --verify
```

`--prepare` downloads and validates photographs and snapshots existing fields and
gallery row IDs without modifying the database. `--apply` uses that snapshot,
checks for concurrent edits, uploads images to the existing `property-images`
bucket, and applies the planned changes. An operation journal and stable seed
keys allow resuming without adding the same 60 listings again. `--verify` is
read-only and checks corrections, category counts, sample metadata, galleries,
public image availability, and both public and ranked discovery feeds.

The ignored `.local/discovery-seed-20261008/` directory contains `before.json`,
`plan.json`, `journal.json`, `assets.json`, `verification.json`, and the downloaded
photographs. `before.json` preserves the original descriptions, titles, categories,
thumbnails, and gallery URLs for recovery. Original storage objects were retained.
