import React, { useId, useState } from "react";

// The "Where" field: a text input with suggestions in a list directly under it, at the field's width. Built in place of
// a native <datalist>, whose popup the browser draws and places (Chrome adds a dropdown arrow and can open it off to the
// side). Follows the accessible-autocomplete pattern: a combobox input, a listbox, arrow keys to move, Enter to pick,
// Escape to close. Free text still works: whatever is typed filters the jobs, a suggestion only fills it in.
const MAX = 8;

export default function PlaceAutocomplete({ id, value, onChange, options, describedBy, className }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const q = value.trim().toLowerCase();
  const matches = q
    ? options.filter((o) => o.toLowerCase().includes(q) && o.toLowerCase() !== q).sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q))).slice(0, MAX)
    : options.slice(0, MAX);
  const shown = open && matches.length > 0;

  const pick = (o) => {
    onChange(o);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && shown && active >= 0) {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === "Escape" && shown) {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className="place-ac">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        className={className}
        value={value}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <ul className="place-ac__list" id={listId} role="listbox" hidden={!shown}>
        {shown &&
          matches.map((o, i) => (
            <li
              key={o}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`place-ac__option${i === active ? " place-ac__option--active" : ""}`}
              // mousedown, not click: it fires before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseMove={() => setActive(i)}
            >
              {o}
            </li>
          ))}
      </ul>
    </div>
  );
}
