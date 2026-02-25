import { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Separator } from '../ui/separator';
import { HazardSelector } from './HazardSelector';
import { RiskInputs } from './RiskInputs';
import { CorrectiveMeasures } from './CorrectiveMeasures';
import { ResidualRiskInputs } from './ResidualRiskInputs';
import { RiskTable, type Risk } from './RiskTable';
import { useHazardTypes, calculateRiskIndex } from '../../hooks/useRisks';
import { ChevronLeft, Plus } from 'lucide-react';

/**
 * RiskAssessmentWizard Component
 *
 * Multi-step wizard for assessing risks for a workplace position.
 * Combines HazardSelector, RiskInputs, CorrectiveMeasures, ResidualRiskInputs,
 * and RiskTable into a complete risk assessment flow.
 */

interface RiskAssessmentWizardProps {
  positionId?: number | null;
  initialRisks?: Array<{
    hazardCode: string;
    hazardName: string;
    initialE: number;
    initialP: number;
    initialF: number;
    correctiveMeasures: string;
    residualE: number;
    residualP: number;
    residualF: number;
  }>;
  onComplete: (data: {
    risks: Array<{
      hazardId: number;
      hazardCode: string;
      hazardName: string;
      initialE: number;
      initialP: number;
      initialF: number;
      correctiveMeasures: string;
      residualE: number;
      residualP: number;
      residualF: number;
    }>;
  }) => void;
  onBack?: () => void;
}

interface RiskDraft {
  hazardId: number | null;
  hazardCode: string;
  hazardName: string;
  initialE: number;
  initialP: number;
  initialF: number;
  initialRi: number;
  correctiveMeasures: string;
  residualE: number;
  residualP: number;
  residualF: number;
  residualR: number;
  residualValid: boolean;
}

const emptyDraft: RiskDraft = {
  hazardId: null,
  hazardCode: '',
  hazardName: '',
  initialE: 1,
  initialP: 1,
  initialF: 1,
  initialRi: 1,
  correctiveMeasures: '',
  residualE: 1,
  residualP: 1,
  residualF: 1,
  residualR: 1,
  residualValid: false,
};

