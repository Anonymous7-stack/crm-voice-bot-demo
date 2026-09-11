"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Inter, Roboto_Condensed } from "next/font/google";

type CallState = "ready" | "starting" | "polling" | "success" | "error";
type FeedbackState = "idle" | "sending" | "success" | "error";
type Verkaufsprozess = { ziel?: string | null; loesung?: string | null; brand?: string | null; fokus?: string | null };
type DemoVisit = {
  visit_id: string;
  erstellt_am: string;
  phone?: string | null;
  organisation?: string | null;
  ansprechpartner?: string | null;
  weitere_ansprechpartner?: string[];
  co_traveller?: string | null;
  kategorie?: string | null;
  unterkategorie?: string | null;
  status_crm?: string | null;
  beschreibung?: string | null;
  notizen?: string | null;
  wettbewerber?: string | null;
  verkaufsprozess?: Verkaufsprozess[];
  beginndatum?: string | null;
  enddatum?: string | null;
  pruefen_felder?: string[];
};

const inter = Inter({ subsets: ["latin"], variable: "--font-straumann-body" });
const condensed = Roboto_Condensed({
  subsets: ["latin"],
  variable: "--font-straumann-display",
  weight: ["600", "700"],
});

const STRAUMANN_BLUE = "#4d63b8";
const STRAUMANN_VIOLET = "#5928ff";

const STORAGE_KEY = "crm-voice-bot-demo-visits";
const VISIT_ID_PREFIX = "DEMO";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const KATEGORIEN = ["Kundenkontakt", "Planung/Admin./Pers.", "Int.Meeting/Training", "Coaching", "Events/Kongr./Kurse"];
const UNTERKATEGORIEN = ["Kundenbesuch", "virtueller Kontakt"];
const STATUS_OPTIONEN = ["offen", "erledigt"];
const ZIEL_OPTIONEN = ["Bedürfnisse identifizieren (I)", "Presentation/Demo (A)", "Angebot (N)", "Bestellung (O)", "Installation mit Training", "Beschwerden", "Support / Beratung", "Marketing/Events"];
const LOESUNG_OPTIONEN = ["Implantologie", "Digitale Lösungen", "Biomaterialien", "Prothetik", "Ortho", "Andere", "Alle Lösungen"];
const BRAND_OPTIONEN = ["Straumann", "Neodent", "Medentika", "Createch", "Botiss", "Anthogyr", "ClearCorrect", "3Shape", "Andere", "Alle Marken"];
const features = ["Sprachgesteuerte Besuchsdokumentation", "Gezielte Rückfragen bei fehlenden Angaben", "Strukturierte Verkaufsprozess-Erfassung", "Besuchsübersicht und Nachbearbeitung", "Alternative Dokumentation per Sprachmemo"];
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function newDemoVisitId(): string {
  let rest = Date.now();
  let zeitTeil = "";
  for (let i = 0; i < 10; i += 1) {
    zeitTeil = CROCKFORD[rest % 32] + zeitTeil;
    rest = Math.floor(rest / 32);
  }
  const zufall = new Uint8Array(16);
  crypto.getRandomValues(zufall);
  return `${VISIT_ID_PREFIX}-${zeitTeil}${Array.from(zufall, (wert) => CROCKFORD[wert % 32]).join("")}`;
}

