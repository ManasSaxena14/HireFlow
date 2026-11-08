-- Up Migration
-- A card on a person's job board can now follow their application to a company, so that
-- every move the company makes shows up on the board by itself.
ALTER TABLE tracked_applications
  ADD COLUMN company_application_id uuid REFERENCES applications (id) ON DELETE SET NULL;
CREATE UNIQUE INDEX tracked_applications_company_application
  ON tracked_applications (company_application_id) WHERE company_application_id IS NOT NULL;

-- Down Migration
DROP INDEX tracked_applications_company_application;
ALTER TABLE tracked_applications DROP COLUMN company_application_id;
