// Shared up/down reorder helper used by years/semesters/classes/sessions.
// Swaps sort_order with the adjacent sibling in the same scope (e.g. same
// year_id for semesters), so ordering stays contiguous without a
// fractional/gap-based scheme. Pass scopeColumn = null for a table with no
// real scope (e.g. years, which are the top level).
function reorder(db, table, scopeColumn, scopeValue, id, direction) {
  const scopeClause = scopeColumn ? `AND ${scopeColumn} = ?` : '';
  const scopeParams = scopeColumn ? [scopeValue] : [];

  const current = db
    .prepare(`SELECT id, sort_order FROM ${table} WHERE id = ? ${scopeClause}`)
    .get(id, ...scopeParams);
  if (!current) return false;

  const comparator = direction === 'up' ? '<' : '>';
  const order = direction === 'up' ? 'DESC' : 'ASC';

  const sibling = db
    .prepare(
      `SELECT id, sort_order FROM ${table}
       WHERE sort_order ${comparator} ? ${scopeClause}
       ORDER BY sort_order ${order} LIMIT 1`
    )
    .get(current.sort_order, ...scopeParams);

  if (!sibling) return false; // already at the edge

  const swap = db.transaction(() => {
    db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`).run(sibling.sort_order, current.id);
    db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`).run(current.sort_order, sibling.id);
  });
  swap();
  return true;
}

function nextSortOrder(db, table, scopeColumn, scopeValue) {
  const scopeClause = scopeColumn ? `WHERE ${scopeColumn} = ?` : '';
  const scopeParams = scopeColumn ? [scopeValue] : [];
  const row = db
    .prepare(`SELECT MAX(sort_order) AS maxOrder FROM ${table} ${scopeClause}`)
    .get(...scopeParams);
  return row && row.maxOrder !== null ? row.maxOrder + 1 : 0;
}

module.exports = { reorder, nextSortOrder };
