import { Icon } from "./components/Icon";
import { PainSheet, type PainSheetConfig } from "./components/PainSheet";
import { SessionEditor } from "./components/SessionEditor";
import { Button, DialogFrame, LocalBadge, NumericPad } from "./components/ui";
import { APP_VERSION, DAY_MS, NAV_ITEMS } from "./constants";
import { FREE_DB } from "./data/exerciseSource";
import {
  buildRoutine,
  elapsedSessionMs,
  isExerciseCompatible,
  makeId,
  normalizeRemoteExercise,
  sessionVolume,
} from "./engine/fitness";
import { downscaleImage } from "./lib/images";
import { metricsCsv, painCsv, sessionsCsv } from "./lib/records";
import {
  activePainZones,
  dayKey,
  newPainEntry,
  painSummary,
  redFlags,
  SAFETY_MESSAGE,
  todaysEntries,
} from "./lib/pain";
import { allTargetSets, completedSets, currentDay, cx, formatDate, weekIndex } from "./lib/format";
import { AdaptDialog } from "./screens/AdaptDialog";
import { ExerciseBrowser } from "./screens/ExerciseBrowser";
import { ExerciseCreateForm } from "./screens/ExerciseCreateForm";
import { ExerciseDetail } from "./screens/ExerciseDetail";
import { ExercisePicker } from "./screens/ExercisePicker";
import { Onboarding } from "./screens/Onboarding";
import { HistoryScreen } from "./screens/HistoryScreen";
import { PainScreen } from "./screens/PainScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { RoutineEditor } from "./screens/RoutineEditor";
import { RoutineListScreen } from "./screens/RoutineListScreen";
import { SessionSummary } from "./screens/SessionSummary";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { WorkoutSession } from "./screens/WorkoutSession";
import {
  commit,
  deleteRecord,
  exportBackup,
  getSnapshot,
  importBackup,
  initializeStore,
  resetStore,
  restoreRollback,
  rollbackSavedAt,
  saveMany,
  saveRecord,
  storageErrorMessage,
  subscribe,
  validateBackup,
} from "./store";
import type {
  ActiveSession,
  DailyCheckin,
  Exercise,
  LoggedSet,
  PainEntry,
  Profile,
  Routine,
  RoutineDay,
  SessionExercise,
  StoreName,
  TrainingSession,
} from "./types";
import { type ChangeEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import "./index.css";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}
function App() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState("");
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [storageUsage, setStorageUsage] = useState<{ usage?: number; quota?: number } | null>(null);
  const [tab, setTab] = useState<"hoy" | "rutinas" | "ejercicios" | "progreso" | "ajustes">(() =>
    new URLSearchParams(window.location.search).get("shortcut") === "progreso" ? "progreso" : "hoy",
  );
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [toast, setToast] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [exerciseDetail, setExerciseDetail] = useState<Exercise | null>(null);
  const [showExerciseCreate, setShowExerciseCreate] = useState(false);
  const [exercisePicker, setExercisePicker] = useState<{
    title: string;
    onPick: (exercise: Exercise) => void;
    preferred?: Exercise;
  } | null>(null);
  const [keypad, setKeypad] = useState<{
    title: string;
    value: number;
    unit: string;
    step: number;
    onSave: (value: number) => void;
  } | null>(null);
  const [adaptOpen, setAdaptOpen] = useState(false);
  const [subScreen, setSubScreen] = useState<"dolor" | "historial" | null>(null);
  const [editingSession, setEditingSession] = useState<TrainingSession | null>(null);
  const [undo, setUndo] = useState<{ label: string; run: () => Promise<void> } | null>(null);
  const undoTimer = useRef<number | null>(null);
  const [painSheet, setPainSheet] = useState<PainSheetConfig | null>(null);
  const [summary, setSummary] = useState<TrainingSession | null>(null);
  const [backupCandidate, setBackupCandidate] = useState<{
    value: unknown;
    summary: ReturnType<typeof validateBackup>["summary"];
  } | null>(null);
  const [libraryDownload, setLibraryDownload] = useState<{ active: boolean; progress: number; label: string }>({
    active: false,
    progress: 0,
    label: "",
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);
  const activeWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const serviceWorkerRegistration = useRef<ServiceWorkerRegistration | null>(null);
  const applyingUpdate = useRef(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const startingWorkout = useRef(false);
  const finishingWorkout = useRef(false);

  const activeRoutineId = state.meta.find((record) => record.id === "active-routine")?.routineId as string | undefined;
  const activeRoutine = state.routines.find((routine) => routine.id === activeRoutineId) ?? state.routines[0];
  const activeBlock = state.blocks.find((block) => block.routineId === activeRoutine?.id);
  const suggestedDay = currentDay(activeRoutine, state.sessions.length);
  const currentWeek = weekIndex(activeBlock, clockNow);
  const lastBackupAt = Number(state.meta.find((record) => record.id === "lastBackupAt")?.at ?? 0);
  const firstSeen = Number(state.meta.find((record) => record.id === "firstSeen")?.at ?? clockNow);
  const backupDue = clockNow - (lastBackupAt || firstSeen) > 14 * DAY_MS;
  const activeZones = activePainZones(state.painEntries).map((item) => item.zone);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3300);
  };

  useEffect(() => {
    let cancelled = false;
    void initializeStore()
      .then(async (result) => {
        if (cancelled) return;
        setPersistent(result.persistent);
        setReady(true);
        if (navigator.storage?.estimate) {
          const estimate = await navigator.storage.estimate();
          if (!cancelled) setStorageUsage({ usage: estimate.usage, quota: estimate.quota });
        }
      })
      .catch((error) => {
        if (!cancelled) setInitError(storageErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const updateNetwork = () => setOnline(navigator.onLine);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    const tick = window.setInterval(() => setClockNow(Date.now()), 60_000);
    return () => {
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.clearInterval(tick);
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const checkReminder = () => {
      const current = getSnapshot();
      const settings = current.settings;
      if (!settings.reminders || current.activeSession || document.visibilityState !== "visible") return;
      const now = new Date();
      const weekday = ((now.getDay() + 6) % 7) + 1;
      const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      if (!settings.reminderDays.includes(weekday) || now.toTimeString().slice(0, 5) !== settings.reminderTime) return;
      if (current.meta.find((record) => record.id === "lastReminderDay")?.dayKey === key) return;
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      if (current.sessions.some((session) => session.startedAt >= dayStart)) return;
      void saveRecord("meta", { id: "lastReminderDay", dayKey: key, at: Date.now() });
      if (
        settings.notifications &&
        "Notification" in window &&
        Notification.permission === "granted" &&
        navigator.serviceWorker?.controller
      ) {
        void navigator.serviceWorker.ready.then((registration) =>
          registration.showNotification("Tu sesión de ManteYym", {
            body: "Tu recordatorio local de entrenamiento está listo.",
            tag: "manteyym-recordatorio",
          }),
        );
      }
      notify("Tu recordatorio local de entrenamiento está listo.");
    };
    const timer = window.setInterval(checkReminder, 30_000);
    checkReminder();
    return () => window.clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
    document.documentElement.lang = "es";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", state.settings.theme === "dark" ? "#10130f" : "#f4f5ef");
  }, [state.settings.theme]);

  // Se registra una sola vez. El SW nuevo queda en espera hasta que el usuario toca "Aplicar ahora";
  // recién ahí, al cambiar el controlador, se recarga la página.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let stopped = false;
    const controllerListener = () => {
      if (applyingUpdate.current) window.location.reload();
    };
    void (async () => {
      const pathname = window.location.pathname;
      const basePath = pathname.endsWith("/")
        ? pathname
        : pathname.endsWith("index.html")
          ? pathname.slice(0, pathname.lastIndexOf("/") + 1)
          : `${pathname}/`;
      try {
        const registration = await navigator.serviceWorker.register(
          new URL(`${basePath}sw.js`, window.location.origin).href,
          { scope: basePath },
        );
        if (stopped) return;
        serviceWorkerRegistration.current = registration;
        if (registration.waiting && navigator.serviceWorker.controller) setUpdateAvailable(true);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) setUpdateAvailable(true);
          });
        });
        navigator.serviceWorker.addEventListener("controllerchange", controllerListener);
        void registration.update().catch(() => undefined);
      } catch {
        /* El modo web normal sigue disponible si el host no sirve service workers. */
      }
    })();
    return () => {
      stopped = true;
      navigator.serviceWorker.removeEventListener("controllerchange", controllerListener);
    };
  }, []);

  useEffect(() => {
    const active = state.activeSession;
    if (!active || active.status !== "running" || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let disposed = false;
    const requestLock = async () => {
      try {
        const wakeNavigator = navigator as Navigator & {
          wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
        };
        lock = (await wakeNavigator.wakeLock?.request("screen")) ?? null;
      } catch {
        /* Wake Lock puede rechazarse por ahorro de energia o falta de permiso. */
      }
    };
    const onVisible = () => {
      if (!disposed && document.visibilityState === "visible" && !lock) void requestLock();
    };
    void requestLock();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (lock) void lock.release().catch(() => undefined);
    };
  }, [state.activeSession?.status, state.activeSession?.id]);

  const safePersist = async <S extends StoreName>(store: S, record: Parameters<typeof saveRecord<S>>[1]) => {
    try {
      await saveRecord(store, record);
      return true;
    } catch (error) {
      notify(storageErrorMessage(error));
      return false;
    }
  };

  const updateActive = (transform: (current: ActiveSession) => ActiveSession) => {
    activeWriteQueue.current = activeWriteQueue.current
      .catch(() => undefined)
      .then(async () => {
        const current = getSnapshot().activeSession;
        if (!current) return;
        await saveRecord("activeSession", transform(current));
      })
      .catch((error) => {
        notify(storageErrorMessage(error));
      });
  };

  // ---- Registro de dolor (append-only; cada edición deja una revisión en la bitácora) ----
  const savePain = async (entry: PainEntry) => {
    const previous = getSnapshot().painEntries.find((item) => item.id === entry.id);
    const now = Date.now();
    const next: PainEntry = previous ? { ...entry, updatedAt: now, revision: (previous.revision ?? 1) + 1 } : entry;
    try {
      await commit(
        [{ store: "painEntries", put: next }],
        [
          previous
            ? {
                entity: "painEntries",
                entityId: next.id,
                action: "update",
                summary: `Dolor editado: ${painSummary(previous)} → ${painSummary(next)}`,
                before: previous,
                after: next,
              }
            : { entity: "painEntries", entityId: next.id, action: "create", summary: `Registro: ${painSummary(next)}` },
        ],
      );
      setPainSheet(null);
      notify(
        redFlags(next).length ? SAFETY_MESSAGE : previous ? "Registro actualizado." : "Registro de dolor guardado.",
      );
    } catch (error) {
      notify(storageErrorMessage(error));
    }
  };

  const logNoPain = async (when: PainEntry["when"] = "antes", context?: PainEntry["context"]) => {
    const entry = newPainEntry({ status: "sin_dolor", when, context });
    try {
      await commit(
        [{ store: "painEntries", put: entry }],
        [{ entity: "painEntries", entityId: entry.id, action: "create", summary: "Registro: sin dolor" }],
      );
      notify("Anotado: sin dolor.");
    } catch (error) {
      notify(storageErrorMessage(error));
    }
  };

  const resolvePain = (entry: PainEntry) => void savePain({ ...entry, ongoing: false, resolvedAt: Date.now() });

  const deletePain = async (entry: PainEntry) => {
    if (!window.confirm("¿Eliminar este registro? Quedará una copia en la bitácora de cambios.")) return;
    try {
      await commit(
        [{ store: "painEntries", delete: entry.id }],
        [
          {
            entity: "painEntries",
            entityId: entry.id,
            action: "delete",
            summary: `Eliminado: ${painSummary(entry)}`,
            before: entry,
          },
        ],
      );
      notify("Registro eliminado.");
    } catch (error) {
      notify(storageErrorMessage(error));
    }
  };

  const openPainSheet = (config: Partial<PainSheetConfig> = {}) =>
    setPainSheet({ title: "Registrar dolor", when: "fuera_de_entreno", suggestedZones: activeZones, ...config });

  /** Id estable de la sesión en curso, para vincular dolor y chequeo antes de que termine. */
  const activeSessionId = () => {
    const active = getSnapshot().activeSession;
    if (!active) return undefined;
    if (active.sessionId) return active.sessionId;
    const sessionId = makeId("session");
    updateActive((current) => ({ ...current, sessionId: current.sessionId ?? sessionId }));
    return sessionId;
  };

  // ---- Chequeo previo (uno por día; se vincula a la sesión al terminar) ----
  const saveCheckin = async (values: Record<string, number>) => {
    const now = Date.now();
    const key = dayKey(now);
    const previous = getSnapshot().dailyCheckins.find((item) => item.dayKey === key && !item.sessionId);
    const checkin: DailyCheckin = {
      ...(previous ?? { id: makeId("checkin"), createdAt: now }),
      at: now,
      dayKey: key,
      sleepQuality: values.sueno,
      energy: values.energia,
      soreness: values.agujetas,
      stress: values.estres,
      sleepHours: values.horas || undefined,
      mood: values.animo || undefined,
      updatedAt: now,
      revision: (previous?.revision ?? 0) + 1,
    };
    try {
      await commit(
        [{ store: "dailyCheckins", put: checkin }],
        [
          {
            entity: "dailyCheckins",
            entityId: checkin.id,
            action: previous ? "update" : "create",
            summary: "Chequeo de disposición",
            before: previous,
            after: checkin,
          },
        ],
      );
      notify("Chequeo guardado; se vinculará a tu próxima sesión de hoy.");
    } catch (error) {
      notify(storageErrorMessage(error));
    }
  };

  /** Cierre de sesión: "sin dolor" se guarda al toque; "con molestia" abre la hoja vinculada a la sesión. */
  const endSessionPain = async (session: TrainingSession, status: "sin_dolor" | "con_molestia") => {
    const now = Date.now();
    const updated: TrainingSession = {
      ...session,
      endPain: status,
      updatedAt: now,
      revision: (session.revision ?? 1) + 1,
    };
    try {
      await commit(
        [{ store: "sessions", put: updated }],
        [{ entity: "sessions", entityId: session.id, action: "update", summary: "Estado de dolor al terminar" }],
      );
      setSummary(updated);
    } catch (error) {
      notify(storageErrorMessage(error));
      return;
    }
    if (status === "sin_dolor") await logNoPain("despues", { sessionId: session.id });
    else openPainSheet({ title: "¿Dónde quedó la molestia?", when: "despues", context: { sessionId: session.id } });
  };

  // ---- Historial editable ----
  const offerUndo = (label: string, run: () => Promise<void>) => {
    setUndo({ label, run });
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndo(null), 10_000);
  };

  const saveEditedSession = async (edited: TrainingSession) => {
    const previous = getSnapshot().sessions.find((item) => item.id === edited.id);
    if (!previous) return;
    const next: TrainingSession = { ...edited, updatedAt: Date.now(), revision: (previous.revision ?? 1) + 1 };
    try {
      await commit(
        [{ store: "sessions", put: next }],
        [
          {
            entity: "sessions",
            entityId: next.id,
            action: "update",
            summary: `Sesión ${next.dayName} editada`,
            before: previous,
            after: next,
          },
        ],
      );
      setEditingSession(null);
      notify("Sesión actualizada. Volumen y marcas recalculados.");
    } catch (error) {
      notify(storageErrorMessage(error));
    }
  };

  const deleteSession = async (session: TrainingSession) => {
    if (!window.confirm(`¿Eliminar la sesión «${session.dayName}» del ${formatDate(session.startedAt)}?`)) return;
    try {
      await commit(
        [{ store: "sessions", delete: session.id }],
        [
          {
            entity: "sessions",
            entityId: session.id,
            action: "delete",
            summary: `Sesión ${session.dayName} eliminada`,
            before: session,
          },
        ],
      );
      setEditingSession(null);
      offerUndo("Sesión eliminada.", async () => {
        await commit(
          [{ store: "sessions", put: session }],
          [
            {
              entity: "sessions",
              entityId: session.id,
              action: "restore",
              summary: `Sesión ${session.dayName} restaurada`,
            },
          ],
        );
        notify("Sesión restaurada.");
      });
    } catch (error) {
      notify(storageErrorMessage(error));
    }
  };

  const downloadText = (filename: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportCsv = () => {
    const snapshot = getSnapshot();
    const date = new Date().toISOString().slice(0, 10);
    downloadText(
      `ManteYym-sesiones-${date}.csv`,
      sessionsCsv(snapshot.sessions, snapshot.exercises, snapshot.profile.units),
      "text/csv",
    );
    downloadText(`ManteYym-dolor-${date}.csv`, painCsv(snapshot.painEntries), "text/csv");
    downloadText(`ManteYym-medidas-${date}.csv`, metricsCsv(snapshot.bodyMetrics), "text/csv");
    notify("Se descargaron 3 archivos CSV (sesiones, dolor y medidas).");
  };

  const setRoutineActive = async (routine: Routine) => {
    await safePersist("meta", { id: "active-routine", routineId: routine.id });
    if (!getSnapshot().blocks.some((block) => block.routineId === routine.id)) {
      await safePersist("blocks", {
        id: makeId("block"),
        routineId: routine.id,
        name: "Bloque inicial",
        startAt: Date.now(),
        weeks: 6,
        deloadWeek: 6,
      });
    }
    notify(`${routine.name} es ahora tu rutina activa.`);
  };

  const createRoutine = async (template: string) => {
    const routine = buildRoutine(getSnapshot().profile, getSnapshot().exercises, undefined, template);
    const saved = await safePersist("routines", routine);
    if (saved) {
      await setRoutineActive(routine);
      setEditingRoutineId(routine.id);
    }
  };

  const createBlankRoutine = async () => {
    const profile = getSnapshot().profile;
    const days = Array.from({ length: profile.days }, (_, index) => ({
      id: makeId("day"),
      name: `Sesión ${index + 1}`,
      note: "",
      exercises: [],
    }));
    const routine: Routine = {
      id: makeId("routine"),
      name: "Rutina personalizada",
      split: "Personalizada",
      template: "personal",
      createdAt: Date.now(),
      days,
    };
    const saved = await safePersist("routines", routine);
    if (saved) {
      await setRoutineActive(routine);
      setEditingRoutineId(routine.id);
    }
  };

  const saveProfile = async (profile: Profile, regenerate: boolean) => {
    const saved = await safePersist("profile", profile);
    if (!saved) throw new Error("No se pudo guardar el perfil.");
    const injuryIds = new Set(profile.injuries.map((injury) => injury.id));
    await Promise.all(
      getSnapshot()
        .injuries.filter((injury) => !injuryIds.has(injury.id))
        .map((injury) => deleteRecord("injuries", injury.id)),
    );
    await Promise.all(profile.injuries.map((injury) => safePersist("injuries", injury)));
    if (regenerate) {
      const routine = buildRoutine(profile, getSnapshot().exercises, undefined, "auto");
      const created = await safePersist("routines", routine);
      if (created) await setRoutineActive(routine);
    }
    setEditingProfile(false);
    setTab("hoy");
    notify(regenerate ? "Perfil actualizado y rutina generada." : "Perfil actualizado.");
  };

  const startWorkout = async (day: RoutineDay) => {
    if (!day.exercises.length) {
      notify("Esta sesión no tiene ejercicios compatibles. Edita la rutina para añadir movimientos.");
      return;
    }
    if (startingWorkout.current) return;
    if (getSnapshot().activeSession) {
      setTab("hoy");
      return;
    }
    startingWorkout.current = true;
    const now = Date.now();
    const deload = activeBlock && currentWeek === activeBlock.deloadWeek;
    const planned = day.exercises.map((plan): SessionExercise => {
      const previousSession = getSnapshot().sessions.find((session) =>
        session.exercises.some((item) => item.exerciseId === plan.exerciseId),
      );
      const previousSet = previousSession?.exercises
        .find((item) => item.exerciseId === plan.exerciseId)
        ?.sets.filter((set) => set.completed)
        .at(-1);
      const movement = getSnapshot().exercises.find((exercise) => exercise.id === plan.exerciseId);
      const weeklyAddition =
        !deload &&
        currentWeek >= 3 &&
        currentWeek < (activeBlock?.deloadWeek ?? 6) &&
        currentWeek % 2 === 1 &&
        movement?.category === "compuesto"
          ? 1
          : 0;
      const targetSets = deload ? Math.max(1, Math.ceil(plan.sets * 0.6)) : plan.sets + weeklyAddition;
      return {
        exerciseId: plan.exerciseId,
        targetSets,
        repsMin: plan.repsMin,
        repsMax: plan.repsMax,
        restSec: plan.restSec || getSnapshot().settings.defaultRest,
        note: plan.note,
        superset: plan.superset,
        groupType: plan.groupType,
        sets: Array.from(
          { length: targetSets },
          () =>
            ({
              id: makeId("set"),
              weight: previousSet?.weight ?? 0,
              reps: previousSet?.reps ?? plan.repsMin,
              type: "normal",
              rir: null,
              rpe: null,
              note: "",
              completed: false,
            }) as LoggedSet,
        ),
      };
    });
    const active: ActiveSession = {
      id: "current",
      sessionId: makeId("session"),
      routineId: activeRoutine?.id ?? "sin-rutina",
      dayId: day.id,
      dayName: day.name,
      startedAt: now,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      segmentStartedAt: now,
      elapsedBeforePause: 0,
      status: "running",
      restEndsAt: null,
      restDurationSec: 0,
      currentExercise: 0,
      exercises: planned,
      notes: "",
    };
    try {
      const saved = await safePersist("activeSession", active);
      if (saved && deload) notify("Semana de descarga: volumen reducido de forma automática.");
    } finally {
      startingWorkout.current = false;
    }
  };

  const finishWorkout = async () => {
    if (finishingWorkout.current) return;
    finishingWorkout.current = true;
    try {
      await activeWriteQueue.current;
      const active = getSnapshot().activeSession;
      if (!active) return;
      const completed = completedSets(active.exercises);
      if (completed === 0 && !window.confirm("No completaste ninguna serie. ¿Guardar igualmente esta sesión?")) return;
      if (
        completed > 0 &&
        completed < allTargetSets(active.exercises) &&
        !window.confirm("Hay series pendientes. ¿Finalizar y guardar la sesión tal como está?")
      )
        return;
      const endedAt = Date.now();
      const checkin = getSnapshot().dailyCheckins.find(
        (item) => item.dayKey === dayKey(active.startedAt) && !item.sessionId,
      );
      const record: TrainingSession = {
        id: active.sessionId ?? makeId("session"),
        createdAt: endedAt,
        updatedAt: endedAt,
        revision: 1,
        checkinId: checkin?.id,
        routineId: active.routineId,
        dayId: active.dayId,
        dayName: active.dayName,
        startedAt: active.startedAt,
        endedAt,
        timeZone: active.timeZone,
        durationMs: elapsedSessionMs(active.startedAt, active.elapsedBeforePause, active.segmentStartedAt, endedAt),
        volume: sessionVolume(active.exercises),
        notes: active.notes,
        exercises: active.exercises,
      };
      try {
        await commit(
          [
            { store: "sessions", put: record },
            ...(checkin ? [{ store: "dailyCheckins" as const, put: { ...checkin, sessionId: record.id } }] : []),
          ],
          [
            {
              entity: "sessions",
              entityId: record.id,
              action: "create",
              summary: `Sesión ${record.dayName} terminada`,
            },
          ],
        );
      } catch (error) {
        notify(storageErrorMessage(error));
        return;
      }
      await deleteRecord("activeSession", "current");
      const previous = getSnapshot().sessions.find(
        (session) => session.dayId === record.dayId && session.id !== record.id,
      );
      setSummary(record);
      if (!previous) notify("Sesión guardada. Buen comienzo para tu historial.");
    } finally {
      finishingWorkout.current = false;
    }
  };

  const discardWorkout = async () => {
    if (
      !getSnapshot().activeSession ||
      !window.confirm("¿Descartar la sesión en curso y sus series? Esta acción no se puede deshacer.")
    )
      return;
    await activeWriteQueue.current;
    await deleteRecord("activeSession", "current");
    notify("Sesión descartada.");
  };

  const togglePause = () =>
    updateActive((active) =>
      active.status === "running"
        ? {
            ...active,
            status: "paused",
            elapsedBeforePause: elapsedSessionMs(active.startedAt, active.elapsedBeforePause, active.segmentStartedAt),
            segmentStartedAt: null,
            restEndsAt: null,
          }
        : { ...active, status: "running", segmentStartedAt: Date.now() },
    );

  const handleAdapt = (change: {
    minutes: number;
    reason: string;
    zone: string;
    equipment: string;
    explanation: string;
  }) => {
    updateActive((active) => {
      let exercises = [...active.exercises];
      if (change.reason === "tiempo") {
        const maximum = change.minutes <= 20 ? 3 : change.minutes <= 30 ? 4 : change.minutes <= 45 ? 5 : 6;
        exercises = exercises.slice(0, maximum).map((item) => ({
          ...item,
          targetSets: change.minutes <= 20 ? Math.min(2, item.targetSets) : item.targetSets,
          sets: item.sets.slice(0, change.minutes <= 20 ? 2 : item.sets.length),
        }));
      }
      if (change.reason === "molestia") {
        // Sugerencia elegida por el usuario: se quitan los ejercicios que cargan la zona indicada.
        const profile = getSnapshot().profile;
        exercises = exercises.filter((item) => {
          const movement = getSnapshot().exercises.find((exercise) => exercise.id === item.exerciseId);
          return !movement || isExerciseCompatible(movement, profile, true, [change.zone]);
        });
      }
      if (change.reason === "equipo") {
        const equipment =
          change.equipment === "mancuernas" ? ["mancuernas", "peso corporal"] : ["bandas", "peso corporal"];
        const adaptedProfile = { ...getSnapshot().profile, equipment };
        exercises = exercises.flatMap((item) => {
          const original = getSnapshot().exercises.find((exercise) => exercise.id === item.exerciseId);
          if (!original || isExerciseCompatible(original, adaptedProfile)) return [item];
          const alternative = getSnapshot().exercises.find(
            (exercise) =>
              exercise.id !== item.exerciseId &&
              exercise.pattern === original.pattern &&
              (exercise.muscle === original.muscle || exercise.secondary.includes(original.muscle)) &&
              isExerciseCompatible(exercise, adaptedProfile),
          );
          return alternative ? [{ ...item, exerciseId: alternative.id }] : [];
        });
      }
      return {
        ...active,
        exercises,
        currentExercise: Math.min(active.currentExercise, Math.max(0, exercises.length - 1)),
      };
    });
    notify(change.explanation);
  };

  const downloadBackup = async () => {
    try {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ManteYym-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      await saveRecord("meta", { id: "lastBackupAt", at: Date.now() });
      notify("Respaldo exportado. Guárdalo fuera del navegador para conservarlo.");
    } catch (error) {
      notify(storageErrorMessage(error));
    }
  };

  const onBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) {
      notify("El respaldo supera el límite de 200 MB.");
      event.target.value = "";
      return;
    }
    try {
      const value = JSON.parse(await file.text()) as unknown;
      const checked = validateBackup(value);
      setBackupCandidate({ value, summary: checked.summary });
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo leer el respaldo.");
    }
    event.target.value = "";
  };

  const confirmImport = async () => {
    if (!backupCandidate) return;
    try {
      const result = await importBackup(backupCandidate.value);
      await saveRecord("meta", { id: "lastBackupAt", at: Date.now() });
      setBackupCandidate(null);
      setTab("hoy");
      notify(
        `Restaurados ${result.routines} rutinas, ${result.sessions} sesiones y ${result.exercises} ejercicios. Copia anterior guardada en este dispositivo.`,
      );
    } catch (error) {
      notify(storageErrorMessage(error));
    }
  };

  const undoImport = async () => {
    if (!window.confirm("¿Volver a los datos que tenías antes de la última restauración?")) return;
    try {
      await restoreRollback();
      notify("Se restauraron los datos previos a la importación.");
    } catch (error) {
      notify(storageErrorMessage(error));
    }
  };

  const downloadLibrary = async () => {
    setLibraryDownload({ active: true, progress: 0, label: "Preparando descarga" });
    try {
      const partialRecord = getSnapshot().meta.find((record) => record.id === "library-download-state");
      let base = partialRecord?.bytes instanceof Uint8Array ? partialRecord.bytes : new Uint8Array();
      const headers = base.length ? { Range: `bytes=${base.length}-` } : undefined;
      const response = await fetch(FREE_DB.dataUrl, { headers, cache: "no-store" });
      if (!response.ok) throw new Error(`El catálogo respondió con código ${response.status}.`);
      if (response.status !== 206) base = new Uint8Array();
      const contentRange = response.headers.get("content-range");
      const rangeTotal = contentRange?.match(/\/(\d+)$/)?.[1];
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      const totalBytes = Number(rangeTotal) || contentLength + base.length;
      const chunks: Uint8Array[] = [];
      let received = 0;
      let storedAt = 0;
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const read = await reader.read();
          if (read.done) break;
          if (read.value) {
            chunks.push(read.value);
            received += read.value.length;
            const totalReceived = base.length + received;
            const progress = totalBytes ? Math.min(97, Math.round((totalReceived / totalBytes) * 100)) : 0;
            setLibraryDownload({
              active: true,
              progress,
              label: totalBytes
                ? `Descargando biblioteca · ${progress}%`
                : `Descargando · ${(totalReceived / 1048576).toFixed(1)} MB`,
            });
            if (totalReceived - storedAt >= 1_000_000) {
              const partial = new Uint8Array(totalReceived);
              partial.set(base);
              let offset = base.length;
              chunks.forEach((chunk) => {
                partial.set(chunk, offset);
                offset += chunk.length;
              });
              await saveRecord("meta", { id: "library-download-state", bytes: partial, totalBytes });
              storedAt = totalReceived;
            }
          }
        }
      } else {
        chunks.push(new Uint8Array(await response.arrayBuffer()));
        received = chunks[0].length;
      }
      const bytes = new Uint8Array(base.length + received);
      bytes.set(base);
      let offset = base.length;
      chunks.forEach((chunk) => {
        bytes.set(chunk, offset);
        offset += chunk.length;
      });
      let json: unknown;
      try {
        json = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      } catch {
        await saveRecord("meta", { id: "library-download-state", bytes, totalBytes });
        throw new Error("La descarga quedó incompleta. Vuelve a intentarlo para reanudarla.");
      }
      if (!Array.isArray(json)) throw new Error("El formato remoto del catálogo no es el esperado.");
      const exercises = json
        .map((raw) => normalizeRemoteExercise(raw))
        .filter((exercise): exercise is Exercise => Boolean(exercise));
      await saveMany("exercises", exercises);
      await deleteRecord("meta", "library-download-state");
      setLibraryDownload({
        active: false,
        progress: 100,
        label: `${exercises.length} ejercicios disponibles sin conexión`,
      });
      notify(`Biblioteca descargada. ${exercises.length} ejercicios guardados en el dispositivo.`);
    } catch (error) {
      setLibraryDownload((current) => ({
        ...current,
        active: false,
        label: "Descarga interrumpida; puedes reanudarla",
      }));
      notify(error instanceof Error ? error.message : "No se pudo descargar la biblioteca. Comprueba tu conexión.");
    }
  };

  const addExercise = async (exercise: Exercise) => {
    await safePersist("exercises", exercise);
    notify("Ejercicio guardado en tu catálogo local.");
  };
  const openSessionPicker = (index: number) => {
    const active = getSnapshot().activeSession;
    const preferred = active
      ? getSnapshot().exercises.find((exercise) => exercise.id === active.exercises[index]?.exerciseId)
      : undefined;
    setExercisePicker({
      title: "Cambiar ejercicio",
      preferred,
      onPick: (exercise) => {
        updateActive((current) => ({
          ...current,
          exercises: current.exercises.map((item, itemIndex) =>
            itemIndex === index
              ? {
                  ...item,
                  exerciseId: exercise.id,
                  status: "sustituido" as const,
                  statusReason: item.statusReason ?? ("otro" as const),
                  replacedExerciseId: item.replacedExerciseId ?? item.exerciseId,
                }
              : item,
          ),
        }));
        notify(`Sustituido por ${exercise.name}, del mismo patrón cuando hay una alternativa disponible.`);
      },
    });
  };

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") notify("ManteYym se agregó a tus aplicaciones.");
    setInstallPrompt(null);
  };

  const clearAll = async () => {
    if (
      !window.confirm(
        "Se borrarán rutinas, sesiones, fotos y ajustes locales. Primero descarga un respaldo si quieres conservarlos.",
      )
    )
      return;
    if (!window.confirm("Confirmación final: ¿borrar todos los datos locales de ManteYym en este navegador?")) return;
    try {
      await resetStore();
      setEditingProfile(false);
      setTab("hoy");
      notify("Datos locales borrados. La biblioteca base se ha restaurado.");
    } catch (error) {
      notify(storageErrorMessage(error));
    }
  };

  if (initError)
    return (
      <main className="loading-screen">
        <span className="brand-mark">
          <Icon name="ejercicios" size={21} />
        </span>
        <h1>No se pudo iniciar ManteYym</h1>
        <p>{initError}</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reintentar
        </Button>
      </main>
    );
  if (!ready)
    return (
      <main className="loading-screen">
        <span className="brand-mark">
          <Icon name="ejercicios" size={21} />
        </span>
        <p className="eyebrow">MANTEYYM</p>
        <div className="loading-line" />
        <span className="muted-copy">Preparando tu espacio local...</span>
      </main>
    );
  if (!state.profile.onboardingComplete) return <Onboarding initialProfile={state.profile} onComplete={saveProfile} />;
  if (editingProfile)
    return (
      <Onboarding
        initialProfile={state.profile}
        edit
        onCancel={() => setEditingProfile(false)}
        onComplete={saveProfile}
      />
    );

  const showAppScreen = () => {
    if (state.activeSession)
      return (
        <WorkoutSession
          active={state.activeSession}
          profile={state.profile}
          settings={state.settings}
          catalog={state.exercises}
          history={state.sessions}
          onChange={(transform) => updateActive(transform)}
          onFinish={() => void finishWorkout()}
          onDiscard={() => void discardWorkout()}
          onPause={togglePause}
          onOpenExercise={setExerciseDetail}
          onOpenPicker={openSessionPicker}
          onAdapt={() => setAdaptOpen(true)}
          onPain={(context) =>
            openPainSheet({
              title: "Molestia durante la sesión",
              when: "durante",
              quick: true,
              context: { sessionId: activeSessionId(), ...context },
            })
          }
          onKeypad={setKeypad}
          onToast={notify}
          onRestFinished={() => updateActive((active) => ({ ...active, restEndsAt: null }))}
        />
      );
    if (subScreen === "historial")
      return (
        <HistoryScreen
          sessions={state.sessions}
          routines={state.routines}
          catalog={state.exercises}
          units={state.profile.units}
          onBack={() => setSubScreen(null)}
          onEdit={setEditingSession}
        />
      );
    if (subScreen === "dolor")
      return (
        <PainScreen
          entries={state.painEntries}
          sessions={state.sessions}
          catalog={state.exercises}
          onBack={() => setSubScreen(null)}
          onLog={() => openPainSheet()}
          onNoPain={() => void logNoPain("fuera_de_entreno")}
          onEdit={(entry) => openPainSheet({ title: "Editar registro", initial: entry, when: entry.when })}
          onResolve={resolvePain}
          onDelete={(entry) => void deletePain(entry)}
        />
      );
    if (tab === "hoy")
      return (
        <TodayScreen
          profile={state.profile}
          routine={activeRoutine}
          day={suggestedDay}
          block={activeBlock}
          sessions={state.sessions}
          exercises={state.exercises}
          onStart={(day) => void startWorkout(day)}
          onOpenRoutines={() => setTab("rutinas")}
          onBackup={() => void downloadBackup()}
          backupDue={backupDue}
          onSaveReadiness={(values) => void saveCheckin(values)}
          painToday={todaysEntries(state.painEntries, clockNow)}
          activeZones={activeZones}
          onNoPain={() => void logNoPain("antes")}
          onLogPain={() => openPainSheet({ when: "antes" })}
          onOpenPain={() => setSubScreen("dolor")}
        />
      );
    if (tab === "rutinas") {
      const edited = state.routines.find((routine) => routine.id === editingRoutineId);
      if (edited)
        return (
          <RoutineEditor
            routine={edited}
            catalog={state.exercises}
            onSave={async (routine) => {
              await safePersist("routines", routine);
              notify("Cambios de rutina guardados.");
            }}
            onClose={() => setEditingRoutineId(null)}
            onPickExercise={(callback) =>
              setExercisePicker({ title: "Añadir ejercicio a la rutina", onPick: callback })
            }
          />
        );
      return (
        <RoutineListScreen
          routines={state.routines}
          activeId={activeRoutine?.id}
          activeBlock={activeBlock}
          profile={state.profile}
          onCreate={(template) => void createRoutine(template)}
          onNew={() => void createBlankRoutine()}
          onUpdateBlock={(block) =>
            void safePersist("blocks", block).then(
              (saved) => saved && notify(`Bloque actualizado a ${block.weeks} semanas.`),
            )
          }
          onEdit={(routine) => setEditingRoutineId(routine.id)}
          onSelect={(routine) => void setRoutineActive(routine)}
          onDuplicate={(routine) => {
            const copy: Routine = {
              ...routine,
              id: makeId("routine"),
              name: `${routine.name} (copia)`,
              createdAt: Date.now(),
              days: routine.days.map((day) => ({
                ...day,
                id: makeId("day"),
                exercises: day.exercises.map((item) => ({ ...item })),
              })),
            };
            void safePersist("routines", copy).then((saved) => saved && notify("Rutina duplicada."));
          }}
          onDelete={(routine) => {
            if (window.confirm(`¿Eliminar la rutina «${routine.name}»? Las sesiones guardadas no se borrarán.`))
              void deleteRecord("routines", routine.id).then(() => {
                if (routine.id === activeRoutine?.id) {
                  const next = getSnapshot().routines.find((item) => item.id !== routine.id);
                  if (next) void setRoutineActive(next);
                  else void deleteRecord("meta", "active-routine");
                }
                if (editingRoutineId === routine.id) setEditingRoutineId(null);
                notify("Rutina eliminada.");
              });
          }}
        />
      );
    }
    if (tab === "ejercicios")
      return (
        <ExerciseBrowser
          catalog={state.exercises}
          onOpen={setExerciseDetail}
          onDownload={() => void downloadLibrary()}
          onCreate={() => setShowExerciseCreate(true)}
          downloading={libraryDownload.active}
          downloadLabel={
            libraryDownload.label ||
            (libraryDownload.progress ? `${libraryDownload.progress}% descargado` : "Descargar biblioteca completa")
          }
        />
      );
    if (tab === "progreso")
      return (
        <ProgressScreen
          profile={state.profile}
          sessions={state.sessions}
          catalog={state.exercises}
          metrics={state.bodyMetrics}
          painEntries={state.painEntries}
          onOpenPain={() => setSubScreen("dolor")}
          onOpenHistory={() => setSubScreen("historial")}
          goals={state.goals}
          cardio={state.cardio}
          photos={state.photos}
          onOpenExercise={setExerciseDetail}
          onAddMetric={(metric) => safePersist("bodyMetrics", metric).then(() => notify("Medición guardada."))}
          onAddGoal={(goal) => safePersist("goals", goal).then(() => notify("Objetivo guardado."))}
          onDeleteGoal={(goal) => deleteRecord("goals", goal.id).then(() => notify("Objetivo eliminado."))}
          onAddCardio={(record) => safePersist("cardio", record).then(() => notify("Sesión de cardio guardada."))}
          onAddPhoto={async (file, label) =>
            safePersist("photos", {
              id: makeId("photo"),
              at: Date.now(),
              label: label || file.name,
              blob: await downscaleImage(file),
            }).then((saved) => {
              if (saved) notify("Foto guardada en el dispositivo.");
            })
          }
          onDeletePhoto={(id) => deleteRecord("photos", id).then(() => notify("Foto eliminada del dispositivo."))}
        />
      );
    return (
      <SettingsScreen
        profile={state.profile}
        settings={state.settings}
        lastBackupAt={lastBackupAt}
        persistent={persistent}
        storageUsage={storageUsage}
        onProfile={() => setEditingProfile(true)}
        onSaveSettings={(settings) =>
          safePersist("settings", settings).then((saved) => {
            if (saved) notify("Ajuste guardado.");
          })
        }
        onExport={() => void downloadBackup()}
        onImport={() => fileInput.current?.click()}
        onClear={() => void clearAll()}
        rollbackAt={rollbackSavedAt()}
        onExportCsv={exportCsv}
        auditLog={state.auditLog}
        onRollback={() => void undoImport()}
        onInstall={() => void installApp()}
        installAvailable={Boolean(installPrompt)}
        onToast={notify}
      />
    );
  };

  return (
    <div className={cx("app-shell", state.activeSession && "app-shell-session")}>
      {!state.activeSession && (
        <header className="app-header">
          <div className="app-brand">
            <span className="brand-mark">
              <Icon name="ejercicios" size={19} />
            </span>
            <strong>ManteYym</strong>
            <span className="brand-divider" />
            <span className="brand-tagline">ENTRENADOR LOCAL</span>
          </div>
          <div className="header-right">
            <LocalBadge online={online} />
            <span className="header-date">
              {formatDate(clockNow, { weekday: "short", day: "numeric", month: "short" })}
            </span>
            {state.activeSession && (
              <span className="session-header-dot">
                <i /> Sesión en curso
              </span>
            )}
          </div>
        </header>
      )}
      {updateAvailable && (
        <div className="update-banner" role="status">
          <span>Actualización disponible. Tu sesión activa seguirá guardada.</span>
          <Button
            variant="quiet"
            onClick={() => {
              const waiting = serviceWorkerRegistration.current?.waiting;
              if (!waiting) {
                window.location.reload();
                return;
              }
              applyingUpdate.current = true;
              waiting.postMessage({ type: "SKIP_WAITING" });
            }}
          >
            Aplicar ahora
          </Button>
        </div>
      )}
      <div className={cx("app-frame", state.activeSession && "app-frame-full")}>
        {!state.activeSession && (
          <aside className="desktop-sidebar">
            <div className="sidebar-brand">
              <span className="brand-mark">
                <Icon name="ejercicios" size={20} />
              </span>
              <div>
                <strong>ManteYym</strong>
                <small>FUERZA A TU MANERA</small>
              </div>
            </div>
            <nav aria-label="Navegación principal">
              {NAV_ITEMS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={cx("nav-item", tab === item.id && "nav-item-active")}
                  aria-current={tab === item.id ? "page" : undefined}
                  onClick={() => {
                    setTab(item.id);
                    setEditingRoutineId(null);
                    setSubScreen(null);
                  }}
                >
                  <Icon name={item.icon} size={20} />
                  <span>{item.label}</span>
                  {item.id === "hoy" && state.activeSession && <i />}
                </button>
              ))}
            </nav>
            <div className="sidebar-footer">
              <span className="sidebar-dot" />
              <span>DATOS SOLO LOCALES</span>
              <small>v{APP_VERSION}</small>
            </div>
          </aside>
        )}
        <main
          className={cx("main-content", state.activeSession && "main-content-session")}
          id="contenido-principal"
          tabIndex={-1}
        >
          {showAppScreen()}
        </main>
      </div>
      {!state.activeSession && (
        <nav className="bottom-nav" aria-label="Navegación inferior">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={cx("bottom-nav-item", tab === item.id && "bottom-nav-active")}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => {
                setTab(item.id);
                setEditingRoutineId(null);
                setSubScreen(null);
              }}
            >
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        onChange={(event) => void onBackupFile(event)}
        aria-label="Seleccionar archivo de respaldo"
      />
      {exerciseDetail && (
        <ExerciseDetail
          exercise={exerciseDetail}
          catalog={state.exercises}
          sessions={state.sessions}
          units={state.profile.units}
          onClose={() => setExerciseDetail(null)}
        />
      )}
      {showExerciseCreate && <ExerciseCreateForm onClose={() => setShowExerciseCreate(false)} onCreate={addExercise} />}
      {exercisePicker && (
        <ExercisePicker
          title={exercisePicker.title}
          catalog={state.exercises}
          preferred={exercisePicker.preferred}
          onClose={() => setExercisePicker(null)}
          onChoose={(exercise) => {
            exercisePicker.onPick(exercise);
            setExercisePicker(null);
          }}
        />
      )}
      {keypad && <NumericPad config={keypad} onClose={() => setKeypad(null)} />}
      {editingSession && (
        <SessionEditor
          session={editingSession}
          catalog={state.exercises}
          units={state.profile.units}
          onSave={(session) => void saveEditedSession(session)}
          onDelete={() => void deleteSession(editingSession)}
          onClose={() => setEditingSession(null)}
        />
      )}
      {undo && (
        <div className="undo-banner" role="status">
          <span>{undo.label}</span>
          <Button
            variant="secondary"
            onClick={() => {
              const action = undo.run;
              setUndo(null);
              void action().catch((error) => notify(storageErrorMessage(error)));
            }}
          >
            Deshacer
          </Button>
        </div>
      )}
      {painSheet && (
        <PainSheet config={painSheet} onSave={(entry) => void savePain(entry)} onClose={() => setPainSheet(null)} />
      )}
      {state.activeSession && adaptOpen && (
        <AdaptDialog
          activeZones={activeZones}
          onClose={() => setAdaptOpen(false)}
          onApply={(change) => {
            handleAdapt(change);
            setAdaptOpen(false);
          }}
        />
      )}
      {summary && (
        <SessionSummary
          session={summary}
          previous={state.sessions.find((session) => session.id !== summary.id && session.dayId === summary.dayId)}
          profile={state.profile}
          exercises={state.exercises}
          onClose={() => setSummary(null)}
          onEndPain={(status) => void endSessionPain(summary, status)}
          onRate={(sessionRpe) => {
            const updated = { ...summary, sessionRpe, updatedAt: Date.now() };
            void commit([{ store: "sessions", put: updated }]).then(() => setSummary(updated));
          }}
          onProgress={() => {
            setSummary(null);
            setTab("progreso");
          }}
        />
      )}
      {backupCandidate && (
        <DialogFrame title="Revisar respaldo" onClose={() => setBackupCandidate(null)}>
          <div className="form-stack">
            <p>
              El archivo es válido. Al restaurarlo, los datos locales actuales se reemplazaran. Antes se guardará una
              copia automática dentro de este dispositivo.
            </p>
            <div className="backup-summary-list">
              <span>
                Rutinas <strong>{backupCandidate.summary.routines}</strong>
              </span>
              <span>
                Sesiones <strong>{backupCandidate.summary.sessions}</strong>
              </span>
              <span>
                Ejercicios <strong>{backupCandidate.summary.exercises}</strong>
              </span>
              <span>
                Fotos <strong>{backupCandidate.summary.photos}</strong>
              </span>
              <span>
                Exportado{" "}
                <strong>
                  {formatDate(backupCandidate.summary.exportedAt, { day: "numeric", month: "short", year: "numeric" })}
                </strong>
              </span>
            </div>
            <div className="sheet-actions">
              <Button variant="quiet" onClick={() => setBackupCandidate(null)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => void confirmImport()}>
                Restaurar datos
              </Button>
            </div>
          </div>
        </DialogFrame>
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span className="toast-mark">
            <Icon name="check" size={16} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
