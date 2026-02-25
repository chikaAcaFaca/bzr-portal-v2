import { useHazardTypes } from '../../hooks/useRisks';

/**
 * HazardSelector Component (T097)
 *
 * Dropdown for selecting hazard type from reference data.
 * Displays hazard code + Serbian Cyrillic name.
 *
 * Usage:
 *   <HazardSelector value={selectedHazardId} onChange={setSelectedHazardId} />
 */

interface HazardSelectorProps {
  value?: number;
  onChange: (hazardId: number) => void;
  disabled?: boolean;
  error?: string;
  className?: string;
}

export function HazardSelector({
  value,
  onChange,
  disabled = false,
  error,
  className = '',
}: HazardSelectorProps) {
  const { hazards, isLoading } = useHazardTypes();

  return (
    <div className={className}>
      <label htmlFor="hazard-selector" className="block text-sm font-medium mb-2">
        Врста опасности *
      </label>

      {isLoading ? (
        <div className="border rounded-md px-3 py-2 text-sm text-muted-foreground">
          Учитавање опасности...
        </div>
      ) : (
        <select
          id="hazard-selector"
          value={value || ''}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled || hazards.length === 0}
          className={`
            w-full border rounded-md px-3 py-2 text-sm
            focus:outline-none focus:ring-2 focus:ring-primary
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-destructive' : 'border-input'}
          `}
        >
          <option value="">Изаберите врсту опасности</option>
          {hazards.map((hazard) => (
            <option key={hazard.id} value={hazard.id}>
              {hazard.code} - {hazard.nameSr}
            </option>
          ))}
        </select>
      )}

      {error && <p className="text-xs text-destructive mt-1">{error}</p>}

      {!isLoading && hazards.length === 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          Нема доступних врста опасности. Контактирајте администратора.
        </p>
      )}
    </div>
  );
}
