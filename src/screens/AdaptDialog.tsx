import { label, labelTitle } from "../i18n/es";
import { Button, DialogFrame, SelectField } from "../components/ui";
import { INJURY_ZONES } from "../constants";
import { getSnapshot } from "../store";
import { useState } from "react";

export function AdaptDialog({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (result: { minutes: number; reason: string; zone: string; equipment: string; explanation: string }) => void;
}) {
  const [reason, setReason] = useState("tiempo");
  const [minutes, setMinutes] = useState(30);
  const [zone, setZone] = useState("hombro");
  const [equipment, setEquipment] = useState("maquinas");
  // El cambio real lo aplica App.handleAdapt; acá solo se arma la explicación para el usuario.
  const apply = () => {
    if (!getSnapshot().activeSession) return;
    const cause =
      reason === "tiempo"
        ? `Ajustada a unos ${minutes} minutos: se priorizaron los primeros compuestos y se redujeron series accesorias.`
        : reason === "molestia"
          ? `Se retiraron movimientos asociados a ${label(zone)}. Revisa la sesión y detente si sientes dolor.`
          : `Se buscaron variantes compatibles con ${equipment === "mancuernas" ? "mancuernas o peso corporal" : "bandas o peso corporal"}.`;
    onApply({ minutes, reason, zone, equipment, explanation: cause });
    onClose();
  };
  return (
    <DialogFrame title="Adaptar mi sesión" onClose={onClose}>
      <div className="form-stack">
        <p className="muted-copy">
          El ajuste es una sugerencia local. Revisa los cambios antes de empezar; no es un consejo médico.
        </p>
        <SelectField
          label="¿Qué ha cambiado hoy?"
          value={reason}
          onChange={setReason}
          options={[
            { value: "tiempo", label: "Tengo menos tiempo" },
            { value: "equipo", label: "Falta equipo o hay una máquina ocupada" },
            { value: "molestia", label: "Quiero evitar una articulación" },
          ]}
        />
        {reason === "tiempo" && (
          <SelectField
            label="Tiempo disponible"
            value={String(minutes)}
            onChange={(value) => setMinutes(Number(value))}
            options={[15, 20, 30, 45, 60].map((value) => ({ value: String(value), label: `${value} minutos` }))}
          />
        )}
        {reason === "molestia" && (
          <SelectField
            label="Zona a evitar"
            value={zone}
            onChange={setZone}
            options={INJURY_ZONES.map((value) => ({ value, label: labelTitle(value) }))}
          />
        )}
        {reason === "equipo" && (
          <SelectField
            label="Equipo disponible"
            value={equipment}
            onChange={setEquipment}
            options={[
              { value: "mancuernas", label: "Mancuernas y peso corporal" },
              { value: "bandas", label: "Bandas y peso corporal" },
            ]}
          />
        )}
        <div className="sheet-actions">
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={apply}>
            Aplicar ajuste
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}