function loadVisits(): DemoVisit[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function persistVisits(visits: DemoVisit[]) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visits)); }
function formatDatumZeit(iso?: string | null): string {
  if (!iso) return "–";
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return iso;
  return datum.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function istUnvollstaendig(visit: DemoVisit) { return !visit.beschreibung; }
function alsDemoVisit(visitId: string, phone: string | null | undefined, erstelltAmFallback: string, result: any): DemoVisit {
  return {
    visit_id: visitId,
    erstellt_am: result.erstellt_am ?? erstelltAmFallback,
    phone: phone ?? null,
    organisation: result.organisation ?? null,
    ansprechpartner: result.ansprechpartner ?? null,
    weitere_ansprechpartner: Array.isArray(result.weitere_ansprechpartner) ? result.weitere_ansprechpartner : [],
    co_traveller: result.co_traveller ?? null,
    kategorie: result.kategorie ?? null,
    unterkategorie: result.unterkategorie ?? null,
    status_crm: result.status_crm ?? null,
    beschreibung: result.beschreibung ?? null,
    notizen: result.notizen ?? null,
    wettbewerber: result.wettbewerber ?? null,
    verkaufsprozess: Array.isArray(result.verkaufsprozess) ? result.verkaufsprozess : [],
    beginndatum: result.beginndatum ?? null,
    enddatum: result.enddatum ?? null,
    pruefen_felder: Array.isArray(result.pruefen_felder) ? result.pruefen_felder : [],
  };
}

export default function Home() {
  const [phone, setPhone] = useState("");
  const [callState, setCallState] = useState<CallState>("ready");
  const [statusText, setStatusText] = useState("Aktuell bereit für einen Besuch");
  const [feedback, setFeedback] = useState("");
  const [feedbackState, setFeedbackState] = useState<FeedbackState>("idle");
  const [visits, setVisits] = useState<DemoVisit[]>([]);
  const [selected, setSelected] = useState<DemoVisit | null>(null);
  const [editVisit, setEditVisit] = useState<DemoVisit | null>(null);
  const [editing, setEditing] = useState(false);
  const [listInfo, setListInfo] = useState("");
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const visitsSectionRef = useRef<HTMLElement | null>(null);
  const busy = callState === "starting" || callState === "polling";

  useEffect(() => setVisits(loadVisits()), []);
  const zuBesuchenScrollen = useCallback(() => visitsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), []);
  const saveVisit = useCallback((visit: DemoVisit) => {
    setVisits((aktuelle) => {
      const neu = [visit, ...aktuelle.filter((v) => v.visit_id !== visit.visit_id)];
      persistVisits(neu);
      return neu;
    });
  }, []);
  const deleteVisit = useCallback((visitId: string) => {
    setVisits((aktuelle) => {
      const neu = aktuelle.filter((v) => v.visit_id !== visitId);
      persistVisits(neu);
      return neu;
    });
    setSelected(null); setEditVisit(null); setEditing(false);
  }, []);

  async function checkVisitStatusOnce(visitId: string) {
    const response = await fetch("/api/visit-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visit_id: visitId }) });
    if (!response.ok) throw new Error("Status konnte nicht geladen werden.");
    const result = await response.json();
    const status = String(result.status ?? "").toLowerCase();
    return { completed: result.completed === true || result.abgeholt === true || ["completed", "done", "erledigt"].includes(status), result };
  }
  async function pollVisitStatus(visitId: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const { completed, result } = await checkVisitStatusOnce(visitId);
      if (completed) return result;
      await wait(3000);
    }
    throw new Error("Noch keine Auswertung verfügbar.");
  }
  async function aktualisierenVisit(visit: DemoVisit) {
    if (refreshingId) return;
    setRefreshingId(visit.visit_id); setListInfo("");
    try {
      const { completed, result } = await checkVisitStatusOnce(visit.visit_id);
      if (!completed) { setListInfo("Noch keine Auswertung verfügbar. Später erneut versuchen."); return; }
      const aktualisiert = alsDemoVisit(visit.visit_id, visit.phone, visit.erstellt_am, result);
      saveVisit(aktualisiert);
      setListInfo(`„${aktualisiert.organisation ?? visit.visit_id}“ aktualisiert.`);
      if (selected?.visit_id === visit.visit_id) setSelected(aktualisiert);
    } catch (error) {
      setListInfo(`Aktualisierung fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`);
    } finally { setRefreshingId(null); }
  }
  async function startVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!phone.trim()) { setCallState("error"); setStatusText("Bitte Telefonnummer eingeben."); return; }
    const visitId = newDemoVisitId();
    setCallState("starting"); setStatusText("Anruf wird gestartet …");
    try {
      const response = await fetch("/api/call-start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), visit_id: visitId, assistant_mode: "demo", ad_name: "Sommertagung Demo", ad_email: "demo@straumann.com", device_id: "web-sommertagung-2026" }),
      });
      if (!response.ok) throw new Error("Anruf konnte nicht gestartet werden.");
      let startResult: any = {};
      try { startResult = await response.json(); } catch { startResult = {}; }
      const aktiveVisitId = startResult.visit_id ?? visitId;
      const erstelltAm = new Date().toISOString();
      saveVisit({ visit_id: aktiveVisitId, erstellt_am: erstelltAm, phone: phone.trim() });
      setCallState("polling"); setStatusText("Gespräch läuft – warte auf Auswertung …");
      try {
        const result = await pollVisitStatus(aktiveVisitId);
        const fertigerBesuch = alsDemoVisit(aktiveVisitId, phone.trim(), erstelltAm, result);
        saveVisit(fertigerBesuch);
        setCallState("success");
        setStatusText(`Besuch erfasst: ${result.organisation ?? aktiveVisitId}`);
        setListInfo("Der neue Besuch wurde erfasst und steht zur Prüfung bereit.");
        window.setTimeout(zuBesuchenScrollen, 250);
      } catch {
        setCallState("success");
        setStatusText("Anruf gestartet. Auswertung später über „Meine Anrufe“ aktualisieren.");
      }
    } catch (error) {
      setCallState("error");
      setStatusText(`Fehler: ${error instanceof Error ? error.message : "Unbekannter Fehler"}. Der Besuch kann später über „Meine Anrufe“ nachgeladen werden.`);
    }
  }
  function bearbeitenStarten() {
    if (!selected) return;
    setEditVisit({ ...selected, weitere_ansprechpartner: [...(selected.weitere_ansprechpartner ?? [])], verkaufsprozess: (selected.verkaufsprozess ?? []).map((vp) => ({ ...vp })) });
    setEditing(true);
  }
  function feldAendern<K extends keyof DemoVisit>(feld: K, wert: DemoVisit[K]) { setEditVisit((aktuell) => aktuell ? { ...aktuell, [feld]: wert } : aktuell); }
  function vpAendern(index: number, feld: keyof Verkaufsprozess, wert: string) {
    setEditVisit((aktuell) => {
      if (!aktuell) return aktuell;
      const liste = [...(aktuell.verkaufsprozess ?? [])];
      liste[index] = { ...liste[index], [feld]: wert };
      return { ...aktuell, verkaufsprozess: liste };
    });
  }
  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const feedbackUrl = process.env.NEXT_PUBLIC_FEEDBACK_WEBHOOK_URL;
    if (!feedback.trim()) return;
    if (!feedbackUrl) { setFeedbackState("error"); return; }
    setFeedbackState("sending");
    try {
      const response = await fetch(feedbackUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback: feedback.trim(), source: "Sommertagung 2026", created_at: new Date().toISOString() }) });
      if (!response.ok) throw new Error();
      setFeedback(""); setFeedbackState("success");
    } catch { setFeedbackState("error"); }
  }

  const modalVisit = editing ? editVisit : selected;
  return (
    <main className={`${inter.variable} ${condensed.variable} min-h-screen bg-[#0b0d12] font-[family-name:var(--font-straumann-body)] text-white`}>
      <header className="border-b border-white/10 bg-[#0b0d12]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
  /straumann-group-logo.png

  <div className="hidden h-8 w-px shrink-0 bg-white/15 sm:block" />

  <div className="hidden min-w-0 sm:block">
    <p className="truncate font-[family-name:var(--font-straumann-display)] text-lg font-bold tracking-tight">
      CRM Voice Bot
    </p>
    <p className="mt-0.5 text-xs text-[#8e8e93]">
      Interaktive Projektdemo
    </p>
  </div>
</div>
          <nav className="flex gap-2">
            <a href="#besuche" className="rounded-full border border-white/15 bg-[#171a22] px-3 py-2 text-xs font-semibold hover:border-[#5928ff]/70 hover:bg-[#202532] sm:px-4 sm:text-sm">Meine Anrufe</a>
            <a href="#feedback" className="hidden rounded-full border border-white/15 bg-[#171a22] px-4 py-2 text-sm font-medium hover:border-[#5928ff]/70 hover:bg-[#202532] sm:inline-flex">Feedback</a>
          </nav>
        </div>
      </header>
      <div className="h-1 w-full bg-gradient-to-r from-[#4d63b8] via-[#5928ff] to-[#4d63b8]" />

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1fr_440px] lg:items-center">
        <div>
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-[#5928ff]">Prototyp für den Außendienst</p>
          <h1 className="max-w-3xl font-[family-name:var(--font-straumann-display)] text-4xl font-bold uppercase leading-[0.98] tracking-[-0.02em] sm:text-6xl">Besuchsdokumentation einfach per Sprache.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#9b9b9b]">Besuch beschreiben, gezielte Rückfragen beantworten und automatisch einen strukturierten CRM-Entwurf erhalten.</p>
          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            {[
              ["01", "Anruf annehmen", "Der Voice Bot ruft die eingegebene Nummer an."],
              ["02", "Besuch beschreiben", "Die Fragen direkt im Telefongespräch beantworten."],
              ["03", "Ergebnis ansehen", "Der dokumentierte Besuch erscheint unter „Meine Anrufe“."],
            ].map(([nr, titel, text]) => (
              <div key={nr} className="rounded-2xl border border-white/10 bg-[#141720] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5928ff]">{nr}</p><p className="mt-2 text-sm font-semibold">{titel}</p><p className="mt-1 text-xs leading-5 text-[#8e8e93]">{text}</p>
              </div>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#demo" className="rounded-2xl bg-[#4d63b8] px-6 py-4 font-bold shadow-[0_12px_36px_rgba(77,99,184,0.28)] hover:bg-[#4055a5]">Voice Bot testen</a>
            <a href="#feedback" className="rounded-2xl border border-white/15 px-5 py-4 text-sm font-semibold text-[#c7c7cc] hover:border-[#5928ff]/70 hover:text-white">Danach Feedback geben</a>
          </div>
          <p className="mt-4 text-sm text-[#666]">Demo ausschließlich mit Testdaten</p>
        </div>

        <form id="demo" onSubmit={startVisit} className="rounded-[28px] border border-white/10 bg-[#171a22] p-5 shadow-2xl sm:p-6">
          <div className="rounded-3xl bg-white p-6 text-[#111] sm:p-8">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#f4f4f4]">{busy ? <span className="h-7 w-7 animate-spin rounded-full border-4 border-[#ddd] border-t-[#5928ff]" /> : <span className="h-5 w-5 rounded-full bg-[#4d63b8]" />}</div>
            <h2 className="text-center font-[family-name:var(--font-straumann-display)] text-2xl font-bold">{busy ? "Läuft …" : "Besuch starten"}</h2>
            <p className="mt-2 text-center text-sm text-[#666]">{busy ? "Bitte Anruf annehmen" : "Telefonnummer eingeben und Sprachassistent öffnen"}</p>
            <div className="mt-4 rounded-xl border border-[#4d63b8]/25 bg-[#f0f2ff] px-4 py-3 text-center text-xs font-medium leading-5 text-[#344276]">
              Nach dem Gespräch erscheint der dokumentierte Besuch weiter unten unter{" "}
              <button type="button" onClick={zuBesuchenScrollen} className="font-bold text-[#5928ff] underline decoration-[#5928ff]/30 underline-offset-2">Meine Anrufe</button>.
            </div>
            <label htmlFor="phone" className="mt-6 block text-sm font-semibold">Telefonnummer</label>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+49 …" disabled={busy} className="mt-2 w-full rounded-2xl border border-[#d7d7d7] bg-white px-4 py-4 text-base outline-none focus:border-[#5928ff] disabled:bg-[#eee]" />
            <p className="mt-3 rounded-xl bg-[#f4f4f4] p-3 text-xs leading-5 text-[#555]">Die Nummer wird ausschließlich für diesen einen Anruf verwendet und bleibt intern. Sie wird nicht weitergegeben, nicht für Werbung genutzt und nach der Tagung gelöscht.</p>
            <button type="submit" disabled={busy || !phone.trim()} className="mt-4 w-full rounded-2xl bg-[#4d63b8] px-5 py-4 font-bold text-white hover:bg-[#4055a5] disabled:cursor-not-allowed disabled:opacity-45">{busy ? "Gespräch läuft" : "Anruf starten"}</button>
          </div>
          <div className="mt-4 flex items-start gap-4 rounded-2xl bg-[#10131a] p-4">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${busy ? "bg-[#ff9f0a]" : callState === "error" ? "bg-[#4d63b8]" : "bg-[#35c759]"}`} />
            <div><p className="text-sm font-semibold">{busy ? "Aktiv" : callState === "error" ? "Hinweis" : "System bereit"}</p><p className="mt-1 text-sm leading-5 text-[#8e8e93]">{statusText}</p></div>
          </div>
        </form>
      </section>

      {visits.length > 0 && (
        <button type="button" onClick={zuBesuchenScrollen} className="fixed bottom-4 left-4 right-4 z-40 flex items-center justify-between gap-3 rounded-2xl border border-[#4d63b8]/40 bg-[#151827]/95 px-4 py-3 text-left shadow-2xl backdrop-blur sm:hidden">
          <span><span className="block text-sm font-bold">{visits.some(istUnvollstaendig) ? "Auswertung wird vorbereitet" : "Dokumentierter Besuch verfügbar"}</span><span className="mt-0.5 block text-xs text-[#b8b8bd]">Unter „Meine Anrufe“ ansehen und bearbeiten</span></span>
          <span className="shrink-0 rounded-full bg-[#4d63b8] px-3 py-2 text-xs font-bold">Ansehen</span>
        </button>
      )}

      <section id="besuche" ref={visitsSectionRef} className="scroll-mt-4 border-y border-white/10 bg-[#10131a]">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#5928ff]">Meine Anrufe</p><h2 className="mt-3 font-[family-name:var(--font-straumann-display)] text-3xl font-bold uppercase leading-tight sm:text-4xl">Erfasste Besuche prüfen und bearbeiten.</h2></div>
            {visits.some(istUnvollstaendig) && <button type="button" onClick={() => visits.filter(istUnvollstaendig).forEach(aktualisierenVisit)} disabled={refreshingId !== null} className="rounded-full border border-white/15 bg-[#171a22] px-4 py-2 text-sm font-medium disabled:opacity-45">Alle wartenden aktualisieren</button>}
          </div>
          <p className="mt-3 max-w-2xl leading-7 text-[#8e8e93]">{listInfo || "Die Besuche liegen ausschließlich in diesem Browser und sind für niemanden sonst sichtbar."}</p>
          {visits.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-white/10 bg-[#171a22] p-8 text-center"><p className="font-semibold">Noch keine Anrufe</p><p className="mt-2 text-sm text-[#8e8e93]">Starte oben einen Anruf und nimm ihn auf dem Telefon an. Nach dem Gespräch erscheint der strukturierte Besuch automatisch an dieser Stelle.</p></div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visits.map((visit) => {
                const offen = istUnvollstaendig(visit); const zuPruefen = (visit.pruefen_felder?.length ?? 0) > 0;
                return <div key={visit.visit_id} className="rounded-3xl border border-white/10 bg-[#171a22] p-5 hover:bg-[#202532]">
                  <button type="button" onClick={() => { setSelected(visit); setEditVisit(visit); setEditing(false); }} className="w-full text-left">
                    <div className="flex items-start justify-between gap-3"><p className="font-semibold">{visit.organisation || "Auswertung ausstehend"}</p><span className={`rounded-full px-3 py-1 text-xs font-semibold ${offen ? "bg-[#2c2c2e] text-[#c7c7cc]" : zuPruefen ? "bg-[#5c4513] text-[#ffd60a]" : "bg-[#174a2b] text-[#35c759]"}`}>{offen ? "Wartet" : zuPruefen ? "Prüfen" : "Erfasst"}</span></div>
                    {visit.ansprechpartner && <p className="mt-2 text-sm text-[#c7c7cc]">{visit.ansprechpartner}</p>}
                    <p className="mt-3 text-sm text-[#8e8e93]">{formatDatumZeit(visit.beginndatum ?? visit.erstellt_am)}</p><p className="mt-1 text-xs text-[#5e5e63]">{visit.visit_id}</p>
                  </button>
                  {offen && <button type="button" onClick={() => aktualisierenVisit(visit)} disabled={refreshingId === visit.visit_id} className="mt-4 w-full rounded-xl border border-white/15 bg-[#10131a] px-4 py-2 text-xs font-semibold disabled:opacity-45">{refreshingId === visit.visit_id ? "Wird aktualisiert …" : "Aktualisieren"}</button>}
                </div>;
              })}
            </div>
          )}
        </div>
      </section>

      {modalVisit && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 sm:p-8">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-[#0b0d12]">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5"><p className="truncate text-lg font-bold">{modalVisit.organisation || "Besuch"}</p><button type="button" onClick={() => editing ? setEditing(false) : (setSelected(null), setEditVisit(null))} className="text-sm font-semibold text-[#5928ff]">{editing ? "Abbrechen" : "Schließen"}</button></div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
              {editing && editVisit ? (
                <div className="space-y-5">
                  <Feld label="Notizen" value={editVisit.notizen ?? ""} onChange={(v) => feldAendern("notizen", v)} multiline />
                  <Feld label="Beschreibung" value={editVisit.beschreibung ?? ""} onChange={(v) => feldAendern("beschreibung", v)} multiline />
                  <Auswahl label="Kategorie" value={editVisit.kategorie ?? ""} options={KATEGORIEN} onChange={(v) => feldAendern("kategorie", v)} />
                  <Auswahl label="Unterkategorie" value={editVisit.unterkategorie ?? ""} options={UNTERKATEGORIEN} onChange={(v) => feldAendern("unterkategorie", v)} />
                  <Auswahl label="Status" value={editVisit.status_crm ?? ""} options={STATUS_OPTIONEN} onChange={(v) => feldAendern("status_crm", v)} />
                  <Feld label="Organisation" value={editVisit.organisation ?? ""} onChange={(v) => feldAendern("organisation", v)} />
                  <Feld label="Ansprechpartner" value={editVisit.ansprechpartner ?? ""} onChange={(v) => feldAendern("ansprechpartner", v)} />
                  <Feld label="Weitere Ansprechpartner, mit Komma trennen" value={(editVisit.weitere_ansprechpartner ?? []).join(", ")} onChange={(v) => feldAendern("weitere_ansprechpartner", v.split(",").map((x) => x.trim()).filter(Boolean))} />
                  <Feld label="Mitfahrer" value={editVisit.co_traveller ?? ""} onChange={(v) => feldAendern("co_traveller", v)} />
                  <Feld label="Wettbewerber" value={editVisit.wettbewerber ?? ""} onChange={(v) => feldAendern("wettbewerber", v)} />
                  <div><p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#8e8e93]">Verkaufsprozess</p>
                    {(editVisit.verkaufsprozess ?? []).map((vp, index) => <div key={index} className="mb-4 space-y-4 rounded-2xl border border-white/10 bg-[#141720] p-4"><p className="font-semibold">Verkaufsprozess {index + 1}</p><Auswahl label="Ziel" value={vp.ziel ?? ""} options={ZIEL_OPTIONEN} onChange={(v) => vpAendern(index, "ziel", v)} /><Auswahl label="Lösung" value={vp.loesung ?? ""} options={LOESUNG_OPTIONEN} onChange={(v) => vpAendern(index, "loesung", v)} /><Auswahl label="Brand" value={vp.brand ?? ""} options={BRAND_OPTIONEN} onChange={(v) => vpAendern(index, "brand", v)} /><Feld label="Fokus" value={vp.fokus ?? ""} onChange={(v) => vpAendern(index, "fokus", v)} /><button type="button" onClick={() => setEditVisit((a) => a ? { ...a, verkaufsprozess: (a.verkaufsprozess ?? []).filter((_, i) => i !== index) } : a)} className="text-sm font-semibold text-[#ff453a]">Verkaufsprozess entfernen</button></div>)}
                    <button type="button" onClick={() => setEditVisit((a) => a ? { ...a, verkaufsprozess: [...(a.verkaufsprozess ?? []), { ziel: "", loesung: "", brand: "", fokus: "" }] } : a)} className="w-full rounded-2xl bg-[#142a1c] px-5 py-3 text-sm font-semibold text-[#30d158]">Verkaufsprozess hinzufügen</button>
                  </div>
                  <button type="button" onClick={() => { if (editVisit) { saveVisit(editVisit); setSelected(editVisit); setEditing(false); setListInfo("Änderungen gespeichert"); } }} className="w-full rounded-2xl bg-white px-6 py-4 font-bold text-[#111]">Änderungen speichern</button>
                </div>
              ) : selected && (
                <div>
                  {istUnvollstaendig(selected) && <button type="button" onClick={() => aktualisierenVisit(selected)} className="mb-5 w-full rounded-2xl border border-white/15 bg-[#171a22] px-5 py-3 font-semibold">Auswertung aktualisieren</button>}
                  <button type="button" onClick={bearbeitenStarten} className="w-full rounded-2xl border border-white/15 bg-[#171a22] px-5 py-3 font-semibold">Bearbeiten</button>
                  {(selected.pruefen_felder?.length ?? 0) > 0 && <div className="mt-5 rounded-2xl bg-[#3a2a0a] p-4"><p className="text-sm font-bold text-[#ffd60a]">Zu prüfen</p><p className="mt-2 text-sm text-[#e5c87a]">{selected.pruefen_felder?.join(", ")}</p></div>}
                  <div className="mt-6 space-y-1"><Anzeige label="Beschreibung" wert={selected.beschreibung} /><Anzeige label="Notizen" wert={selected.notizen} /><Anzeige label="Kategorie" wert={selected.kategorie} /><Anzeige label="Unterkategorie" wert={selected.unterkategorie} /><Anzeige label="Status" wert={selected.status_crm} /><Anzeige label="Organisation" wert={selected.organisation} /><Anzeige label="Ansprechpartner" wert={selected.ansprechpartner} /><Anzeige label="Weitere Ansprechpartner" wert={selected.weitere_ansprechpartner?.join(", ")} /><Anzeige label="Mitfahrer" wert={selected.co_traveller} /><Anzeige label="Wettbewerber" wert={selected.wettbewerber} /><Anzeige label="Beginn" wert={formatDatumZeit(selected.beginndatum)} /><Anzeige label="Ende" wert={formatDatumZeit(selected.enddatum)} /></div>
                  {(selected.verkaufsprozess?.length ?? 0) > 0 && <div className="mt-6"><p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#8e8e93]">Verkaufsprozess</p>{selected.verkaufsprozess?.map((vp, i) => <div key={i} className="mb-3 rounded-2xl border border-white/10 bg-[#141720] p-4"><Anzeige label="Ziel" wert={vp.ziel} /><Anzeige label="Lösung" wert={vp.loesung} /><Anzeige label="Brand" wert={vp.brand} /><Anzeige label="Fokus" wert={vp.fokus} /></div>)}</div>}
                  <div className="mt-6"><Anzeige label="Visit-ID" wert={selected.visit_id} /><Anzeige label="Erfasst am" wert={formatDatumZeit(selected.erstellt_am)} /></div>
                  <button type="button" onClick={() => deleteVisit(selected.visit_id)} className="mt-8 w-full rounded-2xl bg-[#2c1416] px-5 py-4 font-semibold text-[#ff453a]">Besuch löschen</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:items-center">
        <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#5928ff]">Funktionsumfang</p><h2 className="mt-3 font-[family-name:var(--font-straumann-display)] text-3xl font-bold uppercase leading-tight sm:text-4xl">Ein Ablauf, verschiedene Eingabemöglichkeiten.</h2><p className="mt-5 max-w-xl leading-7 text-[#8e8e93]">Die Web-Demo zeigt den Voice Bot. Die Diktierfunktion und die vollständige Nachbearbeitung werden zusätzlich in der mobilen App demonstriert.</p></div>
        <div className="space-y-3">{features.map((feature) => <div key={feature} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#171a22] p-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4d63b8] font-bold">✓</span><span>{feature}</span></div>)}</div>
      </section>

      <section id="feedback" className="border-t border-white/10 bg-[#10131a] px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-white/10 bg-[#171a22] p-6 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#5928ff]">Feedback & Ideen</p><h2 className="mt-3 font-[family-name:var(--font-straumann-display)] text-3xl font-bold uppercase leading-tight">Was würde dir im Alltag helfen?</h2><p className="mt-3 leading-7 text-[#9b9b9b]">Teile Verbesserungsvorschläge, fehlende Funktionen oder konkrete Anwendungsfälle.</p>
          <form onSubmit={submitFeedback} className="mt-7"><label htmlFor="feedbackText" className="mb-2 block text-sm font-semibold">Dein Feedback</label><textarea id="feedbackText" value={feedback} onChange={(e) => { setFeedback(e.target.value); setFeedbackState("idle"); }} placeholder="Zum Beispiel: Der Bot sollte auch …" className="min-h-40 w-full resize-y rounded-2xl border border-white/15 bg-[#0b0d12] p-4 text-white outline-none placeholder:text-[#666] focus:border-[#5928ff]" /><button type="submit" disabled={!feedback.trim() || feedbackState === "sending"} className="mt-4 w-full rounded-2xl bg-white px-6 py-4 font-bold text-[#111] disabled:opacity-45 sm:w-auto">{feedbackState === "sending" ? "Wird gesendet …" : "Feedback senden"}</button>{feedbackState === "success" && <p className="mt-3 text-sm text-[#35c759]">Danke, dein Feedback wurde gespeichert.</p>}{feedbackState === "error" && <p className="mt-3 text-sm text-[#ff9f0a]">Der Feedback-Webhook ist noch nicht eingerichtet.</p>}</form>
        </div>
      </section>
      <footer className="border-t border-white/10 px-5 py-8 text-sm text-[#666] sm:px-8"><div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:justify-between"><p>CRM Voice Bot · Projektdemo 2026</p><p>Titus Sailer</p></div></footer>
    </main>
  );
}

function Feld({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <div><label className="mb-2 block text-sm text-[#8e8e93]">{label}</label>{multiline ? <textarea value={value} onChange={(e) => onChange(e.target.value)} className="min-h-24 w-full resize-y rounded-2xl border border-white/15 bg-[#1c1c1e] p-3 text-white outline-none focus:border-[#5928ff]" /> : <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-white/15 bg-[#1c1c1e] px-3 py-3 text-white outline-none focus:border-[#5928ff]" />}</div>;
}
function Auswahl({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <div><label className="mb-2 block text-sm text-[#8e8e93]">{label}</label><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-white/15 bg-[#1c1c1e] px-3 py-3 text-white outline-none focus:border-[#5928ff]"><option value="">Auswählen</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>;
}
function Anzeige({ label, wert }: { label: string; wert?: string | null }) {
  return <div className="flex items-start justify-between gap-6 border-b border-white/5 py-2.5"><span className="shrink-0 text-sm text-[#8e8e93]">{label}</span><span className="text-right text-sm">{wert || "–"}</span></div>;
}
