import { useEffect, useMemo, useRef, useState } from "react";

const MultiSelectDropdown = ({
  options = [],
  value = [],
  onChange = () => {},
  placeholder = "Selecteer…",
  disabled = false,
  maxChips = 1,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selected = Array.isArray(value) ? value : [];

  const selectedLabels = useMemo(() => {
    const set = new Set(selected);
    return options.filter((o) => set.has(o.value)).map((o) => o.label);
  }, [options, selected]);

  const toggleValue = (v) => {
    const set = new Set(selected);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    onChange(Array.from(set));
  };

  const clearAll = (e) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <div className="ms-root" ref={rootRef} style={{ opacity: disabled ? 0.6 : 1 }}>
      <button
        type="button"
        className="ms-trigger"
        onClick={() => !disabled && setOpen((s) => !s)}
      >
        <div className="ms-value">
          {selectedLabels.length === 0 ? (
            <span className="ms-placeholder">{placeholder}</span>
          ) : (
            <>
              {selectedLabels.slice(0, maxChips).map((txt) => (
                <span key={txt} className="ms-chip">
                  {txt}
                </span>
              ))}
              {selectedLabels.length > maxChips ? (
                <span className="ms-more">+{selectedLabels.length - maxChips}</span>
              ) : null}
            </>
          )}
        </div>

        {/* <div className="ms-actions">
          {selectedLabels.length > 0 ? (
            <span className="ms-clear" onClick={clearAll}>
              x
            </span>
          ) : null}
          <span className="ms-caret">{open ? "▲" : "▼"}</span>
        </div> */}
      </button>

      {open ? (
        <div className="ms-panel">
          {options.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={`ms-option ${checked ? "ms-option-checked" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleValue(opt.value)}
                />
                <span style={{ fontSize: 14 }}>{opt.label}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default MultiSelectDropdown;

