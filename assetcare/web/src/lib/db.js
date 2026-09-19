import { neon } from "@neondatabase/serverless";

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

function getSql() {
  if (!hasDatabase()) return null;
  return neon(process.env.DATABASE_URL);
}

export async function listAssets() {
  const sql = getSql();
  if (!sql) return null;
  return sql`
    SELECT id, name, category, department, location, custodian, status,
           value, service_due AS "serviceDue", risk
    FROM assets
    ORDER BY CASE risk WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Watch' THEN 3 ELSE 4 END, name
  `;
}

export async function createAsset(asset) {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql`
    INSERT INTO assets (id, name, category, department, location, custodian, status, value, service_due, risk)
    VALUES (${asset.id}, ${asset.name}, ${asset.category}, ${asset.department}, ${asset.location}, ${asset.custodian}, ${asset.status}, ${asset.value}, ${asset.serviceDue}, ${asset.risk})
    RETURNING id, name, category, department, location, custodian, status, value,
              service_due AS "serviceDue", risk
  `;
  return rows[0];
}
