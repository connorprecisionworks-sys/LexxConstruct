"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface Attorney { name: string; representing: string; }
interface Admission { topic: string; admission: string; pageReference?: string; significance: "high" | "medium" | "low"; }
interface Denial { topic: string; denial: string; pageReference?: string; }
interface Exhibit { exhibitNumber: string; description: string; pageReference?: string; }
interface Inconsistency { topic: string; description: string; pages: string[]; }
interface ObjectionsSummary { total: number; sustainedCount?: number; commonGrounds: string[]; }

interface DepositionAnalysis {
  witnessName: string;
  witnessRole: string;
  depositionDate: string;
  location?: string;
  attorneysPresent: Attorney[];
  courtReporter?: string;
  duration?: string;
  topics: string[];
  keyAdmissions: Admission[];
  keyDenials: Denial[];
  exhibitsReferenced: Exhibit[];
  inconsistencies: Inconsistency[];
  objectionsSummary: ObjectionsSummary;
  summary: string;
  followUpQuestions: string[];
}

interface Doc { id: string; fileName: string; status: string; }
interface Matter { id: string; name: string; }

const SIG_BADGE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700",
  medium: "bg-[#FEF3C7] text-[#D97706]",
  low: "bg-[#F3F4F6] text-muted",
};

export default function DepositionView() {
  const params = useParams<{ id: string; docId: string }>();
  const matterId = params?.id ?? "";
  const docId = params?.docId ?? "";

  const [depo, setDepo] = useState<DepositionAnalysis | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [matter, setMatter] = useState<Matter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setError(null);
        const [mattersRes, docsRes, depoRes] = await Promise.all([
          fetch("/api/matters"),
          fetch(`/api/documents?matterId=${matterId}`),
          fetch(`/api/documents/${docId}/deposition`),
        ]);
        const matters = await mattersRes.json();
        if (Array.isArray(matters)) setMatter(matters.find((m: Matter) => m.id === matterId) || null);
        const docs = await docsRes.json();
        if (Array.isArray(docs)) setDoc(docs.find((d: Doc) => d.id === docId) || null);
        if (depoRes.ok) {
          setDepo(await depoRes.json());
        } else {
          setError("Deposition analysis not found for this document.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [matterId, docId]);

  if (loading) return (
    <div className="px-8 py-20 flex items-center justify-center">
      <Spinner /><span className="ml-3 text-sm text-muted">Loading deposition analysis...</span>
    </div>
  );

  if (error || !depo) return (
    <div className="px-8 py-20 text-center">
      <p className="text-sm text-[#DC2626]">{error || "Deposition analysis not available."}</p>
      <Link href={`/matters/${matterId}`} className="text-sm text-accent hover:underline mt-2 inline-block">Back to matter</Link>
    </div>
  );

  const sortedAdmissions = [...depo.keyAdmissions].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.significance] - order[b.significance];
  });

  return (
    <div className="px-8 py-8 max-w-[1100px]">
      {/* Breadcrumb */}
      <div className="text-xs text-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-accent transition-colors">Dashboard</Link>
        <span>/</span>
        <Link href={`/matters/${matterId}`} className="hover:text-accent transition-colors">{matter?.name || "Matter"}</Link>
        <span>/</span>
        <span className="text-primary">Deposition — {depo.witnessName || doc?.fileName || "Document"}</span>
      </div>

      {/* Header block */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold text-primary">{depo.witnessName || "Unknown Witness"}</h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Deposition</span>
          </div>
          <p className="text-sm text-muted">{depo.witnessRole || "Role not identified"}</p>
          <p className="text-xs text-muted mt-1">
            {depo.depositionDate || "Date unknown"}
            {depo.location ? ` · ${depo.location}` : ""}
          </p>
        </div>
        <Link
          href={`/matters/${matterId}/documents/${docId}/workspace`}
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-[6px] hover:bg-accent-hover transition-colors flex-shrink-0"
        >
          Open Workspace &rarr;
        </Link>
      </div>

      <div className="space-y-6">
        {/* Appearances */}
        <Card title="Appearances">
          <div className="space-y-3">
            {depo.attorneysPresent.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Attorneys Present</p>
                <div className="border border-border rounded-[6px] overflow-hidden">
                  <div className="grid grid-cols-2 gap-4 px-3 py-2 bg-row-alt text-[11px] font-medium text-muted uppercase tracking-wider border-b border-border">
                    <span>Name</span><span>Representing</span>
                  </div>
                  {depo.attorneysPresent.map((atty, i) => (
                    <div key={i} className={`grid grid-cols-2 gap-4 px-3 py-2.5 ${i % 2 === 1 ? "bg-row-alt" : ""}`}>
                      <span className="text-sm text-charcoal">{atty.name}</span>
                      <span className="text-sm text-muted">{atty.representing}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">No attorneys recorded.</p>
            )}
            <div className="flex gap-6 mt-2">
              {depo.courtReporter && (
                <div>
                  <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Court Reporter</span>
                  <p className="text-sm text-charcoal mt-0.5">{depo.courtReporter}</p>
                </div>
              )}
              {depo.duration && (
                <div>
                  <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Duration</span>
                  <p className="text-sm text-charcoal mt-0.5">{depo.duration}</p>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Summary */}
        <Card title="Executive Summary">
          <p className="text-sm text-charcoal leading-relaxed">{depo.summary}</p>
          <Disclaimer />
        </Card>

        {/* Topics */}
        {depo.topics.length > 0 && (
          <Card title="Topics Covered">
            <div className="flex flex-wrap gap-2">
              {depo.topics.map((topic, i) => (
                <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-full bg-accent-light text-accent">
                  {topic}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Key Admissions */}
        <div className="bg-surface border border-border rounded-lg border-l-4 border-l-[#059669]" style={{ boxShadow: "var(--shadow)" }}>
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <h2 className="text-sm font-semibold text-primary">Key Admissions</h2>
            <span className="text-[10px] font-medium text-muted bg-row-alt px-1.5 py-0.5 rounded">{depo.keyAdmissions.length}</span>
          </div>
          <div className="px-4 py-4">
            {sortedAdmissions.length === 0 ? (
              <p className="text-sm text-muted">No key admissions recorded.</p>
            ) : (
              <div className="space-y-3">
                {sortedAdmissions.map((adm, i) => (
                  <div
                    key={i}
                    className={`rounded-[6px] border border-border p-3 ${adm.significance === "high" ? "bg-[#D1FAE5]/40" : "bg-white"}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${SIG_BADGE[adm.significance]}`}>
                        {adm.significance.toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-primary">{adm.topic}</span>
                    </div>
                    <p className="text-[15px] text-charcoal leading-relaxed">{adm.admission}</p>
                    {adm.pageReference && (
                      <p className="text-xs text-muted mt-1.5">{adm.pageReference}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <Disclaimer />
          </div>
        </div>

        {/* Key Denials */}
        <Card title="Key Denials" count={depo.keyDenials.length}>
          {depo.keyDenials.length === 0 ? (
            <p className="text-sm text-muted">No key denials recorded.</p>
          ) : (
            <div className="space-y-3">
              {depo.keyDenials.map((denial, i) => (
                <div key={i} className="rounded-[6px] border border-border p-3 bg-white">
                  <p className="text-sm font-medium text-primary mb-1">{denial.topic}</p>
                  <p className="text-sm text-charcoal leading-relaxed">{denial.denial}</p>
                  {denial.pageReference && <p className="text-xs text-muted mt-1.5">{denial.pageReference}</p>}
                </div>
              ))}
            </div>
          )}
          <Disclaimer />
        </Card>

        {/* Exhibits Referenced */}
        <Card title="Exhibits Referenced" count={depo.exhibitsReferenced.length}>
          {depo.exhibitsReferenced.length === 0 ? (
            <p className="text-sm text-muted">No exhibits recorded.</p>
          ) : (
            <div className="border border-border rounded-[6px] overflow-hidden">
              <div className="grid grid-cols-[80px_1fr_100px] gap-3 px-3 py-2 bg-row-alt text-[11px] font-medium text-muted uppercase tracking-wider border-b border-border">
                <span>Exhibit</span><span>Description</span><span>Page Ref</span>
              </div>
              {depo.exhibitsReferenced.map((ex, i) => (
                <div key={i} className={`grid grid-cols-[80px_1fr_100px] gap-3 px-3 py-2.5 ${i % 2 === 1 ? "bg-row-alt" : ""}`}>
                  <span className="text-sm font-medium text-charcoal">{ex.exhibitNumber}</span>
                  <span className="text-sm text-charcoal">{ex.description}</span>
                  <span className="text-xs text-muted">{ex.pageReference || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Inconsistencies */}
        <Card title="Inconsistencies" count={depo.inconsistencies.length}>
          {depo.inconsistencies.length === 0 ? (
            <p className="text-sm text-muted">No internal inconsistencies detected.</p>
          ) : (
            <div className="space-y-3">
              {depo.inconsistencies.map((inc, i) => (
                <div key={i} className="border border-border rounded p-3 bg-white">
                  <p className="text-sm font-medium text-primary mb-1">{inc.topic}</p>
                  <p className="text-sm text-charcoal leading-relaxed">{inc.description}</p>
                  {inc.pages.length > 0 && (
                    <p className="text-xs text-muted mt-1.5">Pages: {inc.pages.join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Objections */}
        <Card title="Objections">
          <div className="flex items-center gap-6 mb-3">
            <div>
              <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Total</span>
              <p className="text-2xl font-bold text-primary mt-0.5">{depo.objectionsSummary.total}</p>
            </div>
            {depo.objectionsSummary.sustainedCount !== undefined && (
              <div>
                <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Sustained</span>
                <p className="text-2xl font-bold text-primary mt-0.5">{depo.objectionsSummary.sustainedCount}</p>
              </div>
            )}
          </div>
          {depo.objectionsSummary.commonGrounds.length > 0 && (
            <div>
              <p className="text-[11px] text-muted uppercase tracking-wider font-semibold mb-2">Common Grounds</p>
              <div className="flex flex-wrap gap-2">
                {depo.objectionsSummary.commonGrounds.map((g, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-[#F3F4F6] text-muted">{g}</span>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Follow-up Questions */}
        {depo.followUpQuestions.length > 0 && (
          <Card title="Follow-up Questions for Discovery">
            <ol className="list-decimal list-inside space-y-2">
              {depo.followUpQuestions.map((q, i) => (
                <li key={i} className="text-sm text-charcoal leading-relaxed">{q}</li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    </div>
  );
}

function Card({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg" style={{ boxShadow: "var(--shadow)" }}>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
        {count !== undefined && <span className="text-[10px] font-medium text-muted bg-row-alt px-1.5 py-0.5 rounded">{count}</span>}
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="mt-4 pt-3 border-t border-border">
      <p className="text-[11px] text-muted italic">This output is not legal advice and requires attorney review before any action is taken.</p>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
