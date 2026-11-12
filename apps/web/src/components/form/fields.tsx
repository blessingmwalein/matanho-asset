'use client';

import * as React from 'react';
import { Control, FieldPath, FieldValues, useController, useFieldArray, useFormContext } from 'react-hook-form';
import { format, parse } from 'date-fns';
import { CalendarIcon, Check, ChevronsUpDown, Plus, Trash2, X } from 'lucide-react';
import { currencySymbol } from '@nexus/shared';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox, RadioGroup, RadioItem, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from '@/components/ui/controls';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input, inputBase, Textarea } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menus';
import { FileChip, FileDropzone } from '@/components/nx/blocks';

/* ══════════════════════════════════════════════════════════════════════════════
   Shared plumbing. Every field takes `name` (+ optional `control`; defaults to the
   surrounding <FormProvider>) and renders label, help text and the validation error.
   ══════════════════════════════════════════════════════════════════════════════ */
interface BaseProps<T extends FieldValues> {
  name: FieldPath<T>;
  control?: Control<T>;
  label?: React.ReactNode;
  help?: React.ReactNode;
  optional?: boolean;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export function FieldShell({
  id,
  label,
  help,
  error,
  optional,
  required,
  className,
  children,
}: {
  id?: string;
  label?: React.ReactNode;
  help?: React.ReactNode;
  error?: string;
  optional?: boolean;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-[11.5px] font-semibold text-ink-2">
          <span>
            {label}
            {required && <span className="ml-0.5 text-danger">*</span>}
          </span>
          {optional && <em className="text-[10.5px] font-normal not-italic text-ink-3">optional</em>}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-[11px] font-medium text-danger">
          {error}
        </p>
      ) : help ? (
        <p className="text-[11px] leading-snug text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

function useField<T extends FieldValues>(props: BaseProps<T>) {
  const ctx = useFormContext<T>();
  const control = props.control ?? ctx?.control;
  const c = useController<T>({ name: props.name, control });
  const id = React.useId();
  return { ...c, id, error: c.fieldState.error?.message };
}

/** Group of fields with a titled header (matches the onboarding "section-title" pattern). */
export function FormSection({ title, description, actions, children, className, columns = 2 }: { title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; columns?: 1 | 2 | 3 }) {
  return (
    <section className={cn('mb-6 last:mb-0', className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            {title && <h3 className="text-[13px] font-semibold">{title}</h3>}
            {description && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cn('grid gap-x-3 gap-y-3.5', columns === 1 && 'grid-cols-1', columns === 2 && 'grid-cols-1 sm:grid-cols-2', columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>{children}</div>
    </section>
  );
}
/** Make a field span the full row inside FormSection. */
export const FullWidth = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={cn('col-span-full', className)}>{children}</div>;

/* ── Text ───────────────────────────────────────────────────────────────────── */
export function TextField<T extends FieldValues>(props: BaseProps<T> & Omit<React.ComponentProps<'input'>, 'name' | 'value' | 'onChange' | 'className'>) {
  const { name, control, label, help, optional, required, className, disabled, ...rest } = props;
  const { field, id, error } = useField<T>(props);
  return (
    <FieldShell id={id} label={label} help={help} error={error} optional={optional} required={required} className={className}>
      <Input id={id} {...rest} {...field} value={field.value ?? ''} disabled={disabled} aria-invalid={!!error} />
    </FieldShell>
  );
}

export function TextareaField<T extends FieldValues>(props: BaseProps<T> & { rows?: number; placeholder?: string }) {
  const { label, help, optional, required, className, disabled, rows, placeholder } = props;
  const { field, id, error } = useField<T>(props);
  return (
    <FieldShell id={id} label={label} help={help} error={error} optional={optional} required={required} className={className}>
      <Textarea id={id} rows={rows} placeholder={placeholder} {...field} value={field.value ?? ''} disabled={disabled} aria-invalid={!!error} />
    </FieldShell>
  );
}

/* ── Numbers ────────────────────────────────────────────────────────────────── */
function parseNumber(s: string): number | undefined {
  const cleaned = s.replace(/[,\s]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function useNumberText(value: unknown, decimals: number | undefined, group: boolean) {
  const [text, setText] = React.useState<string>('');
  const [focused, setFocused] = React.useState(false);
  React.useEffect(() => {
    if (focused) return;
    if (typeof value === 'number' && Number.isFinite(value)) {
      setText(group ? value.toLocaleString('en-US', { minimumFractionDigits: decimals ?? 0, maximumFractionDigits: decimals ?? 6 }) : String(value));
    } else if (value === undefined || value === null || value === '') setText('');
  }, [value, focused, decimals, group]);
  return { text, setText, setFocused };
}

interface NumberFieldBase<T extends FieldValues> extends BaseProps<T> {
  placeholder?: string;
  decimals?: number;
  min?: number;
  max?: number;
}

function NumericInput<T extends FieldValues>(props: NumberFieldBase<T> & { prefix?: string; suffix?: string; group?: boolean; align?: 'left' | 'right' }) {
  const { label, help, optional, required, className, disabled, placeholder, decimals, prefix, suffix, group = false, align = 'left' } = props;
  const { field, id, error } = useField<T>(props);
  const { text, setText, setFocused } = useNumberText(field.value, decimals, group);
  return (
    <FieldShell id={id} label={label} help={help} error={error} optional={optional} required={required} className={className}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-ink-3">{prefix}</span>}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={!!error}
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const v = e.target.value;
            if (!/^-?[\d,]*\.?\d*$/.test(v)) return;
            setText(v);
            field.onChange(parseNumber(v));
          }}
          onBlur={() => {
            setFocused(false);
            field.onBlur();
          }}
          ref={field.ref}
          className={cn(inputBase, 'num h-9', align === 'right' && 'text-right', prefix && 'pl-[34px]', suffix && 'pr-8')}
          style={prefix && prefix.length > 3 ? { paddingLeft: 10 + prefix.length * 7.5 } : undefined}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-ink-3">{suffix}</span>}
      </div>
    </FieldShell>
  );
}

export function NumberField<T extends FieldValues>(props: NumberFieldBase<T>) {
  return <NumericInput {...props} />;
}
/** Money input: currency prefix, thousand separators, right aligned. Value stored as a number. */
export function CurrencyField<T extends FieldValues>(props: NumberFieldBase<T> & { currency?: string }) {
  return <NumericInput {...props} decimals={props.decimals ?? 2} prefix={currencySymbol(props.currency ?? 'USD').trim()} group align="right" />;
}
/** Percentage input (0–100). */
export function PercentField<T extends FieldValues>(props: NumberFieldBase<T>) {
  return <NumericInput {...props} decimals={props.decimals ?? 2} suffix="%" align="right" />;
}

/* ── Date picker ────────────────────────────────────────────────────────────── */
export function DateField<T extends FieldValues>(props: BaseProps<T> & { placeholder?: string; fromYear?: number; toYear?: number; withTime?: boolean }) {
  const { label, help, optional, required, className, disabled, placeholder = 'Select date', fromYear = 1940, toYear = new Date().getFullYear() + 15 } = props;
  const { field, id, error } = useField<T>(props);
  const [open, setOpen] = React.useState(false);
  const date = typeof field.value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(field.value) ? parse(field.value.slice(0, 10), 'yyyy-MM-dd', new Date()) : undefined;
  return (
    <FieldShell id={id} label={label} help={help} error={error} optional={optional} required={required} className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button id={id} type="button" disabled={disabled} aria-invalid={!!error} className={cn(inputBase, 'h-9 items-center justify-between text-left', !date && 'text-ink-3')}>
            <span className="num truncate">{date ? format(date, 'dd MMM yyyy') : placeholder}</span>
            <CalendarIcon className="size-4 shrink-0 text-ink-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            startMonth={new Date(fromYear, 0)}
            endMonth={new Date(toYear, 11)}
            selected={date}
            defaultMonth={date}
            onSelect={(d) => {
              field.onChange(d ? format(d, 'yyyy-MM-dd') : '');
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </FieldShell>
  );
}

/* ── Select / searchable select / combobox / multi-select ───────────────────── */
export interface Option {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function SelectField<T extends FieldValues>(props: BaseProps<T> & { options: readonly Option[] | readonly string[]; placeholder?: string }) {
  const { label, help, optional, required, className, disabled, placeholder = 'Select…' } = props;
  const { field, id, error } = useField<T>(props);
  const options = (props.options as ReadonlyArray<Option | string>).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <FieldShell id={id} label={label} help={help} error={error} optional={optional} required={required} className={className}>
      <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={disabled}>
        <SelectTrigger id={id} aria-invalid={!!error} onBlur={field.onBlur}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

function ComboboxBase({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = 'Search…',
  allowCustom,
  disabled,
  invalid,
  loading,
}: {
  id?: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  allowCustom?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const selected = options.find((o) => o.value === value);
  const display = selected?.label ?? (allowCustom ? value : undefined);
  const showCustom = allowCustom && query.trim() && !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
      <PopoverTrigger asChild>
        <button id={id} type="button" role="combobox" aria-expanded={open} disabled={disabled} aria-invalid={invalid} className={cn(inputBase, 'h-9 items-center justify-between gap-2 text-left', !display && 'text-ink-3')}>
          <span className="truncate">{display || placeholder || 'Select…'}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-ink-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[240px] overflow-hidden p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{loading ? 'Loading…' : 'No matches.'}</CommandEmpty>
            <CommandGroup>
              {showCustom && (
                <CommandItem value={`__custom__${query}`} onSelect={() => { onChange(query.trim()); setOpen(false); }}>
                  <Plus className="size-3.5 text-primary" /> Use “{query.trim()}”
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem key={o.value} value={`${o.label} ${o.hint ?? ''} ${o.value}`} disabled={o.disabled} onSelect={() => { onChange(o.value); setOpen(false); }}>
                  <Check className={cn('size-3.5 text-primary', value === o.value ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="num text-[11px] text-muted-foreground">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Searchable single select (type to filter long lists: investors, securities, portfolios). */
export function SearchableSelectField<T extends FieldValues>(props: BaseProps<T> & { options: Option[]; placeholder?: string; searchPlaceholder?: string; loading?: boolean }) {
  const { label, help, optional, required, className, disabled } = props;
  const { field, id, error } = useField<T>(props);
  return (
    <FieldShell id={id} label={label} help={help} error={error} optional={optional} required={required} className={className}>
      <ComboboxBase id={id} value={field.value} onChange={field.onChange} options={props.options} placeholder={props.placeholder} searchPlaceholder={props.searchPlaceholder} disabled={disabled} invalid={!!error} loading={props.loading} />
    </FieldShell>
  );
}

/** Combobox: searchable list that also accepts a free-text value (e.g. broker, country). */
export function ComboboxField<T extends FieldValues>(props: BaseProps<T> & { options: Option[] | readonly string[]; placeholder?: string }) {
  const { label, help, optional, required, className, disabled } = props;
  const { field, id, error } = useField<T>(props);
  const options = (props.options as ReadonlyArray<Option | string>).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <FieldShell id={id} label={label} help={help} error={error} optional={optional} required={required} className={className}>
      <ComboboxBase id={id} value={field.value} onChange={field.onChange} options={options} placeholder={props.placeholder} allowCustom disabled={disabled} invalid={!!error} />
    </FieldShell>
  );
}

export function MultiSelectField<T extends FieldValues>(props: BaseProps<T> & { options: Option[]; placeholder?: string }) {
  const { label, help, optional, required, className, disabled, options, placeholder = 'Select one or more…' } = props;
  const { field, id, error } = useField<T>(props);
  const value: string[] = Array.isArray(field.value) ? field.value : [];
  const [open, setOpen] = React.useState(false);
  const toggle = (v: string) => field.onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <FieldShell id={id} label={label} help={help} error={error} optional={optional} required={required} className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button id={id} type="button" disabled={disabled} aria-invalid={!!error} className={cn(inputBase, 'min-h-9 items-center justify-between gap-2 py-1 text-left')}>
            <span className="flex flex-wrap gap-1">
              {value.length === 0 && <span className="text-ink-3">{placeholder}</span>}
              {value.map((v) => (
                <span key={v} className="inline-flex items-center gap-1 rounded bg-surface-sunken px-1.5 py-0.5 text-[11.5px] font-medium">
                  {options.find((o) => o.value === v)?.label ?? v}
                  <X
                    className="size-3 cursor-pointer text-ink-3 hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(v);
                    }}
                  />
                </span>
              ))}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-ink-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search…" />
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => toggle(o.value)}>
                    <Checkbox checked={value.includes(o.value)} className="pointer-events-none" tabIndex={-1} />
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </FieldShell>
  );
}

/* ── Checkbox / radio / switch ──────────────────────────────────────────────── */
export function CheckboxField<T extends FieldValues>(props: BaseProps<T> & { description?: React.ReactNode }) {
  const { label, help, className, disabled, description } = props;
  const { field, id, error } = useField<T>(props);
  return (
    <div className={cn('grid gap-1', className)}>
      <div className="flex items-start gap-2.5">
        <Checkbox id={id} checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} onBlur={field.onBlur} disabled={disabled} aria-invalid={!!error} className="mt-[2px]" />
        <label htmlFor={id} className="text-[12.5px] leading-snug">
          <span className="font-medium">{label}</span>
          {description && <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{description}</span>}
        </label>
      </div>
      {error ? <p role="alert" className="pl-[26px] text-[11px] font-medium text-danger">{error}</p> : help ? <p className="pl-[26px] text-[11px] text-muted-foreground">{help}</p> : null}
    </div>
  );
}

export function RadioGroupField<T extends FieldValues>(props: BaseProps<T> & { options: Array<Option & { description?: string }>; inline?: boolean }) {
  const { label, help, optional, required, className, disabled, options, inline } = props;
  const { field, id, error } = useField<T>(props);
  return (
    <FieldShell label={label} help={help} error={error} optional={optional} required={required} className={className}>
      <RadioGroup value={field.value ?? ''} onValueChange={field.onChange} disabled={disabled} className={cn('gap-2', inline ? 'flex flex-wrap gap-x-5' : 'grid')} aria-labelledby={id}>
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-2.5 text-[12.5px]">
            <RadioItem value={o.value} className="mt-[2px]" />
            <span>
              <span className="font-medium">{o.label}</span>
              {o.description && <span className="block text-[11.5px] text-muted-foreground">{o.description}</span>}
            </span>
          </label>
        ))}
      </RadioGroup>
    </FieldShell>
  );
}

export function SwitchField<T extends FieldValues>(props: BaseProps<T> & { description?: string }) {
  const { label, className, disabled, description } = props;
  const { field, id, error } = useField<T>(props);
  return (
    <div className={cn('flex items-center justify-between gap-4 rounded-md border border-border-soft bg-surface-2 px-3 py-2.5', className)}>
      <label htmlFor={id} className="text-[12.5px]">
        <span className="font-medium">{label}</span>
        {description && <span className="block text-[11.5px] text-muted-foreground">{description}</span>}
        {error && <span className="block text-[11px] font-medium text-danger">{error}</span>}
      </label>
      <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} disabled={disabled} />
    </div>
  );
}

/* ── File upload (RHF holds File | File[]) ──────────────────────────────────── */
export function FileField<T extends FieldValues>(props: BaseProps<T> & { multiple?: boolean; accept?: string; hint?: string; title?: string }) {
  const { label, help, optional, required, className, disabled, multiple, accept, hint, title } = props;
  const { field, id, error } = useField<T>(props);
  const files: File[] = multiple ? (Array.isArray(field.value) ? field.value : []) : field.value ? [field.value as File] : [];
  return (
    <FieldShell id={id} label={label} help={help} error={error} optional={optional} required={required} className={className}>
      <FileDropzone
        compact={files.length > 0}
        multiple={multiple}
        accept={accept}
        hint={hint}
        title={title}
        disabled={disabled}
        onFiles={(picked) => field.onChange(multiple ? [...files, ...picked] : picked[0])}
      />
      {files.length > 0 && (
        <div className="grid gap-1.5">
          {files.map((f, i) => (
            <FileChip key={`${f.name}-${i}`} name={f.name} size={f.size} mime={f.type} onRemove={() => field.onChange(multiple ? files.filter((_, j) => j !== i) : undefined)} />
          ))}
        </div>
      )}
    </FieldShell>
  );
}

/* ── Repeater (useFieldArray) ───────────────────────────────────────────────── */
export function RepeaterField<T extends FieldValues>({
  name,
  control,
  label,
  help,
  addLabel = 'Add row',
  emptyRow,
  min = 0,
  max,
  renderRow,
  className,
  error,
}: {
  name: FieldPath<T>;
  control?: Control<T>;
  label?: React.ReactNode;
  help?: React.ReactNode;
  addLabel?: string;
  emptyRow: Record<string, unknown>;
  min?: number;
  max?: number;
  /** Render the fields of one row. `base` is the path prefix, e.g. `owners.0` */
  renderRow: (base: string, index: number) => React.ReactNode;
  className?: string;
  error?: string;
}) {
  const ctx = useFormContext<T>();
  const { fields, append, remove } = useFieldArray({ control: control ?? ctx.control, name: name as never });
  return (
    <div className={cn('grid gap-2.5', className)}>
      {(label || help) && (
        <div className="flex items-end justify-between gap-3">
          <div>
            {label && <h3 className="text-[13px] font-semibold">{label}</h3>}
            {help && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{help}</p>}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => append(emptyRow as never)} disabled={max !== undefined && fields.length >= max}>
            <Plus /> {addLabel}
          </Button>
        </div>
      )}
      {fields.map((f, i) => (
        <div key={f.id} className="grid grid-cols-[1fr_auto] items-start gap-2 rounded-lg border border-border bg-surface-2 p-3">
          <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">{renderRow(`${name}.${i}`, i)}</div>
          <IconButton label="Remove row" type="button" size="icon-sm" onClick={() => remove(i)} disabled={fields.length <= min} className="mt-5">
            <Trash2 />
          </IconButton>
        </div>
      ))}
      {fields.length === 0 && <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">No rows yet.</p>}
      {error && <p role="alert" className="text-[11px] font-medium text-danger">{error}</p>}
    </div>
  );
}
