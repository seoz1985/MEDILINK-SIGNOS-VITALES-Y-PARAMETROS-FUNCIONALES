"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type Questionnaire = {
  chief_complaint: string
  duration_hours: number
  dyspnea: boolean
  cough: boolean
  fever: boolean
  chest_pain: boolean
  diabetes: boolean
  hypertension: boolean
}

export function TriageQuestionnaire({
  onSubmit,
}: {
  onSubmit: (q: Questionnaire) => void
}) {
  const [q, setQ] = useState<Questionnaire>({
    chief_complaint: "",
    duration_hours: 0,
    dyspnea: false,
    cough: false,
    fever: false,
    chest_pain: false,
    diabetes: false,
    hypertension: false,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-[family-name:var(--font-space-grotesk)]">Cuestionario previo (tamizaje)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Motivo principal</Label>
          <Select
            value={q.chief_complaint}
            onValueChange={(v) => setQ((p) => ({ ...p, chief_complaint: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ninguno">— Seleccione —</SelectItem>
              <SelectItem value="disnea">Disnea</SelectItem>
              <SelectItem value="dolor_toracico">Dolor torácico</SelectItem>
              <SelectItem value="fiebre">Fiebre</SelectItem>
              <SelectItem value="tos">Tos</SelectItem>
              <SelectItem value="palpitaciones">Palpitaciones</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Duración (horas)</Label>
          <Input
            type="number"
            min={0}
            value={q.duration_hours}
            onChange={(e) => setQ((p) => ({ ...p, duration_hours: Number(e.target.value || 0) }))}
          />
        </div>

        <div className="space-y-2">
          <Label>Síntomas</Label>
          <div className="grid grid-cols-2 gap-3">
            {([
              ["dyspnea", "Disnea"],
              ["cough", "Tos"],
              ["fever", "Fiebre"],
              ["chest_pain", "Dolor torácico"],
            ] as const).map(([k, label]) => (
              <div key={k} className="flex items-center gap-2">
                <Checkbox
                  checked={q[k]}
                  onCheckedChange={(v) => setQ((p) => ({ ...p, [k]: Boolean(v) }))}
                />
                <span className="text-sm text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Antecedentes</Label>
          <div className="grid grid-cols-2 gap-3">
            {([
              ["diabetes", "Diabetes"],
              ["hypertension", "Hipertensión"],
            ] as const).map(([k, label]) => (
              <div key={k} className="flex items-center gap-2">
                <Checkbox
                  checked={q[k]}
                  onCheckedChange={(v) => setQ((p) => ({ ...p, [k]: Boolean(v) }))}
                />
                <span className="text-sm text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <Button className="w-full" onClick={() => onSubmit(q)}>
          Continuar a escaneo
        </Button>

        <p className="text-xs text-muted-foreground">
          Nota: Este módulo genera hipótesis de tamizaje (no diagnóstico) y debe ser confirmado por un profesional de salud.
        </p>
      </CardContent>
    </Card>
  )
}
