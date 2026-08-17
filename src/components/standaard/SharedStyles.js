// Shared read-only presentation for the standaard views, so the four tabs look
// like one panel rather than four pages that grew separately.

export const th = {
  background: '#eaf1fb',
  textAlign: 'left',
  padding: 8,
  borderBottom: '1px solid #d7e3ff',
  whiteSpace: 'nowrap',
};

export const td = { padding: 8, borderBottom: '1px solid #f2f2f2', verticalAlign: 'top' };
export const tdNum = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };

export const tableWrap = {
  marginTop: 12,
  marginBottom: 24,
  border: '1px solid #eee',
  borderRadius: 8,
  overflowX: 'auto',
  maxWidth: '100%',
};

export const tableStyle = { width: '100%', borderCollapse: 'collapse' };

export const note = { color: '#555', fontSize: 13, margin: '4px 0 0' };
// Sub-notes sit under their label, so they must be block-level: as a span they
// would run onto the end of the preceding text.
export const subNote = { ...note, display: 'block' };

export const badge = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 10,
  fontSize: 12,
  background: '#f4f4f4',
  marginLeft: 8,
};

// A flex item defaults to min-width:auto and so cannot shrink below its widest
// table; without this the page itself scrolls sideways instead of the table.
export const detailColumn = { flex: 1, minWidth: 0 };
export const listColumn = { listStyle: 'none', padding: 0, margin: 0, width: 260, flexShrink: 0 };
export const splitLayout = { display: 'flex', gap: 24, alignItems: 'flex-start' };

// Sits directly under the tab strip, which has no bottom margin of its own.
export const versionBar = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 12,
  flexWrap: 'wrap',
  margin: '16px 0 8px',
};

export const listItem = selected => ({
  cursor: 'pointer',
  padding: '8px 10px',
  borderRadius: 5,
  marginBottom: 4,
  background: selected ? '#f9b03b' : '#f4f4f4',
});