export function RiskAssessmentWizard({
  initialRisks = [],
  onComplete,
  onBack,
}: RiskAssessmentWizardProps) {
  const { hazards } = useHazardTypes();

  // Convert initialRisks to Risk[] for RiskTable
  const [risks, setRisks] = useState<Risk[]>(() =>
    initialRisks.map((r, i) => ({
      id: -(i + 1), // Negative IDs for local-only risks
      hazardCode: r.hazardCode,
      hazardName: r.hazardName,
      initialE: r.initialE,
      initialP: r.initialP,
      initialF: r.initialF,
      initialRi: calculateRiskIndex(r.initialE, r.initialP, r.initialF),
      correctiveMeasures: r.correctiveMeasures,
      residualE: r.residualE,
      residualP: r.residualP,
      residualF: r.residualF,
      residualR: calculateRiskIndex(r.residualE, r.residualP, r.residualF),
    }))
  );

  // Track hazardId mapping for risks (not part of RiskTable's Risk type)
  const [riskHazardIds, setRiskHazardIds] = useState<Map<number, number>>(new Map());

  const [draft, setDraft] = useState<RiskDraft>({ ...emptyDraft });
  const [showForm, setShowForm] = useState(risks.length === 0);
  const [formStep, setFormStep] = useState<'hazard' | 'initial' | 'measures' | 'residual'>('hazard');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleHazardSelect = (hazardId: number) => {
    const selected = hazards.find((h) => h.id === hazardId);
    if (selected) {
      setDraft((prev) => ({
        ...prev,
        hazardId,
        hazardCode: selected.code,
        hazardName: selected.nameSr,
      }));
      setErrors({});
    }
  };

  const handleInitialRiskChange = (values: { e: number; p: number; f: number; ri: number }) => {
    setDraft((prev) => ({
      ...prev,
      initialE: values.e,
      initialP: values.p,
      initialF: values.f,
      initialRi: values.ri,
    }));
  };

  const handleMeasuresChange = (value: string) => {
    setDraft((prev) => ({ ...prev, correctiveMeasures: value }));
  };

  const handleResidualRiskChange = (values: { e: number; p: number; f: number; r: number; valid: boolean }) => {
    setDraft((prev) => ({
      ...prev,
      residualE: values.e,
      residualP: values.p,
      residualF: values.f,
      residualR: values.r,
      residualValid: values.valid,
    }));
  };

  const goToNextFormStep = () => {
    if (formStep === 'hazard') {
      if (!draft.hazardId) {
        setErrors({ hazard: 'Изаберите врсту опасности' });
        return;
      }
      setErrors({});
      setFormStep('initial');
    } else if (formStep === 'initial') {
      setFormStep('measures');
    } else if (formStep === 'measures') {
      if (draft.correctiveMeasures.length < 20) {
        setErrors({ measures: 'Корективне мере морају имати најмање 20 карактера' });
        return;
      }
      setErrors({});
      setFormStep('residual');
    }
  };

  const goToPrevFormStep = () => {
    if (formStep === 'initial') setFormStep('hazard');
    else if (formStep === 'measures') setFormStep('initial');
    else if (formStep === 'residual') setFormStep('measures');
  };

  const handleAddRisk = () => {
    if (!draft.residualValid) {
      setErrors({ residual: 'Преостали ризик мора бити мањи од почетног' });
      return;
    }

    const newId = -(risks.length + 1);
    const newRisk: Risk = {
      id: newId,
      hazardCode: draft.hazardCode,
      hazardName: draft.hazardName,
      initialE: draft.initialE,
      initialP: draft.initialP,
      initialF: draft.initialF,
      initialRi: draft.initialRi,
      correctiveMeasures: draft.correctiveMeasures,
      residualE: draft.residualE,
      residualP: draft.residualP,
      residualF: draft.residualF,
      residualR: draft.residualR,
    };

    setRisks((prev) => [...prev, newRisk]);
    setRiskHazardIds((prev) => new Map(prev).set(newId, draft.hazardId!));

    // Reset form
    setDraft({ ...emptyDraft });
    setFormStep('hazard');
    setShowForm(false);
    setErrors({});
  };

  const handleDeleteRisk = (riskId: number) => {
    setRisks((prev) => prev.filter((r) => r.id !== riskId));
    setRiskHazardIds((prev) => {
      const next = new Map(prev);
      next.delete(riskId);
      return next;
    });
  };

  const handleComplete = () => {
    if (risks.length === 0) {
      setErrors({ submit: 'Морате додати бар једну процену ризика' });
      return;
    }

    onComplete({
      risks: risks.map((r) => ({
        hazardId: riskHazardIds.get(r.id) || 0,
        hazardCode: r.hazardCode,
        hazardName: r.hazardName,
        initialE: r.initialE,
        initialP: r.initialP,
        initialF: r.initialF,
        correctiveMeasures: r.correctiveMeasures,
        residualE: r.residualE,
        residualP: r.residualP,
        residualF: r.residualF,
      })),
    });
  };

  return (
    <div className="space-y-6">
      {/* Risk Table - shows already added risks */}
      {risks.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Додате процене ризика ({risks.length})</h3>
          <RiskTable risks={risks} onDelete={handleDeleteRisk} />
        </div>
      )}

      {/* Add Risk Form */}
      {showForm ? (
        <Card>
          <CardContent className="pt-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Додај нову процену ризика</h3>
              <div className="text-sm text-muted-foreground">
                {formStep === 'hazard' && 'Корак 1/4 - Избор опасности'}
                {formStep === 'initial' && 'Корак 2/4 - Почетни ризик'}
                {formStep === 'measures' && 'Корак 3/4 - Корективне мере'}
                {formStep === 'residual' && 'Корак 4/4 - Преостали ризик'}
              </div>
            </div>

            <Separator />

            {/* Step 1: Hazard Selection */}
            {formStep === 'hazard' && (
              <div className="space-y-4">
                <HazardSelector
                  {...(draft.hazardId ? { value: draft.hazardId } : {})}
                  onChange={handleHazardSelect}
                  {...(errors.hazard ? { error: errors.hazard } : {})}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setShowForm(false); setDraft({ ...emptyDraft }); setFormStep('hazard'); }}>
                    Откажи
                  </Button>
                  <Button onClick={goToNextFormStep} disabled={!draft.hazardId}>
                    Даље
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Initial Risk E×P×F */}
            {formStep === 'initial' && (
              <div className="space-y-4">
                <RiskInputs
                  e={draft.initialE}
                  p={draft.initialP}
                  f={draft.initialF}
                  onChange={handleInitialRiskChange}
                />
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPrevFormStep}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Назад
                  </Button>
                  <Button onClick={goToNextFormStep}>
                    Даље
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Corrective Measures */}
            {formStep === 'measures' && (
              <div className="space-y-4">
                <CorrectiveMeasures
                  value={draft.correctiveMeasures}
                  onChange={handleMeasuresChange}
                  {...(errors.measures ? { error: errors.measures } : {})}
                />
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPrevFormStep}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Назад
                  </Button>
                  <Button onClick={goToNextFormStep} disabled={draft.correctiveMeasures.length < 20}>
                    Даље
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Residual Risk E×P×F */}
            {formStep === 'residual' && (
              <div className="space-y-4">
                <ResidualRiskInputs
                  initialRiskIndex={draft.initialRi}
                  e={draft.residualE}
                  p={draft.residualP}
                  f={draft.residualF}
                  onChange={handleResidualRiskChange}
                />
                {errors.residual && (
                  <p className="text-sm text-destructive">{errors.residual}</p>
                )}
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPrevFormStep}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Назад
                  </Button>
                  <Button onClick={handleAddRisk} disabled={!draft.residualValid}>
                    <Plus className="h-4 w-4 mr-1" />
                    Додај ризик
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setShowForm(true)} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Додај нову процену ризика
        </Button>
      )}

      {/* Error message */}
      {errors.submit && (
        <p className="text-sm text-destructive text-center">{errors.submit}</p>
      )}

      {/* Navigation */}
      <Separator />
      <div className="flex justify-between">
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Назад
          </Button>
        )}
        <Button
          onClick={handleComplete}
          disabled={risks.length === 0}
          className="ml-auto"
        >
          Заврши процену ризика
        </Button>
      </div>
    </div>
  );
}
