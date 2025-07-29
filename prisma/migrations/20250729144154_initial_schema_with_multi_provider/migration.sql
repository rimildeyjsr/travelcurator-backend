/*
  Warnings:

  - You are about to drop the column `external_id` on the `locations` table. All the data in the column will be lost.
  - Made the column `source` on table `locations` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "locations_external_id_idx";

-- AlterTable
ALTER TABLE "locations" DROP COLUMN "external_id",
ADD COLUMN     "google_last_updated" TIMESTAMP(3),
ADD COLUMN     "google_place_id" VARCHAR(255),
ADD COLUMN     "merge_status" VARCHAR(50),
ADD COLUMN     "osm_id" VARCHAR(255),
ADD COLUMN     "osm_last_updated" TIMESTAMP(3),
ADD COLUMN     "price_level" INTEGER,
ADD COLUMN     "quality_score" DECIMAL(3,2),
ADD COLUMN     "rating" DECIMAL(2,1),
ADD COLUMN     "review_count" INTEGER,
ALTER COLUMN "source" SET NOT NULL;

-- CreateIndex
CREATE INDEX "locations_osm_id_idx" ON "locations"("osm_id");

-- CreateIndex
CREATE INDEX "locations_google_place_id_idx" ON "locations"("google_place_id");

-- CreateIndex
CREATE INDEX "locations_rating_idx" ON "locations"("rating");

-- CreateIndex
CREATE INDEX "locations_quality_score_idx" ON "locations"("quality_score");

-- CreateIndex
CREATE INDEX "locations_geo_source_idx" ON "locations"("latitude", "longitude", "source");

-- CreateIndex
CREATE INDEX "locations_category_rating_idx" ON "locations"("category", "rating");
