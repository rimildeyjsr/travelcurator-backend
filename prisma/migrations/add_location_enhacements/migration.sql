-- Add new columns to locations table for enhanced location data
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "source" VARCHAR(50) DEFAULT 'manual';
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "external_id" VARCHAR(255);
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "last_updated" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "verified" BOOLEAN DEFAULT false;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "description" TEXT;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "locations_source_idx" ON "locations"("source");
CREATE INDEX IF NOT EXISTS "locations_external_id_idx" ON "locations"("external_id");
CREATE INDEX IF NOT EXISTS "locations_category_idx" ON "locations"("category");
CREATE INDEX IF NOT EXISTS "locations_coordinates_idx" ON "locations"("latitude", "longitude");
CREATE INDEX IF NOT EXISTS "locations_last_updated_idx" ON "locations"("last_updated");

-- Add unique constraint for external_id + source combination
CREATE UNIQUE INDEX IF NOT EXISTS "locations_external_source_unique"
    ON "locations"("external_id", "source")
    WHERE "external_id" IS NOT NULL;

-- Add comment explaining the metadata JSONB structure
COMMENT ON COLUMN "locations"."metadata" IS 'JSONB containing provider-specific data:
{
  "osm": { "id": "node/123", "tags": {...} },
  "google": { "place_id": "...", "rating": 4.5 },
  "hours": { "monday": "09:00-17:00" },
  "contact": { "phone": "+1-555-0123" },
  "features": ["wifi", "wheelchair_accessible"],
  "aiContext": { "moodRelevance": {...} }
}';