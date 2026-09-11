"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Inter, Roboto_Condensed } from "next/font/google";

type CallState = "ready" | "starting" | "polling" | "success" | "error";
type FeedbackState = "idle" | "sending" | "success" | "error";
type Verkaufsprozess = { ziel?: string | null; loesung?: string | null; brand?: string | null; fokus?: string | null };
type DemoVisit = {
  visit_id: string; erstellt_am: string; phone?: string | null; organisation?: string | null;
  ansprechpartner?: string | null; weitere_ansprechpartner?: string[]; co_traveller?: string | null;
  kategorie?: string | null; unterkategorie?: string | null; status_crm?: string | null;
  beschreibung?: string | null; notizen?: string | null; wettbewerber?: string | null;
  verkaufsprozess?: Verkaufsprozess[]; beginndatum?: string | null; enddatum?: string | null;
  pruefen_felder?: string[];
};

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const display = Roboto_Condensed({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700"] });
const STORAGE_KEY = "crm-voice-bot-demo-visits";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const KATEGORIEN = ["Kundenkontakt", "Planung/Admin./Pers.", "Int.Meeting/Training", "Coaching", "Events/Kongr./Kurse"];
const UNTERKATEGORIEN = ["Kundenbesuch", "virtueller Kontakt"];
const STATUS_OPTIONEN = ["offen", "erledigt"];
const ZIEL_OPTIONEN = ["Bedürfnisse identifizieren (I)", "Presentation/Demo (A)", "Angebot (N)", "Bestellung (O)", "Installation mit Training", "Beschwerden", "Support / Beratung", "Marketing/Events"];
const LOESUNG_OPTIONEN = ["Implantologie", "Digitale Lösungen", "Biomaterialien", "Prothetik", "Ortho", "Andere", "Alle Lösungen"];
const BRAND_OPTIONEN = ["Straumann", "Neodent", "Medentika", "Createch", "Botiss", "Anthogyr", "ClearCorrect", "3Shape", "Andere", "Alle Marken"];
const FEATURES = ["Sprachgesteuerte Besuchsdokumentation", "Gezielte Rückfragen bei fehlenden Angaben", "Strukturierte Verkaufsprozess-Erfassung", "Besuchsübersicht und Nachbearbeitung", "Alternative Dokumentation per Sprachmemo"];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function newDemoVisitId() {
  let rest = Date.now(); let time = "";
  for (let i = 0; i < 10; i += 1) { time = CROCKFORD[rest % 32] + time; rest = Math.floor(rest / 32); }
  const random = new Uint8Array(16); crypto.getRandomValues(random);
  return `DEMO-${time}${Array.from(random, (value) => CROCKFORD[value % 32]).join("")}`;
}
function loadVisits(): DemoVisit[] {
  if (typeof window === "undefined") return [];
  try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function persistVisits(visits: DemoVisit[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(visits)); }
function formatDatumZeit(value?: string | null) {
  if (!value) return "–"; const date = new Date(value); if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function istUnvollstaendig(visit: DemoVisit) { return !visit.beschreibung; }
function normalizeVisit(visitId: string, phone: string | null | undefined, fallback: string, result: any): DemoVisit {
  return {
    visit_id: visitId, erstellt_am: result.erstellt_am ?? fallback, phone: phone ?? null,
    organisation: result.organisation ?? null, ansprechpartner: result.ansprechpartner ?? null,
    weitere_ansprechpartner: Array.isArray(result.weitere_ansprechpartner) ? result.weitere_ansprechpartner : [],
    co_traveller: result.co_traveller ?? null, kategorie: result.kategorie ?? null,
    unterkategorie: result.unterkategorie ?? null, status_crm: result.status_crm ?? null,
    beschreibung: result.beschreibung ?? null, notizen: result.notizen ?? null,
    wettbewerber: result.wettbewerber ?? null,
    verkaufsprozess: Array.isArray(result.verkaufsprozess) ? result.verkaufsprozess : [],
    beginndatum: result.beginndatum ?? null, enddatum: result.enddatum ?? null,
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
  const visitsRef = useRef<HTMLElement | null>(null);
  const busy = callState === "starting" || callState === "polling";

  useEffect(() => setVisits(loadVisits()), []);
  const scrollToVisits = useCallback(() => visitsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), []);
  const saveVisit = useCallback((visit: DemoVisit) => setVisits((current) => {
    const next = [visit, ...current.filter((item) => item.visit_id !== visit.visit_id)]; persistVisits(next); return next;
  }), []);
  const deleteVisit = useCallback((id: string) => {
    setVisits((current) => { const next = current.filter((item) => item.visit_id !== id); persistVisits(next); return next; });
    setSelected(null); setEditVisit(null); setEditing(false);
  }, []);

  function resolvePruefen(visit: DemoVisit) {
    const next: DemoVisit = {
      ...visit,
      pruefen_felder: [],
      status_crm: "erledigt",
    };
    saveVisit(next);
    setSelected(next);
    setEditVisit(next);
    setListInfo(`„${next.organisation ?? next.visit_id}“ wurde geprüft und auf erledigt gesetzt.`);
  }

  async function checkStatus(id: string) {
    const response = await fetch("/api/visit-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visit_id: id }) });
    if (!response.ok) throw new Error("Status konnte nicht geladen werden.");
    const result = await response.json(); const status = String(result.status ?? "").toLowerCase();
    return { completed: result.completed === true || result.abgeholt === true || ["completed", "done", "erledigt"].includes(status), result };
  }
  async function pollStatus(id: string) {
    for (let i = 0; i < 40; i += 1) { const value = await checkStatus(id); if (value.completed) return value.result; await wait(3000); }
    throw new Error("Noch keine Auswertung verfügbar.");
  }
  async function refreshVisit(visit: DemoVisit) {
    if (refreshingId) return; setRefreshingId(visit.visit_id); setListInfo("");
    try {
      const { completed, result } = await checkStatus(visit.visit_id);
      if (!completed) { setListInfo("Noch keine Auswertung verfügbar. Später erneut versuchen."); return; }
      const next = normalizeVisit(visit.visit_id, visit.phone, visit.erstellt_am, result); saveVisit(next);
      if (selected?.visit_id === visit.visit_id) setSelected(next);
      setListInfo(`„${next.organisation ?? visit.visit_id}“ aktualisiert.`);
    } catch (error) { setListInfo(`Aktualisierung fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`); }
    finally { setRefreshingId(null); }
  }
  async function startVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (!phone.trim()) { setCallState("error"); setStatusText("Bitte Telefonnummer eingeben."); return; }
    const generatedId = newDemoVisitId(); setCallState("starting"); setStatusText("Anruf wird gestartet …");
    try {
      const response = await fetch("/api/call-start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: phone.trim(), visit_id: generatedId, assistant_mode: "demo", ad_name: "Sommertagung Demo", ad_email: "demo@straumann.com", device_id: "web-sommertagung-2026" }) });
      if (!response.ok) throw new Error("Anruf konnte nicht gestartet werden.");
      let start: any = {}; try { start = await response.json(); } catch {}
      const id = start.visit_id ?? generatedId; const created = new Date().toISOString();
      saveVisit({ visit_id: id, erstellt_am: created, phone: phone.trim() }); setCallState("polling"); setStatusText("Gespräch läuft – warte auf Auswertung …");
      try {
        const result = await pollStatus(id); saveVisit(normalizeVisit(id, phone.trim(), created, result));
        setCallState("success"); setStatusText(`Besuch erfasst: ${result.organisation ?? id}`); setListInfo("Der neue Besuch wurde erfasst und steht zur Prüfung bereit.");
        window.setTimeout(scrollToVisits, 250);
      } catch { setCallState("success"); setStatusText("Anruf gestartet. Auswertung später über „Meine Anrufe“ aktualisieren."); }
    } catch (error) { setCallState("error"); setStatusText(`Fehler: ${error instanceof Error ? error.message : "Unbekannter Fehler"}. Der Besuch kann später nachgeladen werden.`); }
  }
  function startEditing() {
    if (!selected) return; setEditVisit({ ...selected, weitere_ansprechpartner: [...(selected.weitere_ansprechpartner ?? [])], verkaufsprozess: (selected.verkaufsprozess ?? []).map((item) => ({ ...item })) }); setEditing(true);
  }
  function setField<K extends keyof DemoVisit>(field: K, value: DemoVisit[K]) { setEditVisit((current) => current ? { ...current, [field]: value } : current); }
  function setProcess(index: number, field: keyof Verkaufsprozess, value: string) {
    setEditVisit((current) => { if (!current) return current; const list = [...(current.verkaufsprozess ?? [])]; list[index] = { ...list[index], [field]: value }; return { ...current, verkaufsprozess: list }; });
  }
  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const url = process.env.NEXT_PUBLIC_FEEDBACK_WEBHOOK_URL; if (!feedback.trim()) return;
    if (!url) { setFeedbackState("error"); return; } setFeedbackState("sending");
    try { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback: feedback.trim(), source: "Sommertagung 2026", created_at: new Date().toISOString() }) }); if (!response.ok) throw new Error(); setFeedback(""); setFeedbackState("success"); }
    catch { setFeedbackState("error"); }
  }

  const modalVisit = editing ? editVisit : selected;
  return (
    <main className={`${inter.variable} ${display.variable} min-h-screen bg-[#0b0b0b] font-[family-name:var(--font-body)] text-white`}>
      <header className="border-b border-white/10 bg-[#0b0b0b]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <img src="/straumann-group-logo.png" alt="Straumann Group" className="h-20 w-auto max-w-none shrink-0 object-contain sm:h-24 sm:max-w-[180px]" />
            <div className="hidden h-8 w-px shrink-0 bg-white/15 sm:block" />
            <div className="hidden min-w-0 sm:block"><p className="truncate font-[family-name:var(--font-display)] text-lg font-bold">CRM Voice Bot</p><p className="mt-0.5 text-xs text-[#8e8e93]">Interaktive Projektdemo</p></div>
          </div>
          <nav className="flex gap-2"><a href="#besuche" className="rounded-full border border-white/15 bg-[#181818] px-3 py-2 text-xs font-semibold hover:border-[#e30613]/60 hover:bg-[#222] sm:px-4 sm:text-sm">Meine Anrufe</a><a href="#feedback" className="hidden rounded-full border border-white/15 bg-[#181818] px-4 py-2 text-sm font-medium hover:border-[#e30613]/60 hover:bg-[#222] sm:inline-flex">Feedback</a></nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1fr_440px] lg:items-center">
        <div>
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-[#e30613]">Prototyp für den Außendienst</p>
          <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-4xl font-bold uppercase leading-[0.98] tracking-[-0.02em] sm:text-6xl">Besuchsdokumentation einfach per Sprache.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#9b9b9b]">Besuch beschreiben, gezielte Rückfragen beantworten und automatisch einen strukturierten CRM-Entwurf erhalten.</p>
          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">{[["01", "Anruf annehmen", "Der Voice Bot ruft die eingegebene Nummer an."], ["02", "Besuch beschreiben", "Die Fragen direkt im Telefongespräch beantworten."], ["03", "Ergebnis ansehen", "Der dokumentierte Besuch erscheint unter „Meine Anrufe“."]].map(([number, title, text]) => <div key={number} className="rounded-2xl border border-white/10 bg-[#151515] p-4"><p className="text-xs font-bold text-[#e30613]">{number}</p><p className="mt-2 text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-[#8e8e93]">{text}</p></div>)}</div>
          <div className="mt-7 flex flex-wrap gap-3"><a href="#demo" className="rounded-2xl bg-[#e30613] px-6 py-4 font-bold hover:bg-[#c9000b]">Voice Bot testen</a><a href="#feedback" className="rounded-2xl border border-white/15 px-5 py-4 text-sm font-semibold text-[#c7c7cc] hover:border-[#e30613]/60 hover:text-white">Danach Feedback geben</a></div>
          <p className="mt-4 text-sm text-[#666]">Demo ausschließlich mit Testdaten</p>
        </div>
        <form id="demo" onSubmit={startVisit} className="rounded-[28px] border border-white/10 bg-[#181818] p-5 sm:p-6">
          <div className="rounded-3xl bg-white p-6 text-[#111] sm:p-8">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#f4f4f4]">{busy ? <span className="h-7 w-7 animate-spin rounded-full border-4 border-[#ddd] border-t-[#e30613]" /> : <span className="h-5 w-5 rounded-full bg-[#e30613]" />}</div>
            <h2 className="text-center font-[family-name:var(--font-display)] text-2xl font-bold">{busy ? "Läuft …" : "Besuch starten"}</h2>
            <p className="mt-2 text-center text-sm text-[#666]">{busy ? "Bitte Anruf annehmen" : "Telefonnummer eingeben und Sprachassistent öffnen"}</p>
            <div className="mt-4 rounded-xl border border-[#e30613]/20 bg-[#fff5f5] px-4 py-3 text-center text-xs font-medium leading-5 text-[#6f3034]">Nach dem Gespräch erscheint der dokumentierte Besuch unter <button type="button" onClick={scrollToVisits} className="font-bold text-[#e30613] underline underline-offset-2">Meine Anrufe</button>.</div>
            <label htmlFor="phone" className="mt-6 block text-sm font-semibold">Telefonnummer</label>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+49 …" disabled={busy} className="mt-2 w-full rounded-2xl border border-[#d7d7d7] bg-white px-4 py-4 text-base outline-none focus:border-[#e30613] disabled:bg-[#eee]" />
            <p className="mt-3 rounded-xl bg-[#f4f4f4] p-3 text-xs leading-5 text-[#555]">Die Nummer wird ausschließlich für diesen einen Anruf verwendet und bleibt intern. Sie wird nicht weitergegeben, nicht für Werbung genutzt und nach der Tagung gelöscht.</p>
            <button type="submit" disabled={busy || !phone.trim()} className="mt-4 w-full rounded-2xl bg-[#e30613] px-5 py-4 font-bold text-white hover:bg-[#c9000b] disabled:cursor-not-allowed disabled:opacity-45">{busy ? "Gespräch läuft" : "Anruf starten"}</button>
          </div>
          <div className="mt-4 flex items-start gap-4 rounded-2xl bg-[#101010] p-4"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${busy ? "bg-[#ff9f0a]" : callState === "error" ? "bg-[#e30613]" : "bg-[#35c759]"}`} /><div><p className="text-sm font-semibold">{busy ? "Aktiv" : callState === "error" ? "Hinweis" : "System bereit"}</p><p className="mt-1 text-sm leading-5 text-[#8e8e93]">{statusText}</p></div></div>
        </form>
      </section>

      {visits.length > 0 && <button type="button" onClick={scrollToVisits} className="fixed bottom-4 left-4 right-4 z-40 flex items-center justify-between gap-3 rounded-2xl border border-[#e30613]/30 bg-[#171313]/95 px-4 py-3 text-left backdrop-blur sm:hidden"><span><span className="block text-sm font-bold">{visits.some(istUnvollstaendig) ? "Auswertung wird vorbereitet" : "Dokumentierter Besuch verfügbar"}</span><span className="mt-0.5 block text-xs text-[#b8b8bd]">Unter „Meine Anrufe“ ansehen und bearbeiten</span></span><span className="shrink-0 rounded-full bg-[#e30613] px-3 py-2 text-xs font-bold">Ansehen</span></button>}

      <section id="besuche" ref={visitsRef} className="scroll-mt-4 border-y border-white/10 bg-[#101010]">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e30613]">Meine Anrufe</p><h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold uppercase sm:text-4xl">Erfasste Besuche prüfen und bearbeiten.</h2></div>{visits.some(istUnvollstaendig) && <button type="button" onClick={() => visits.filter(istUnvollstaendig).forEach(refreshVisit)} disabled={refreshingId !== null} className="rounded-full border border-white/15 bg-[#181818] px-4 py-2 text-sm font-medium disabled:opacity-45">Alle wartenden aktualisieren</button>}</div>
          <p className="mt-3 max-w-2xl leading-7 text-[#8e8e93]">{listInfo || "Die Besuche liegen ausschließlich in diesem Browser und sind für niemanden sonst sichtbar."}</p>
          {visits.length === 0 ? <div className="mt-8 rounded-3xl border border-white/10 bg-[#181818] p-8 text-center"><p className="font-semibold">Noch keine Anrufe</p><p className="mt-2 text-sm text-[#8e8e93]">Starte oben einen Anruf. Nach dem Gespräch erscheint der strukturierte Besuch automatisch hier.</p></div> : <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visits.map((visit) => { const open = istUnvollstaendig(visit); const check = (visit.pruefen_felder?.length ?? 0) > 0; return <div key={visit.visit_id} className="rounded-3xl border border-white/10 bg-[#181818] p-5 hover:bg-[#1f1f1f]"><button type="button" onClick={() => { setSelected(visit); setEditVisit(visit); setEditing(false); }} className="w-full text-left"><div className="flex items-start justify-between gap-3"><p className="font-semibold">{visit.organisation || "Auswertung ausstehend"}</p><span className={`rounded-full px-3 py-1 text-xs font-semibold ${open ? "bg-[#2c2c2e] text-[#c7c7cc]" : check ? "bg-[#5c4513] text-[#ffd60a]" : "bg-[#174a2b] text-[#35c759]"}`}>{open ? "Wartet" : check ? "Prüfen" : "Erfasst"}</span></div>{visit.ansprechpartner && <p className="mt-2 text-sm text-[#c7c7cc]">{visit.ansprechpartner}</p>}<p className="mt-3 text-sm text-[#8e8e93]">{formatDatumZeit(visit.beginndatum ?? visit.erstellt_am)}</p><p className="mt-1 text-xs text-[#5e5e63]">{visit.visit_id}</p></button>{open && <button type="button" onClick={() => refreshVisit(visit)} disabled={refreshingId === visit.visit_id} className="mt-4 w-full rounded-xl border border-white/15 bg-[#101010] px-4 py-2 text-xs font-semibold disabled:opacity-45">{refreshingId === visit.visit_id ? "Wird aktualisiert …" : "Aktualisieren"}</button>}</div>; })}</div>}
        </div>
      </section>

      {modalVisit && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 sm:p-8"><div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-[#0b0b0b]"><div className="flex items-center justify-between border-b border-white/10 px-6 py-5"><p className="truncate text-lg font-bold">{modalVisit.organisation || "Besuch"}</p><button type="button" onClick={() => editing ? setEditing(false) : (setSelected(null), setEditVisit(null))} className="text-sm font-semibold text-[#e30613]">{editing ? "Abbrechen" : "Schließen"}</button></div><div className="max-h-[70vh] overflow-y-auto px-6 py-6">{editing && editVisit ? <div className="space-y-5">
        <Feld label="Notizen" value={editVisit.notizen ?? ""} onChange={(value) => setField("notizen", value)} multiline /><Feld label="Beschreibung" value={editVisit.beschreibung ?? ""} onChange={(value) => setField("beschreibung", value)} multiline />
        <Auswahl label="Kategorie" value={editVisit.kategorie ?? ""} options={KATEGORIEN} onChange={(value) => setField("kategorie", value)} /><Auswahl label="Unterkategorie" value={editVisit.unterkategorie ?? ""} options={UNTERKATEGORIEN} onChange={(value) => setField("unterkategorie", value)} /><Auswahl label="Status" value={editVisit.status_crm ?? ""} options={STATUS_OPTIONEN} onChange={(value) => setField("status_crm", value)} />
        <Feld label="Organisation" value={editVisit.organisation ?? ""} onChange={(value) => setField("organisation", value)} /><Feld label="Ansprechpartner" value={editVisit.ansprechpartner ?? ""} onChange={(value) => setField("ansprechpartner", value)} /><Feld label="Weitere Ansprechpartner, mit Komma trennen" value={(editVisit.weitere_ansprechpartner ?? []).join(", ")} onChange={(value) => setField("weitere_ansprechpartner", value.split(",").map((item) => item.trim()).filter(Boolean))} /><Feld label="Mitfahrer" value={editVisit.co_traveller ?? ""} onChange={(value) => setField("co_traveller", value)} /><Feld label="Wettbewerber" value={editVisit.wettbewerber ?? ""} onChange={(value) => setField("wettbewerber", value)} />
        <div><p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#8e8e93]">Verkaufsprozess</p>{(editVisit.verkaufsprozess ?? []).map((process, index) => <div key={index} className="mb-4 space-y-4 rounded-2xl border border-white/10 bg-[#151515] p-4"><p className="font-semibold">Verkaufsprozess {index + 1}</p><Auswahl label="Ziel" value={process.ziel ?? ""} options={ZIEL_OPTIONEN} onChange={(value) => setProcess(index, "ziel", value)} /><Auswahl label="Lösung" value={process.loesung ?? ""} options={LOESUNG_OPTIONEN} onChange={(value) => setProcess(index, "loesung", value)} /><Auswahl label="Brand" value={process.brand ?? ""} options={BRAND_OPTIONEN} onChange={(value) => setProcess(index, "brand", value)} /><Feld label="Fokus" value={process.fokus ?? ""} onChange={(value) => setProcess(index, "fokus", value)} /><button type="button" onClick={() => setEditVisit((current) => current ? { ...current, verkaufsprozess: (current.verkaufsprozess ?? []).filter((_, itemIndex) => itemIndex !== index) } : current)} className="text-sm font-semibold text-[#ff453a]">Verkaufsprozess entfernen</button></div>)}<button type="button" onClick={() => setEditVisit((current) => current ? { ...current, verkaufsprozess: [...(current.verkaufsprozess ?? []), { ziel: "", loesung: "", brand: "", fokus: "" }] } : current)} className="w-full rounded-2xl bg-[#142a1c] px-5 py-3 text-sm font-semibold text-[#30d158]">Verkaufsprozess hinzufügen</button></div>
        <button type="button" onClick={() => { if (editVisit) { saveVisit(editVisit); setSelected(editVisit); setEditing(false); setListInfo("Änderungen gespeichert"); } }} className="w-full rounded-2xl bg-white px-6 py-4 font-bold text-[#111]">Änderungen speichern</button>
      </div> : selected && <div>{istUnvollstaendig(selected) && <button type="button" onClick={() => refreshVisit(selected)} className="mb-5 w-full rounded-2xl border border-white/15 bg-[#181818] px-5 py-3 font-semibold">Auswertung aktualisieren</button>}<button type="button" onClick={startEditing} className="w-full rounded-2xl border border-white/15 bg-[#181818] px-5 py-3 font-semibold">Bearbeiten</button>{(selected.pruefen_felder?.length ?? 0) > 0 && <div className="mt-5 rounded-2xl bg-[#3a2a0a] p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-[#ffd60a]">Zu prüfen</p><p className="mt-2 text-sm text-[#e5c87a]">{selected.pruefen_felder?.join(", ")}</p></div><button type="button" onClick={() => resolvePruefen(selected)} aria-label="Prüfung abschließen und Besuch auf erledigt setzen" title="Prüfung abschließen" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#ffd60a]/25 bg-black/15 text-lg font-bold leading-none text-[#ffd60a] hover:bg-black/30">×</button></div></div>}<div className="mt-6"><Anzeige label="Beschreibung" wert={selected.beschreibung} /><Anzeige label="Notizen" wert={selected.notizen} /><Anzeige label="Kategorie" wert={selected.kategorie} /><Anzeige label="Unterkategorie" wert={selected.unterkategorie} /><Anzeige label="Status" wert={selected.status_crm} /><Anzeige label="Organisation" wert={selected.organisation} /><Anzeige label="Ansprechpartner" wert={selected.ansprechpartner} /><Anzeige label="Weitere Ansprechpartner" wert={selected.weitere_ansprechpartner?.join(", ")} /><Anzeige label="Mitfahrer" wert={selected.co_traveller} /><Anzeige label="Wettbewerber" wert={selected.wettbewerber} /><Anzeige label="Beginn" wert={formatDatumZeit(selected.beginndatum)} /><Anzeige label="Ende" wert={formatDatumZeit(selected.enddatum)} /></div>{(selected.verkaufsprozess?.length ?? 0) > 0 && <div className="mt-6"><p className="mb-3 text-sm font-semibold uppercase text-[#8e8e93]">Verkaufsprozess</p>{selected.verkaufsprozess?.map((process, index) => <div key={index} className="mb-3 rounded-2xl border border-white/10 bg-[#151515] p-4"><Anzeige label="Ziel" wert={process.ziel} /><Anzeige label="Lösung" wert={process.loesung} /><Anzeige label="Brand" wert={process.brand} /><Anzeige label="Fokus" wert={process.fokus} /></div>)}</div>}<div className="mt-6"><Anzeige label="Visit-ID" wert={selected.visit_id} /><Anzeige label="Erfasst am" wert={formatDatumZeit(selected.erstellt_am)} /></div><button type="button" onClick={() => deleteVisit(selected.visit_id)} className="mt-8 w-full rounded-2xl bg-[#2c1416] px-5 py-4 font-semibold text-[#ff453a]">Besuch löschen</button></div>}</div></div></div>}

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:items-center"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e30613]">Funktionsumfang</p><h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold uppercase sm:text-4xl">Ein Ablauf, verschiedene Eingabemöglichkeiten.</h2><p className="mt-5 max-w-xl leading-7 text-[#8e8e93]">Die Web-Demo zeigt den Voice Bot. Die Diktierfunktion und die vollständige Nachbearbeitung werden zusätzlich in der mobilen App demonstriert.</p></div><div className="space-y-3">{FEATURES.map((feature) => <div key={feature} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#181818] p-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e30613] font-bold">✓</span><span>{feature}</span></div>)}</div></section>
      <section id="feedback" className="border-t border-white/10 bg-[#101010] px-5 py-16 sm:px-8 sm:py-20"><div className="mx-auto max-w-3xl rounded-[28px] border border-white/10 bg-[#181818] p-6 sm:p-10"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e30613]">Feedback & Ideen</p><h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold uppercase">Was würde dir im Alltag helfen?</h2><p className="mt-3 leading-7 text-[#9b9b9b]">Teile Verbesserungsvorschläge, fehlende Funktionen oder konkrete Anwendungsfälle.</p><form onSubmit={submitFeedback} className="mt-7"><label htmlFor="feedbackText" className="mb-2 block text-sm font-semibold">Dein Feedback</label><textarea id="feedbackText" value={feedback} onChange={(event) => { setFeedback(event.target.value); setFeedbackState("idle"); }} placeholder="Zum Beispiel: Der Bot sollte auch …" className="min-h-40 w-full resize-y rounded-2xl border border-white/15 bg-[#0b0b0b] p-4 text-white outline-none placeholder:text-[#666] focus:border-[#e30613]" /><button type="submit" disabled={!feedback.trim() || feedbackState === "sending"} className="mt-4 w-full rounded-2xl bg-white px-6 py-4 font-bold text-[#111] disabled:opacity-45 sm:w-auto">{feedbackState === "sending" ? "Wird gesendet …" : "Feedback senden"}</button>{feedbackState === "success" && <p className="mt-3 text-sm text-[#35c759]">Danke, dein Feedback wurde gespeichert.</p>}{feedbackState === "error" && <p className="mt-3 text-sm text-[#ff9f0a]">Der Feedback-Webhook ist noch nicht eingerichtet.</p>}</form></div></section>
      <footer className="border-t border-white/10 px-5 py-8 text-sm text-[#666] sm:px-8"><div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:justify-between"><p>CRM Voice Bot · Projektdemo 2026</p><p>Titus Sailer</p></div></footer>
    </main>
  );
}

function Feld({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <div><label className="mb-2 block text-sm text-[#8e8e93]">{label}</label>{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-24 w-full resize-y rounded-2xl border border-white/15 bg-[#1c1c1e] p-3 text-white outline-none focus:border-[#e30613]" /> : <input type="text" value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-white/15 bg-[#1c1c1e] px-3 py-3 text-white outline-none focus:border-[#e30613]" />}</div>;
}
function Auswahl({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <div><label className="mb-2 block text-sm text-[#8e8e93]">{label}</label><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-white/15 bg-[#1c1c1e] px-3 py-3 text-white outline-none focus:border-[#e30613]"><option value="">Auswählen</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>;
}
function Anzeige({ label, wert }: { label: string; wert?: string | null }) {
  return <div className="flex items-start justify-between gap-6 border-b border-white/5 py-2.5"><span className="shrink-0 text-sm text-[#8e8e93]">{label}</span><span className="text-right text-sm">{wert || "–"}</span></div>;
}
s