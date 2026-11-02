import { labelList } from "../i18n/es";
import { Icon } from "../components/Icon";
import { Button, Field, SwitchRow } from "../components/ui";
import { APP_VERSION, GOALS } from "../constants";
import { cleanNumber, cx, formatDate } from "../lib/format";
import type { Profile, Settings } from "../types";
import { useEffect, useState } from "react";

export function SettingsScreen({
  profile,
  settings,
  lastBackupAt,
  persistent,
  storageUsage,
  onProfile,
  onSaveSettings,
  onExport,
  onImport,
  onClear,
  rollbackAt,
  onRollback,
  onInstall,
  installAvailable,
  onToast,
}: {
  profile: Profile;
  settings: Settings;
  lastBackupAt: number;
  persistent: boolean | null;
  storageUsage: { usage?: number; quota?: number } | null;
  onProfile: () => void;
  onSaveSettings: (settings: Settings) => Promise<void>;
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
  rollbackAt: number | null;
  onRollback: () => void;
  onInstall: () => void;
  installAvailable: boolean;
  onToast: (message: string) => void;
}) {
  const [plates, setPlates] = useState(settings.plates.join(", "));
  const [editingPlates, setEditingPlates] = useState(false);
  useEffect(() => setPlates(settings.plates.join(", ")), [settings.plates]);
  const change = (patch: Partial<Settings>) => void onSaveSettings({ ...settings, ...patch });
  const savePlates = async () => {
    const values = plates
      .split(",")
      .map((value) => cleanNumber(value.trim()))
      .filter((value) => value > 0);
    await onSaveSettings({ ...settings, plates: values.sort((a, b) => b - a) });
    setEditingPlates(false);
  };
  const toggleNotifications = async (enabled: boolean) => {
    if (!enabled) {
      await change({ notifications: false });
      return;
    }
    if (!("Notification" in window)) {
      onToast("Este navegador no admite notificaciones.");
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") {
      onToast("Permiso de notificaciones no concedido.");
      return;
    }
    await change({ notifications: true });
  };
  const storagePercent = storageUsage?.quota
    ? Math.min(100, Math.round(((storageUsage.usage ?? 0) / storageUsage.quota) * 100))
    : 0;
  return (
    <div className="screen settings-screen">
      <div className="page-intro">
        <p className="eyebrow">TU CONFIGURACIÓN</p>
        <h1>Ajustes</h1>
        <p>Tu perfil, tus preferencias y la seguridad de tus datos locales.</p>
      </div>
      <section className="settings-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PERFIL DE ENTRENAMIENTO</p>
            <h2>Una configuración personal</h2>
          </div>
          <Icon name="user" />
        </div>
        <div className="profile-summary">
          <div>
            <strong>{GOALS.find((goal) => goal.value === profile.goal)?.title}</strong>
            <span>
              {profile.level} · {profile.days} días · {profile.minutes} min · {profile.units}
            </span>
            <small>{labelList(profile.equipment)}</small>
          </div>
          <Button variant="secondary" icon="edit" onClick={onProfile}>
            Editar cuestionario
          </Button>
        </div>
        <p className="muted-copy">
          Cambiar tu perfil no modifica las rutinas guardadas. Usa el generador cuando quieras crear una nueva.
        </p>
      </section>

      <div className="settings-columns">
        <section className="settings-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">APARIENCIA</p>
              <h2>Interfaz</h2>
            </div>
          </div>
          <div className="theme-picker" role="group" aria-label="Tema visual">
            {(["dark", "light"] as const).map((theme) => (
              <button
                type="button"
                key={theme}
                className={cx("theme-choice", settings.theme === theme && "theme-choice-active")}
                aria-pressed={settings.theme === theme}
                onClick={() => void change({ theme })}
              >
                <span className={`theme-swatch theme-swatch-${theme}`} />
                <strong>{theme === "dark" ? "Oscuro" : "Claro"}</strong>
                <small>{theme === "dark" ? "Refinado y bajo en luz" : "Alto contraste"}</small>
              </button>
            ))}
          </div>
        </section>
        <section className="settings-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ENTRENAMIENTO</p>
              <h2>Pesos y descansos</h2>
            </div>
          </div>
          <div className="setting-fields">
            <Field
              label="Descanso por defecto"
              type="number"
              min={15}
              max={600}
              step={15}
              value={settings.defaultRest}
              suffix="seg"
              onChange={(value) => void change({ defaultRest: Math.max(15, cleanNumber(value)) })}
            />
            <Field
              label="Peso de la barra"
              type="number"
              min={0}
              step={0.5}
              value={settings.barWeight}
              suffix={profile.units}
              onChange={(value) => void change({ barWeight: Math.max(0, cleanNumber(value)) })}
            />
          </div>
          <p className="muted-copy">
            El descanso del plan se ajusta por ejercicio; este valor se usa como alternativa cuando no hay uno definido.
          </p>
          <div className="plate-config">
            <span>Discos disponibles · {profile.units} · repite un valor si tienes varios pares</span>
            {editingPlates ? (
              <div className="inline-actions">
                <Field
                  label="Lista de discos"
                  value={plates}
                  onChange={setPlates}
                  placeholder="25, 20, 15, 10, 5, 2.5"
                />
                <Button variant="secondary" onClick={() => void savePlates()}>
                  Guardar
                </Button>
              </div>
            ) : (
              <div className="plate-values">
                <strong>{settings.plates.join(" · ")}</strong>
                <button type="button" className="text-action" onClick={() => setEditingPlates(true)}>
                  Editar lista
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="settings-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">MICROINTERACCIONES</p>
            <h2>Preferencias de sesión</h2>
          </div>
        </div>
        <SwitchRow
          title="Sonido al terminar el descanso"
          description="Un aviso breve usando Web Audio cuando el navegador lo permite."
          checked={settings.sound}
          onChange={(sound) => void change({ sound })}
        />
        <SwitchRow
          title="Vibración"
          description="Vibración sutil en dispositivos compatibles."
          checked={settings.vibration}
          onChange={(vibration) => void change({ vibration })}
        />
        <SwitchRow
          title="Notificaciones durante la sesión"
          description="Solo mientras la PWA está abierta o el navegador permite actividad en segundo plano."
          checked={settings.notifications}
          onChange={(enabled) => void toggleNotifications(enabled)}
        />
        <div className="local-reminder">
          <SwitchRow
            title="Recordatorio local con la app abierta"
            description="Comprueba el horario mientras ManteYym está abierta. No funciona como alarma fiable en segundo plano."
            checked={settings.reminders}
            onChange={(reminders) => void change({ reminders })}
          />
          <div className="reminder-settings">
            <Field
              label="Hora local"
              type="time"
              value={settings.reminderTime}
              onChange={(reminderTime) => void change({ reminderTime })}
            />
            <div className="field">
              <span>Días</span>
              <div className="reminder-days">
                {["L", "M", "X", "J", "V", "S", "D"].map((label, index) => {
                  const day = index + 1;
                  const chosen = settings.reminderDays.includes(day);
                  return (
                    <button
                      type="button"
                      key={day}
                      className={chosen ? "reminder-day-active" : ""}
                      aria-label={`Recordatorio ${["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"][index]}`}
                      aria-pressed={chosen}
                      onClick={() =>
                        void change({
                          reminderDays: chosen
                            ? settings.reminderDays.filter((item) => item !== day)
                            : [...settings.reminderDays, day].sort(),
                        })
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="notice-panel">
          <Icon name="bell" size={18} />
          <p>
            Sin un servidor push, los recordatorios en segundo plano no son fiables. iOS requiere añadir la PWA a inicio
            y el comportamiento depende del sistema; Android puede limitar tareas y avisos por ahorro de batería. Usa el
            calendario del dispositivo si necesitas un aviso garantizado.
          </p>
        </div>
      </section>

      <section className="settings-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RESPALDO LOCAL</p>
            <h2>Tus datos son tuyos</h2>
          </div>
          <Icon name="shieldCheck" />
        </div>
        <p className="muted-copy">
          La información vive en IndexedDB de este navegador. No hay cuentas, analítica ni sincronización. Un respaldo
          descargado te ayuda a conservarla al cambiar de dispositivo.
        </p>
        <div className="backup-actions">
          <Button variant="primary" icon="download" onClick={onExport}>
            Exportar respaldo JSON
          </Button>
          <Button variant="secondary" icon="upload" onClick={onImport}>
            Importar respaldo
          </Button>
          <span>
            Último respaldo:{" "}
            {lastBackupAt
              ? formatDate(lastBackupAt, { day: "numeric", month: "long", year: "numeric" })
              : "Todavía no creado"}
          </span>
        </div>
        {rollbackAt && (
          <div className="rollback-row">
            <span>
              Antes de la última restauración se guardó una copia de tus datos (
              {formatDate(rollbackAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}).
            </span>
            <Button variant="quiet" icon="history" onClick={onRollback}>
              Deshacer la restauración
            </Button>
          </div>
        )}
        <div className="storage-status">
          <div>
            <span>Almacenamiento persistente</span>
            <strong>{persistent === null ? "No disponible" : persistent ? "Concedido" : "No concedido"}</strong>
          </div>
          <div className="storage-meter">
            <i style={{ width: `${storagePercent}%` }} />
          </div>
          <small>
            {storageUsage?.usage
              ? `${(storageUsage.usage / (1024 * 1024)).toFixed(1)} MB usados de ${storageUsage.quota ? (storageUsage.quota / (1024 * 1024)).toFixed(0) : "?"} MB estimados.`
              : "El navegador no ha informado del espacio utilizado."}
          </small>
        </div>
        <p className="backup-note">
          Las copias no se sincronizan automáticamente. Exporta cada cierto tiempo y guarda el archivo en un lugar
          seguro.
        </p>
      </section>

      <section className="settings-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">INSTALACIÓN</p>
            <h2>Usar como aplicación</h2>
          </div>
          <Icon name="download" />
        </div>
        <p className="muted-copy">
          En Android usa el menú del navegador y elige instalar. En iPhone abre Safari, toca Compartir y selecciona
          Añadir a pantalla de inicio.
        </p>
        {installAvailable && (
          <Button variant="secondary" onClick={onInstall}>
            Instalar ManteYym
          </Button>
        )}
        <p className="app-version">ManteYym {APP_VERSION} · Aplicación local, sin servidor.</p>
      </section>

      <section className="settings-section safety-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">INFORMACIÓN Y SEGURIDAD</p>
            <h2>Entrena con criterio</h2>
          </div>
          <Icon name="shield" />
        </div>
        <p>
          ManteYym es una herramienta de registro y planificación general; no sustituye a un profesional de la salud.
          Ante dolor agudo, dolor persistente o condiciones médicas, consulta a un profesional. La alimentación y la
          nutrición no forman parte de esta aplicación.
        </p>
        <div className="settings-footer-actions">
          <a
            href="https://github.com/yuhonas/free-exercise-db"
            target="_blank"
            rel="noreferrer"
            className="text-action"
          >
            Fuente abierta de ejercicios <Icon name="external" size={16} />
          </a>
          <Button variant="danger" icon="trash" onClick={onClear}>
            Borrar datos de este dispositivo
          </Button>
        </div>
      </section>
    </div>
  );
}
