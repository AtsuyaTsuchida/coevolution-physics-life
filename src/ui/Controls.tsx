'use client';
import type { Config } from '../core/Config';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
export function Choice({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="control">
      <div className="row">
        <span>{label}</span>
      </div>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v !== null) onChange(v);
        }}
      >
        <SelectTrigger className="full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="row control">
      <span>{label}</span>
      <Switch checked={value} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
export function Range({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="control">
      <div className="row">
        <span>{label}</span>
        <output>{Number(value.toFixed(3))}</output>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
        aria-label={label}
      />
    </div>
  );
}
export function Advanced({
  config,
  onChange,
}: {
  config: Config;
  onChange: (key: keyof Config, value: number | boolean) => void;
}) {
  const range = (
    key: keyof Config,
    label: string,
    min: number,
    max: number,
    step: number,
  ) => (
    <Range
      key={key}
      label={label}
      value={Number(config[key])}
      min={min}
      max={max}
      step={step}
      onChange={(v) => onChange(key, v)}
    />
  );
  return (
    <>
      <details>
        <summary>Population & body · reset to apply</summary>
        {range('initialCount', 'Initial creatures', 1, 500, 1)}
        {range('maxCount', 'Maximum creatures', 10, 1000, 10)}
        {range('initialVoxels', 'Initial voxels', 20, 80, 1)}
      </details>
      <details>
        <summary>Creature mechanics</summary>
        {range('iterations', 'Constraint iterations', 2, 16, 1)}
        {range('stability', 'Solver relaxation', 0.2, 1, 0.05)}
        {range('actuatorStrength', 'Actuator strength', 0, 1.5, 0.05)}
      </details>
      <details>
        <summary>Evolution & metabolism</summary>
        <Toggle
          label="Creature evolution"
          value={config.creatureEvolution}
          onChange={(v) => onChange('creatureEvolution', v)}
        />
        {range('mutationRate', 'Gene mutation', 0, 0.4, 0.01)}
        {range('addRate', 'Voxel addition', 0, 1, 0.01)}
        {range('removeRate', 'Voxel removal', 0, 1, 0.01)}
        {range('materialRate', 'Material mutation', 0, 0.5, 0.01)}
        {range('metabolism', 'Basal metabolism', 0, 0.12, 0.001)}
        {range('muscleCost', 'Muscle work cost', 0, 0.2, 0.001)}
        {range('reproductionThreshold', 'Birth energy threshold', 90, 220, 5)}
      </details>
    </>
  );
}
