import { cleanNumber, cx, formatDate, formatted } from "../lib/format";
import { Icon } from "./Icon";
import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from "react";

export function Button({
  children,
  onClick,
  variant = "secondary",
  icon,
  disabled = false,
  className = "",
  type = "button",
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  icon?: string;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      className={cx("button", `button-${variant}`, className)}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}
export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  min,
  max,
  step,
  suffix,
  multiline = false,
  inputMode,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  multiline?: boolean;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  const inputProps = {
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    placeholder,
    min,
    max,
    step,
    inputMode,
    "aria-label": label,
  };
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field-control">
        {multiline ? <textarea {...inputProps} rows={3} /> : <input {...inputProps} type={type} />}
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  );
}
export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Choice({
  title,
  description,
  selected,
  onClick,
  multi = false,
}: {
  title: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx("choice", selected && "choice-selected")}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="choice-copy">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
      <span className={cx("choice-indicator", multi && "choice-square")}>
        {selected && <Icon name="check" size={15} />}
      </span>
    </button>
  );
}
export function LocalBadge({ online }: { online: boolean }) {
  return (
    <span className={cx("local-badge", !online && "local-badge-offline")}>
      <i />
      {online ? "Solo en este dispositivo" : "Sin conexión"}
    </span>
  );
}
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-mark">
        <Icon name="activity" size={23} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function DialogFrame({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const sheetRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(
      () => sheetRef.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus(),
      0,
    );
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = [
        ...sheetRef.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeys);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", handleKeys);
      previousFocus?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={sheetRef}
        className={cx("sheet", wide && "sheet-wide")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function NumericPad({
  config,
  onClose,
}: {
  config: { title: string; value: number; unit: string; step: number; onSave: (value: number) => void } | null;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    setValue(config?.value ? String(config.value) : "");
  }, [config]);
  if (!config) return null;
  const add = (digit: string) => setValue((current) => (current.length > 10 ? current : `${current}${digit}`));
  const numericValue = cleanNumber(value);
  const finish = () => {
    config.onSave(numericValue);
    onClose();
  };
  return (
    <DialogFrame title={config.title} onClose={onClose}>
      <div className="numeric-pad">
        <label className="pad-display">
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value.replace(/[^0-9.,]/g, ""))}
            autoFocus
            aria-label={config.title}
          />
          <span>{config.unit}</span>
        </label>
        <div className="pad-steps">
          {(config.unit === "reps" ? [1] : [...new Set([config.step, 1, 2.5, 5])]).map((step) => (
            <div key={step} className="pad-step-group">
              <span>±{formatted(step, 1)}</span>
              <button
                type="button"
                onClick={() => setValue(String(Math.max(0, numericValue - step)))}
                aria-label={`Restar ${step}`}
              >
                −
              </button>
              <button type="button" onClick={() => setValue(String(numericValue + step))} aria-label={`Sumar ${step}`}>
                +
              </button>
            </div>
          ))}
        </div>
        <div className="digit-grid">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"].map((digit) => (
            <button
              type="button"
              key={digit}
              onClick={() =>
                digit === "⌫"
                  ? setValue((current) => current.slice(0, -1))
                  : digit === ","
                    ? setValue((current) => (current.includes(",") || current.includes(".") ? current : `${current},`))
                    : add(digit)
              }
            >
              {digit}
            </button>
          ))}
        </div>
        <div className="sheet-actions">
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={finish}>
            Guardar valor
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}
export function PhotoTile({
  photo,
  onDelete,
}: {
  photo: { id: string; at: number; label: string; blob?: Blob };
  onDelete: () => void;
}) {
  const [source, setSource] = useState("");
  useEffect(() => {
    if (!photo.blob) return;
    const url = URL.createObjectURL(photo.blob);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.blob]);
  return (
    <article className="photo-tile">
      {source ? (
        <img src={source} alt={photo.label || `Progreso del ${formatDate(photo.at)}`} />
      ) : (
        <div className="photo-missing">
          <Icon name="image" size={24} />
          <span>Vista no disponible</span>
        </div>
      )}
      <div>
        <span>{photo.label || "Progreso"}</span>
        <small>{formatDate(photo.at, { day: "numeric", month: "short", year: "numeric" })}</small>
      </div>
      <button type="button" className="icon-button danger-icon" aria-label="Eliminar foto" onClick={onDelete}>
        <Icon name="trash" size={17} />
      </button>
    </article>
  );
}
export function SwitchRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="switch-row">
      <span>
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}
