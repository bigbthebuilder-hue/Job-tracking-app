import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

function getDateRange(type, month, year) {
  const today = new Date();
  const y = Number(year || today.getFullYear());
  const m = Number(month || today.getMonth() + 1);

  if (type === "mtd") {
    return {
      start: new Date(today.getFullYear(), today.getMonth(), 1),
      end: today,
      label: "Month to Date",
    };
  }

  if (type === "ytd") {
    return {
      start: new Date(today.getFullYear(), 0, 1),
      end: today,
      label: "Year to Date",
    };
  }

  if (type === "year") {
    return {
      start: new Date(y, 0, 1),
      end: new Date(y, 11, 31, 23, 59, 59, 999),
      label: String(y),
    };
  }

  return {
    start: new Date(y, m - 1, 1),
    end: new Date(y, m, 0, 23, 59, 59, 999),
    label: `${y}-${String(m).padStart(2, "0")}`,
  };
}

function cleanNumber(n) {
  const num = Number(n || 0);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString();
}

function sumJobs(jobs) {
  return {
    hours: jobs.reduce((sum, j) => sum + Number(j.hours || 0), 0),
    service: jobs.reduce((sum, j) => sum + Number(j.service_amount || 0), 0),
    supplies: jobs.reduce((sum, j) => sum + Number(j.supplies_amount || 0), 0),
    gst: jobs.reduce((sum, j) => sum + Number(j.gst_amount || 0), 0),
    total: jobs.reduce((sum, j) => sum + Number(j.total_value || 0), 0),
    mileage: jobs.reduce((sum, j) => sum + Number(j.mileage || 0), 0),
  };
}

function matchesSearch(values, search) {
  if (!search.trim()) return true;
  const hay = values.filter(Boolean).join(" ").toLowerCase();
  return hay.includes(search.trim().toLowerCase());
}

function normalizeSettings(data) {
  return {
    charge_gst: !!data?.charge_gst,
    gst_rate: Number(data?.gst_rate || 5),
    business_name: data?.business_name || "",
    business_phone: data?.business_phone || "",
    business_email: data?.business_email || "",
    default_email: data?.default_email || "",
    tax_number: data?.tax_number || "",
    business_notes: data?.business_notes || "",
  };
}

function buildBusinessSignature(settings) {
  return [
    settings.business_notes || "Thank you for your business.",
    "",
    settings.business_name || "",
    settings.business_phone || "",
    settings.business_email || "",
  ]
    .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
    .join("\n");
}

function openMailto(to, subject, body) {
  if (!to) return false;

  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  try {
    const link = document.createElement("a");
    link.href = mailto;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (error) {
    try {
      window.location.href = mailto;
      return true;
    } catch {
      return false;
    }
  }
}

function buildJobInvoiceEmail(job, settings) {
  const clientName = job.clients?.name || "Client";
  const invoiceNumber = `INV-${String(job.id).slice(0, 8).toUpperCase()}`;
  const to = job.clients?.invoice_email || settings.default_email || "";
  const subject = `${settings.business_name || "Cleaning Tracker"} invoice ${invoiceNumber} for ${clientName}`;
  const body = [
    `Hello ${clientName},`,
    "",
    `Please find your invoice details below.`,
    "",
    `Invoice Number: ${invoiceNumber}`,
    `Service Date: ${formatDate(job.job_date)}`,
    `Service: ${money(job.service_amount)}`,
    `Supplies: ${money(job.supplies_amount)}`,
    `GST: ${money(job.gst_amount)}`,
    `Total Due: ${money(job.total_value)}`,
    `Hours: ${job.hours == null ? "-" : cleanNumber(job.hours)}`,
    `Notes: ${job.notes || "-"}`,
    "",
    buildBusinessSignature(settings),
  ].join("\n");

  return { to, subject, body };
}

function buildClientStatementEmail(preview, settings) {
  const { client, jobs, range, totals } = preview;
  const to = client.invoice_email || settings.default_email || "";
  const subject = `${settings.business_name || "Cleaning Tracker"} statement for ${client.name} - ${formatDate(
    range.start
  )} to ${formatDate(range.end)}`;

  const body = [
    `Hello ${client.name},`,
    "",
    `Please find your statement summary below.`,
    "",
    `Period: ${formatDate(range.start)} to ${formatDate(range.end)}`,
    `Service: ${money(totals.service)}`,
    `Supplies: ${money(totals.supplies)}`,
    `GST: ${money(totals.gst)}`,
    `Total: ${money(totals.total)}`,
    `Hours: ${cleanNumber(totals.hours)}`,
    "",
    `Included service dates:`,
    ...(jobs.length
      ? jobs.map(
          (job) =>
            `- ${formatDate(job.job_date)} | Service ${money(
              job.service_amount
            )} | Supplies ${money(job.supplies_amount)} | GST ${money(
              job.gst_amount
            )} | Total ${money(job.total_value)}`
        )
      : ["- No jobs found for this period"]),
    "",
    buildBusinessSignature(settings),
  ].join("\n");

  return { to, subject, body };
}

function buildClientMonthlyInvoiceEmail(preview, settings) {
  const { client, jobs, range, totals } = preview;
  const to = client.invoice_email || settings.default_email || "";
  const subject = `${settings.business_name || "Cleaning Tracker"} monthly invoice for ${client.name} - ${formatDate(
    range.start
  )} to ${formatDate(range.end)}`;

  const body = [
    `Hello ${client.name},`,
    "",
    `Please find your monthly invoice summary below.`,
    "",
    `Period: ${formatDate(range.start)} to ${formatDate(range.end)}`,
    `Service: ${money(totals.service)}`,
    `Supplies: ${money(totals.supplies)}`,
    `GST: ${money(totals.gst)}`,
    `Total Due: ${money(totals.total)}`,
    "",
    `Included service dates:`,
    ...(jobs.length
      ? jobs.map(
          (job) =>
            `- ${formatDate(job.job_date)} | Service ${money(
              job.service_amount
            )} | Supplies ${money(job.supplies_amount)} | GST ${money(
              job.gst_amount
            )} | Total ${money(job.total_value)}`
        )
      : ["- No jobs found for this period"]),
    "",
    buildBusinessSignature(settings),
  ].join("\n");

  return { to, subject, body };
}

function buildReportEmail(preview, settings) {
  const to = settings.default_email || settings.business_email || "";
  const scopeLabel = preview.scopeLabel || "All Customers";
  const subject = `${settings.business_name || "Cleaning Tracker"} report for ${scopeLabel} - ${formatDate(
    preview.range.start
  )} to ${formatDate(preview.range.end)}`;

  const body = [
    `Hello,`,
    "",
    `Please find your report summary below.`,
    "",
    `Scope: ${scopeLabel}`,
    `Period: ${formatDate(preview.range.start)} to ${formatDate(preview.range.end)}`,
    `Service: ${money(preview.totals.service)}`,
    `Supplies: ${money(preview.totals.supplies)}`,
    `GST: ${money(preview.totals.gst)}`,
    `Total: ${money(preview.totals.total)}`,
    `Hours: ${cleanNumber(preview.totals.hours)}`,
    `Job mileage: ${cleanNumber(preview.totals.mileage)} km`,
    `Daily mileage: ${cleanNumber(preview.dailyMileageTotal)} km`,
    `Combined mileage: ${cleanNumber(preview.totals.mileage + preview.dailyMileageTotal)} km`,
    "",
    `Customer rankings:`,
    ...(preview.rankings.length
      ? preview.rankings.map(
          (row) =>
            `- ${row.clientName} | Service ${money(row.service)} | Hours ${cleanNumber(
              row.hours
            )} | Jobs ${row.jobs} | $/Hour ${money(row.valuePerHour)} | $/Job ${money(
              row.valuePerJob
            )}`
        )
      : ["- No jobs in this report range"]),
    "",
    buildBusinessSignature(settings),
  ].join("\n");

  return { to, subject, body };
}


const defaultClientForm = {
  name: "",
  address: "",
  phone: "",
  frequency: "",
  hourly_rate: "",
  mileage: "",
  notes: "",
  hours_mode: "manual",
  default_hours: "",
  pay_mode: "hourly",
  mileage_mode: "client_default",
  invoice_email: "",
  track_paid_status: false,
};

const defaultSettingsForm = {
  business_name: "",
  business_phone: "",
  business_email: "",
  default_email: "",
  tax_number: "",
  business_notes: "",
  charge_gst: false,
  gst_rate: "5",
};

const defaultSettings = {
  charge_gst: false,
  gst_rate: 5,
  business_name: "",
  business_phone: "",
  business_email: "",
  default_email: "",
  tax_number: "",
  business_notes: "",
};

const defaultJobForm = {
  client_id: "",
  job_date: new Date().toISOString().split("T")[0],
  notes: "",
  hours_mode: "use_client",
  pay_mode: "use_client",
  mileage_mode: "use_client",
  hours: "",
  hourly_rate: "",
  service_amount: "",
  supplies_amount: "",
  supplies_notes: "",
  mileage: "",
  is_paid: false,
};

const defaultMileageForm = {
  mileage_date: new Date().toISOString().split("T")[0],
  mileage: "",
  vehicle: "",
  notes: "",
};

function PrintPreviewOverlay({ title, onClose, children }) {
  return (
    <div className="print-preview-screen" style={printOverlayStyle}>
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print-preview-screen,
          .print-preview-screen * {
            visibility: visible !important;
          }
          .print-preview-screen {
            position: absolute !important;
            inset: 0 !important;
            background: #fff !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-preview-toolbar {
            display: none !important;
          }
          .print-preview-paper {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>

      <div className="print-preview-toolbar" style={printToolbarStyle}>
        <div style={{ fontSize: 24, fontWeight: 900 }}>{title}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={() => window.print()} style={buttonStyle}>
            Print / Save PDF
          </button>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>
            Close Preview
          </button>
        </div>
      </div>

      <div className="print-preview-paper" style={printPaperWrapStyle}>
        {children}
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, isOpen, onToggle, children, countText }) {
  return (
    <div style={sectionCardStyle}>
      <button type="button" onClick={onToggle} style={sectionHeaderButtonStyle}>
        <div style={{ textAlign: "left" }}>
          <div style={sectionTitle}>{title}</div>
          {subtitle ? <div style={mutedTextCompact}>{subtitle}</div> : null}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {countText ? <div style={pillStyle}>{countText}</div> : null}
          <div style={sectionChevronStyle}>{isOpen ? "−" : "+"}</div>
        </div>
      </button>
      {isOpen ? <div style={{ marginTop: 14 }}>{children}</div> : null}
    </div>
  );
}

function ActionMenu({ title, subtitle, isOpen, onToggle, children }) {
  return (
    <div style={menuWrapStyle}>
      <button type="button" onClick={onToggle} style={menuMainButtonStyle}>
        <div style={{ textAlign: "left" }}>
          <div style={menuTitleStyle}>{title}</div>
          {subtitle ? <div style={mutedTextCompact}>{subtitle}</div> : null}
        </div>
        <div style={menuChevronStyle}>{isOpen ? "−" : "+"}</div>
      </button>
      {isOpen ? <div style={menuBodyStyle}>{children}</div> : null}
    </div>
  );
}

function ModeTabs({ mode, onChange, createLabel, manageLabel }) {
  return (
    <div style={modeTabsWrapStyle}>
      <button
        type="button"
        onClick={() => onChange("create")}
        style={mode === "create" ? modeTabActiveStyle : modeTabStyle}
      >
        {createLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange("manage")}
        style={mode === "manage" ? modeTabActiveStyle : modeTabStyle}
      >
        {manageLabel}
      </button>
    </div>
  );
}

function SubTabs({ value, onChange, tabs }) {
  return (
    <div style={subTabsWrapStyle}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          style={value === tab.value ? subTabActiveStyle : subTabStyle}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}


function DashboardPage() {
  const [jobs, setJobs] = useState([]);
  const [dailyMileage, setDailyMileage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [homeTab, setHomeTab] = useState("overview");
  const [markingPaidId, setMarkingPaidId] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setMessage("");

    try {
      const [jobsRes, mileageRes] = await Promise.all([
        supabase
          .from("jobs")
          .select("*, clients(name, track_paid_status)")
          .order("job_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("daily_mileage")
          .select("*")
          .order("mileage_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      if (jobsRes.error) throw jobsRes.error;
      if (mileageRes.error) throw mileageRes.error;

      setJobs(jobsRes.data || []);
      setDailyMileage(mileageRes.data || []);
    } catch (error) {
      setMessage(error.message);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function markJobPaid(job) {
    setMarkingPaidId(job.id);
    setMessage("");

    const { error } = await supabase
      .from("jobs")
      .update({ is_paid: true, updated_at: new Date().toISOString() })
      .eq("id", job.id);

    if (error) {
      setMessage(error.message);
      setMarkingPaidId("");
      return;
    }

    setMessage(`Marked paid: ${job.clients?.name || "Client"} on ${job.job_date}`);
    await loadDashboard();
    setMarkingPaidId("");
  }

  const weekRange = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return { monday, sunday };
  }, []);

  const thisWeekJobs = jobs.filter((job) => {
    const d = new Date(job.job_date);
    return d >= weekRange.monday && d <= weekRange.sunday;
  });

  const thisWeekMileageEntries = dailyMileage.filter((entry) => {
    const d = new Date(entry.mileage_date);
    return d >= weekRange.monday && d <= weekRange.sunday;
  });

  const totals = sumJobs(thisWeekJobs);
  const weeklyDailyMileage = thisWeekMileageEntries.reduce(
    (sum, entry) => sum + Number(entry.mileage || 0),
    0
  );

  const weeklyClientCount = new Set(
    thisWeekJobs.map((job) => job.client_id).filter(Boolean)
  ).size;

  const recentJobs = jobs.slice(0, 8);

  const unpaidTrackedJobs = jobs.filter(
    (job) => job.clients?.track_paid_status && !job.is_paid
  );

  const unpaidTotals = sumJobs(unpaidTrackedJobs);

  const unpaidClientIds = [...new Set(unpaidTrackedJobs.map((job) => job.client_id).filter(Boolean))];

  const unpaidByClient = Object.values(
    unpaidTrackedJobs.reduce((acc, job) => {
      const key = job.client_id || "unknown";
      if (!acc[key]) {
        acc[key] = {
          client_id: job.client_id || "",
          client_name: job.clients?.name || "Unknown client",
          total: 0,
          hours: 0,
          jobs: 0,
        };
      }

      acc[key].total += Number(job.total_value || 0);
      acc[key].hours += Number(job.hours || 0);
      acc[key].jobs += 1;

      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={pageTitle}>Home</h1>

      <SubTabs
        value={homeTab}
        onChange={setHomeTab}
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "unpaid", label: "Unpaid" },
        ]}
      />

      {message ? <div style={cardStyle}>{message}</div> : null}

      {homeTab === "overview" ? (
        <>
          <div style={statsGrid}>
            <StatCard label="This Week" value={money(totals.total)} />
            <StatCard label="Week Hours" value={cleanNumber(totals.hours)} />
            <StatCard
              label="Week KM"
              value={cleanNumber(totals.mileage + weeklyDailyMileage)}
            />
            <StatCard label="Clients This Week" value={weeklyClientCount} />
          </div>

          <div style={cardStyle}>
            <div style={sectionTitle}>Week Range</div>
            <div style={mutedText}>
              {weekRange.monday.toLocaleDateString()} to{" "}
              {weekRange.sunday.toLocaleDateString()}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={betweenRow}>
              <div>
                <div style={sectionTitle}>Unpaid Snapshot</div>
                <div style={mutedTextCompact}>
                  Quick view of all tracked unpaid jobs.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHomeTab("unpaid")}
                style={secondaryButtonStyle}
              >
                Open Unpaid
              </button>
            </div>

            <div style={statsGrid}>
              <StatCard label="Unpaid Total" value={money(unpaidTotals.total)} />
              <StatCard label="Unpaid Jobs" value={String(unpaidTrackedJobs.length)} />
              <StatCard label="Clients With Unpaid" value={String(unpaidClientIds.length)} />
              <StatCard label="Unpaid Hours" value={cleanNumber(unpaidTotals.hours)} />
            </div>
          </div>

          <div style={cardStyle}>
            <div style={sectionTitle}>Recent Jobs</div>

            {loading ? <div>Loading dashboard...</div> : null}
            {!loading && recentJobs.length === 0 ? <div>No jobs yet.</div> : null}

            <div style={{ display: "grid", gap: 12 }}>
              {recentJobs.map((job) => (
                <div key={job.id} style={innerCardStyle}>
                  <div style={itemTitle}>{job.clients?.name || "Unknown client"}</div>
                  <div style={{ marginTop: 6 }}>
                    {job.job_date} | {money(job.total_value)}
                  </div>
                  <div style={mutedText}>
                    Service: {money(job.service_amount)} | Supplies:{" "}
                    {money(job.supplies_amount)} | GST: {money(job.gst_amount)}
                  </div>
                  <div style={mutedText}>{job.notes || ""}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={sectionTitle}>This Week Mileage Entries</div>

            {thisWeekMileageEntries.length === 0 ? (
              <div>No daily mileage entries this week.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {thisWeekMileageEntries.map((entry) => (
                  <div key={entry.id} style={innerCardStyle}>
                    <div style={itemTitle}>{entry.mileage_date}</div>
                    <div>{cleanNumber(entry.mileage)} km</div>
                    <div style={mutedText}>
                      {entry.vehicle || ""} {entry.notes ? `| ${entry.notes}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}

      {homeTab === "unpaid" ? (
        <>
          <div style={statsGrid}>
            <StatCard label="Unpaid Total" value={money(unpaidTotals.total)} />
            <StatCard label="Unpaid Jobs" value={String(unpaidTrackedJobs.length)} />
            <StatCard label="Clients With Unpaid" value={String(unpaidClientIds.length)} />
            <StatCard label="Unpaid Hours" value={cleanNumber(unpaidTotals.hours)} />
          </div>

          <div style={cardStyle}>
            <div style={sectionTitle}>Unpaid By Client</div>

            {loading ? <div>Loading unpaid data...</div> : null}
            {!loading && unpaidByClient.length === 0 ? (
              <div>No unpaid tracked jobs.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {unpaidByClient.map((row) => (
                  <div key={row.client_id || row.client_name} style={innerCardStyle}>
                    <div style={simpleCardMainRowStyle}>
                      <div style={simpleCardTitleStyle}>{row.client_name}</div>
                      <div style={simpleCardAmountStyle}>{money(row.total)}</div>
                    </div>
                    <div style={mutedTextCompact}>
                      Jobs: {row.jobs} | Hours: {cleanNumber(row.hours)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <div style={sectionTitle}>Unpaid Jobs List</div>

            {loading ? <div>Loading unpaid jobs...</div> : null}
            {!loading && unpaidTrackedJobs.length === 0 ? (
              <div>No unpaid tracked jobs.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {unpaidTrackedJobs.map((job) => (
                  <div key={job.id} style={innerCardStyle}>
                    <div style={simpleCardMainRowStyle}>
                      <div style={simpleCardTitleStyle}>
                        {job.clients?.name || "Unknown client"}
                      </div>
                      <div style={simpleCardAmountStyle}>{money(job.total_value)}</div>
                    </div>

                    <div style={simpleCardSubRowStyle}>
                      <span>{job.job_date}</span>
                      <span>{job.hours == null ? "-" : `${cleanNumber(job.hours)} hrs`}</span>
                    </div>

                    <div style={mutedTextCompact}>{job.notes || "No notes"}</div>

                    <div style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        onClick={() => markJobPaid(job)}
                        disabled={markingPaidId === job.id}
                        style={buttonStyle}
                      >
                        {markingPaidId === job.id ? "Marking..." : "Mark Paid"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}


function JobsPage() {
  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("week");
  const [filterClientId, setFilterClientId] = useState("");
  const [paidFilter, setPaidFilter] = useState("all");
  const [jobSearch, setJobSearch] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [editingJobId, setEditingJobId] = useState("");
  const [invoicePreviewJob, setInvoicePreviewJob] = useState(null);
  const [form, setForm] = useState(defaultJobForm);

  const [showCreateSection, setShowCreateSection] = useState(true);
  const [showActionSection, setShowActionSection] = useState(true);
  const [showListSection, setShowListSection] = useState(true);
  const [showFilterSection, setShowFilterSection] = useState(true);
  const [showInvoiceMenu, setShowInvoiceMenu] = useState(false);
  const [jobsViewMode, setJobsViewMode] = useState("create");

  const clientMap = useMemo(() => {
    const map = {};
    clients.forEach((client) => {
      map[client.id] = client;
    });
    return map;
  }, [clients]);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) || null,
    [jobs, selectedJobId]
  );

  async function loadClients() {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;
    setClients(data || []);
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from("jobs")
      .select("*, clients(name, track_paid_status, address, phone, invoice_email)")
      .order("job_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    setJobs(data || []);
  }

  async function loadSettings() {
    const { data, error } = await supabase
      .from("business_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    setSettings(data ? normalizeSettings(data) : defaultSettings);
  }

  async function loadAll() {
    setLoading(true);
    setMessage("");

    try {
      await Promise.all([loadClients(), loadJobs(), loadSettings()]);
    } catch (error) {
      setMessage(error.message);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!form.client_id && clients.length > 0 && !editingJobId) {
      setForm((prev) => ({ ...prev, client_id: clients[0].id }));
    }
  }, [clients, form.client_id, editingJobId]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function getSelectedClient() {
    return clientMap[form.client_id] || null;
  }

  function resetJobForm() {
    setEditingJobId("");
    setSelectedJobId("");
    setShowInvoiceMenu(false);
    setJobsViewMode("create");
    setForm({
      ...defaultJobForm,
      client_id: clients[0]?.id || "",
    });
  }

  function startEditJob(job) {
    setEditingJobId(job.id);
    setSelectedJobId(job.id);
    setShowCreateSection(true);
    setShowActionSection(true);
    setJobsViewMode("create");
    setForm({
      client_id: job.client_id || "",
      job_date: job.job_date || new Date().toISOString().split("T")[0],
      notes: job.notes || "",
      hours_mode: job.hours_mode || "use_client",
      pay_mode: job.pay_mode || "use_client",
      mileage_mode: job.mileage_mode || "use_client",
      hours: job.hours ?? "",
      hourly_rate: job.hourly_rate ?? "",
      service_amount: job.service_amount ?? "",
      supplies_amount: job.supplies_amount ?? "",
      supplies_notes: job.supplies_notes || "",
      mileage: job.mileage ?? "",
      is_paid: !!job.is_paid,
    });
    setMessage(`Editing job for ${job.clients?.name || "client"}`);
  }

  function resolveHoursMode() {
    const client = getSelectedClient();
    if (form.hours_mode !== "use_client") return form.hours_mode;
    return client?.hours_mode || "manual";
  }

  function resolvePayMode() {
    const client = getSelectedClient();
    if (form.pay_mode !== "use_client") return form.pay_mode;
    return client?.pay_mode || "hourly";
  }

  function resolveMileageMode() {
    const client = getSelectedClient();
    if (form.mileage_mode !== "use_client") return form.mileage_mode;
    return client?.mileage_mode || "client_default";
  }

  function resolvedValues() {
    const client = getSelectedClient();
    const hoursMode = resolveHoursMode();
    const payMode = resolvePayMode();
    const mileageMode = resolveMileageMode();

    let hours = "";
    if (hoursMode === "client_default") hours = client?.default_hours ?? "";
    if (hoursMode === "manual") hours = form.hours;
    if (hoursMode === "blank") hours = "";

    let hourlyRate = "";
    let serviceAmount = 0;

    if (payMode === "hourly") {
      hourlyRate =
        form.hourly_rate !== "" ? form.hourly_rate : client?.hourly_rate ?? "";
      serviceAmount = Number(hours || 0) * Number(hourlyRate || 0);
    } else {
      serviceAmount = Number(form.service_amount || 0);
    }

    let mileage = "";
    if (mileageMode === "client_default") mileage = client?.mileage ?? "";
    if (mileageMode === "manual") mileage = form.mileage;
    if (mileageMode === "ignore") mileage = "";

    const suppliesAmount = Number(form.supplies_amount || 0);
    const subtotal = serviceAmount + suppliesAmount;
    const gstAmount = settings.charge_gst
      ? subtotal * (Number(settings.gst_rate || 0) / 100)
      : 0;

    return {
      hoursMode,
      payMode,
      mileageMode,
      hours,
      hourlyRate,
      serviceAmount,
      suppliesAmount,
      mileage,
      gstAmount,
      totalValue: subtotal + gstAmount,
    };
  }

  const preview = resolvedValues();

  async function saveJob(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const client = getSelectedClient();
      if (!client) throw new Error("Choose a client.");

      const resolved = resolvedValues();

      if (!form.job_date) throw new Error("Choose a job date.");

      if (
        resolved.payMode === "hourly" &&
        (resolved.hours === "" || resolved.hours === null)
      ) {
        throw new Error("Hours are required for hourly jobs.");
      }

      const payload = {
        client_id: form.client_id,
        job_date: form.job_date,
        hours: resolved.hours === "" ? null : Number(resolved.hours),
        hourly_rate:
          resolved.hourlyRate === "" ? null : Number(resolved.hourlyRate),
        service_amount: Number(resolved.serviceAmount || 0),
        supplies_amount: Number(resolved.suppliesAmount || 0),
        supplies_notes: form.supplies_notes.trim(),
        gst_amount: Number(resolved.gstAmount || 0),
        total_value: Number(resolved.totalValue || 0),
        mileage: resolved.mileage === "" ? null : Number(resolved.mileage),
        notes: form.notes.trim(),
        hours_mode: resolved.hoursMode,
        pay_mode: resolved.payMode,
        mileage_mode: resolved.mileageMode,
        is_paid: client.track_paid_status ? !!form.is_paid : false,
      };

      let result;
      if (editingJobId) {
        result = await supabase
          .from("jobs")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editingJobId);
      } else {
        result = await supabase.from("jobs").insert([payload]);
      }

      if (result.error) throw result.error;

      setMessage(editingJobId ? "Job updated." : "Job saved.");
      resetJobForm();
      await loadJobs();
    } catch (error) {
      setMessage(error.message);
    }

    setSaving(false);
  }

  async function deleteCurrentJob() {
    if (!editingJobId) {
      setMessage("Choose a job to delete first.");
      return;
    }

    const jobToDelete = jobs.find((j) => j.id === editingJobId);
    if (!jobToDelete) {
      setMessage("That job could not be found.");
      return;
    }

    const ok = window.confirm(
      "Delete this job? It will move to Deleted so it can be restored later."
    );
    if (!ok) return;

    setDeleting(true);
    setMessage("");

    const deletedPayload = {
      original_job_id: jobToDelete.id,
      client_id: jobToDelete.client_id,
      job_date: jobToDelete.job_date,
      hours: jobToDelete.hours,
      hourly_rate: jobToDelete.hourly_rate,
      service_amount: jobToDelete.service_amount,
      supplies_amount: jobToDelete.supplies_amount,
      supplies_notes: jobToDelete.supplies_notes,
      gst_amount: jobToDelete.gst_amount,
      total_value: jobToDelete.total_value,
      mileage: jobToDelete.mileage,
      notes: jobToDelete.notes,
      hours_mode: jobToDelete.hours_mode,
      pay_mode: jobToDelete.pay_mode,
      mileage_mode: jobToDelete.mileage_mode,
      is_paid: jobToDelete.is_paid,
    };

    const archiveResult = await supabase.from("deleted_jobs").insert([deletedPayload]);
    if (archiveResult.error) {
      setMessage(archiveResult.error.message);
      setDeleting(false);
      return;
    }

    const deleteResult = await supabase.from("jobs").delete().eq("id", editingJobId);
    if (deleteResult.error) {
      setMessage(deleteResult.error.message);
      setDeleting(false);
      return;
    }

    setMessage("Job moved to Deleted.");
    resetJobForm();
    setInvoicePreviewJob(null);
    await loadJobs();
    setDeleting(false);
  }

  async function togglePaid(job) {
    const { error } = await supabase
      .from("jobs")
      .update({ is_paid: !job.is_paid, updated_at: new Date().toISOString() })
      .eq("id", job.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    loadJobs();
  }

  function handlePreviewInvoice() {
    if (!selectedJob) {
      setMessage("Choose a job below first.");
      return;
    }
    setInvoicePreviewJob(selectedJob);
    setMessage("Invoice print preview opened. Use Print / Save PDF at the top.");
  }

  function handleEmailInvoice() {
    if (!selectedJob) {
      setMessage("Choose a job below first.");
      return;
    }

    const email = buildJobInvoiceEmail(selectedJob, settings);
    if (!email.to) {
      setMessage("No client invoice email or default email is saved in settings.");
      return;
    }

    openMailto(email.to, email.subject, email.body);
    setMessage("Invoice email draft was requested from your device email app.");
  }

  const filteredJobs = jobs.filter((job) => {
    if (filter === "customer" && filterClientId && job.client_id !== filterClientId) {
      return false;
    }

    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    if (filter === "historical" && new Date(job.job_date) >= monday) return false;

    if (filter === "week") {
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      const jobDate = new Date(job.job_date);
      if (!(jobDate >= monday && jobDate <= sunday)) return false;
    }

    const trackPaid = !!job.clients?.track_paid_status;
    if (paidFilter === "paid") {
      if (!trackPaid || !job.is_paid) return false;
    }
    if (paidFilter === "unpaid") {
      if (!trackPaid || job.is_paid) return false;
    }
    if (paidFilter === "tracked_only") {
      if (!trackPaid) return false;
    }

    if (
      !matchesSearch(
        [
          job.clients?.name,
          job.notes,
          job.job_date,
          cleanNumber(job.hours),
          money(job.total_value),
        ],
        jobSearch
      )
    ) {
      return false;
    }

    return true;
  });

  const selectedClient = getSelectedClient();
  const showPaidToggle = !!selectedClient?.track_paid_status;
  const unpaidCount = jobs.filter(
    (job) => job.clients?.track_paid_status && !job.is_paid
  ).length;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={pageTitle}>Jobs</h1>

      <ModeTabs
        mode={jobsViewMode}
        onChange={setJobsViewMode}
        createLabel={editingJobId ? "Edit / Create" : "Create"}
        manageLabel="Manage"
      />

      {jobsViewMode === "create" ? (
        <>
          {editingJobId ? (
            <div style={selectedPanelStyle}>
              <div>
                <div style={selectedPanelLabelStyle}>Editing Job</div>
                <div style={selectedPanelTitleStyle}>
                  {clientMap[form.client_id]?.name || "Selected client"}
                </div>
                <div style={mutedTextCompact}>
                  {form.job_date || "No date selected"}
                </div>
              </div>
              <button type="button" onClick={resetJobForm} style={secondaryButtonStyle}>
                Cancel
              </button>
            </div>
          ) : null}

          <SectionCard
            title={editingJobId ? "Edit Job" : "Add Job"}
            subtitle={editingJobId ? "Update the selected job." : "Create a new job entry."}
            isOpen={showCreateSection}
            onToggle={() => setShowCreateSection((v) => !v)}
          >
            <form onSubmit={saveJob} style={compactFormStyle}>
              <select
                value={form.client_id}
                onChange={(e) => updateField("client_id", e.target.value)}
                style={inputStyle}
              >
                <option value="">Choose client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>

              <div style={grid2}>
                <input
                  type="date"
                  value={form.job_date}
                  onChange={(e) => updateField("job_date", e.target.value)}
                  style={inputStyle}
                />
                <input
                  placeholder="Notes"
                  value={form.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  style={inputStyle}
                />
              </div>

              <select
                value={form.hours_mode}
                onChange={(e) => updateField("hours_mode", e.target.value)}
                style={inputStyle}
              >
                <option value="use_client">Use Client Default Hours Setting</option>
                <option value="manual">Manual Hours</option>
                <option value="blank">Leave Hours Blank</option>
              </select>

              {resolveHoursMode() === "manual" ? (
                <input
                  type="number"
                  step="0.25"
                  placeholder="Hours"
                  value={form.hours}
                  onChange={(e) => updateField("hours", e.target.value)}
                  style={inputStyle}
                />
              ) : null}

              <select
                value={form.pay_mode}
                onChange={(e) => updateField("pay_mode", e.target.value)}
                style={inputStyle}
              >
                <option value="use_client">Use Client Default Pay Setting</option>
                <option value="hourly">Hourly</option>
                <option value="manual_total">Manual Total Value</option>
              </select>

              {resolvePayMode() === "hourly" ? (
                <input
                  type="number"
                  step="0.01"
                  placeholder="Hourly rate"
                  value={
                    form.hourly_rate !== ""
                      ? form.hourly_rate
                      : selectedClient?.hourly_rate ?? ""
                  }
                  onChange={(e) => updateField("hourly_rate", e.target.value)}
                  style={inputStyle}
                />
              ) : (
                <input
                  type="number"
                  step="0.01"
                  placeholder="Manual service amount"
                  value={form.service_amount}
                  onChange={(e) => updateField("service_amount", e.target.value)}
                  style={inputStyle}
                />
              )}

              <div style={grid2}>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Supplies amount"
                  value={form.supplies_amount}
                  onChange={(e) => updateField("supplies_amount", e.target.value)}
                  style={inputStyle}
                />
                <input
                  placeholder="Supplies notes"
                  value={form.supplies_notes}
                  onChange={(e) => updateField("supplies_notes", e.target.value)}
                  style={inputStyle}
                />
              </div>

              <select
                value={form.mileage_mode}
                onChange={(e) => updateField("mileage_mode", e.target.value)}
                style={inputStyle}
              >
                <option value="use_client">Use Client Default Mileage Setting</option>
                <option value="manual">Manual Mileage</option>
                <option value="ignore">Ignore Mileage</option>
              </select>

              {resolveMileageMode() === "manual" ? (
                <input
                  type="number"
                  step="0.1"
                  placeholder="Mileage"
                  value={form.mileage}
                  onChange={(e) => updateField("mileage", e.target.value)}
                  style={inputStyle}
                />
              ) : null}

              {showPaidToggle ? (
                <label style={{ fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={form.is_paid}
                    onChange={(e) => updateField("is_paid", e.target.checked)}
                    style={{ marginRight: 10 }}
                  />
                  Mark this job paid
                </label>
              ) : null}

              <div style={previewGrid}>
                <PreviewBox label="Service" value={money(preview.serviceAmount)} />
                <PreviewBox label="GST" value={money(preview.gstAmount)} />
                <PreviewBox label="Total" value={money(preview.totalValue)} />
              </div>

              <div style={grid2}>
                <button type="submit" disabled={saving} style={buttonStyle}>
                  {saving
                    ? "Saving..."
                    : editingJobId
                    ? "Save Job Changes"
                    : "Save Job"}
                </button>

                {editingJobId ? (
                  <button
                    type="button"
                    onClick={deleteCurrentJob}
                    disabled={deleting}
                    style={dangerButtonStyle}
                  >
                    {deleting ? "Deleting..." : "Delete Job"}
                  </button>
                ) : (
                  <button type="button" onClick={resetJobForm} style={secondaryButtonStyle}>
                    Clear Form
                  </button>
                )}
              </div>

              {message ? <div style={{ fontWeight: 700 }}>{message}</div> : null}
            </form>
          </SectionCard>
        </>
      ) : (
        <>
          <div style={statsGrid}>
            <StatCard label="All Jobs" value={String(jobs.length)} />
            <StatCard label="Unpaid Tracked" value={String(unpaidCount)} />
          </div>

          {selectedJob ? (
            <div style={selectedPanelStyle}>
              <div>
                <div style={selectedPanelLabelStyle}>Selected Job</div>
                <div style={selectedPanelTitleStyle}>
                  {selectedJob.clients?.name || clientMap[selectedJob.client_id]?.name || "Unknown client"}
                </div>
                <div style={mutedTextCompact}>
                  {selectedJob.job_date} | {money(selectedJob.total_value)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedJobId("");
                  setShowInvoiceMenu(false);
                }}
                style={secondaryButtonStyle}
              >
                Clear
              </button>
            </div>
          ) : null}

          <SectionCard
            title="Selected Job Actions"
            subtitle={selectedJob ? "Choose a document, then choose what to do with it." : "Select a job below to use actions."}
            isOpen={showActionSection}
            onToggle={() => setShowActionSection((v) => !v)}
          >
            {selectedJob ? (
              <div style={compactFormStyle}>
                <div style={mutedTextCompact}>
                  Open Invoice goes straight to the invoice viewer. Print and Save PDF happen from the preview screen.
                </div>
                <div style={grid2}>
                  <button type="button" onClick={handlePreviewInvoice} style={buttonStyle}>
                    Open Invoice
                  </button>
                  <button type="button" onClick={handleEmailInvoice} style={secondaryButtonStyle}>
                    Email Invoice
                  </button>
                </div>
              </div>
            ) : (
              <div style={mutedText}>No job selected.</div>
            )}
          </SectionCard>

          <SectionCard
            title="Search and Filters"
            subtitle="Search jobs and narrow the list."
            isOpen={showFilterSection}
            onToggle={() => setShowFilterSection((v) => !v)}
          >
            <div style={compactFormStyle}>
              <input
                placeholder="Search by client, notes, date, total..."
                value={jobSearch}
                onChange={(e) => setJobSearch(e.target.value)}
                style={inputStyle}
              />

              <div style={grid2}>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  style={inputStyle}
                >
                  <option value="week">This Week</option>
                  <option value="historical">Previous / Historical</option>
                  <option value="customer">Specific Customer</option>
                  <option value="all">All Jobs</option>
                </select>

                <select
                  value={paidFilter}
                  onChange={(e) => setPaidFilter(e.target.value)}
                  style={inputStyle}
                >
                  <option value="all">All Paid Status</option>
                  <option value="tracked_only">Tracked Only</option>
                  <option value="paid">Paid Only</option>
                  <option value="unpaid">Unpaid Only</option>
                </select>
              </div>

              {filter === "customer" ? (
                <select
                  value={filterClientId}
                  onChange={(e) => setFilterClientId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Choose customer</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            title="Existing Jobs"
            subtitle="Tap a card to select it. Use Edit to load it into the create tab."
            isOpen={showListSection}
            onToggle={() => setShowListSection((v) => !v)}
            countText={String(filteredJobs.length)}
          >
            <div style={{ display: "grid", gap: 12 }}>
              {loading ? <div>Loading jobs...</div> : null}
              {!loading && filteredJobs.length === 0 ? <div>No jobs found.</div> : null}

              {filteredJobs.map((job) => {
                const jobClient = clientMap[job.client_id];
                const trackPaid = !!jobClient?.track_paid_status;
                const isSelected = selectedJobId === job.id;

                return (
                  <div
                    key={job.id}
                    style={{
                      ...simpleCardStyle,
                      borderColor: isSelected ? "#1e1b18" : "#d0ccc4",
                      background: isSelected ? "#f6f1e8" : "#fff",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedJobId(job.id);
                        setShowInvoiceMenu(false);
                        setMessage(`Selected job for ${jobClient?.name || "client"}.`);
                      }}
                      style={simpleCardButtonStyle}
                    >
                      <div style={simpleCardMainRowStyle}>
                        <div style={simpleCardTitleStyle}>
                          {jobClient?.name || "Unknown client"}
                        </div>
                        <div style={simpleCardAmountStyle}>{money(job.total_value)}</div>
                      </div>
                      <div style={simpleCardSubRowStyle}>
                        <span>{job.job_date}</span>
                        <span>{job.notes || "No notes"}</span>
                      </div>
                      {trackPaid ? (
                        <div style={{ ...mutedTextCompact, fontWeight: 700 }}>
                          {job.is_paid ? "Paid" : "Unpaid"}
                        </div>
                      ) : null}
                    </button>

                    {isSelected ? (
                      <div style={simpleCardActionsStyle}>
                        <button
                          type="button"
                          onClick={() => startEditJob(job)}
                          style={secondaryMiniButtonStyle}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedJobId(job.id);
                            setInvoicePreviewJob(job);
                            setMessage("Invoice print preview opened.");
                          }}
                          style={miniButtonStyle}
                        >
                          Invoice
                        </button>
                        {trackPaid ? (
                          <label
                            style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={!!job.is_paid}
                              onChange={() => togglePaid(job)}
                            />
                            Paid
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </>
      )}

      {invoicePreviewJob ? (
        <PrintPreviewOverlay
          title="Invoice Print Preview"
          onClose={() => setInvoicePreviewJob(null)}
        >
          <InvoiceDocument job={invoicePreviewJob} settings={settings} />
        </PrintPreviewOverlay>
      ) : null}
    </div>
  );
}

function MileagePage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [editingMileageId, setEditingMileageId] = useState("");
  const [form, setForm] = useState(defaultMileageForm);

  async function loadEntries() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("daily_mileage")
      .select("*")
      .order("mileage_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      setEntries([]);
    } else {
      setEntries(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadEntries();
  }, []);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetMileageForm() {
    setEditingMileageId("");
    setForm({
      mileage_date: new Date().toISOString().split("T")[0],
      mileage: "",
      vehicle: "",
      notes: "",
    });
  }

  function startEditMileage(entry) {
    setEditingMileageId(entry.id);
    setForm({
      mileage_date: entry.mileage_date || new Date().toISOString().split("T")[0],
      mileage: entry.mileage ?? "",
      vehicle: entry.vehicle || "",
      notes: entry.notes || "",
    });
    setMessage("Editing mileage entry.");
  }

  async function saveEntry(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const payload = {
      mileage_date: form.mileage_date,
      mileage: Number(form.mileage || 0),
      vehicle: form.vehicle.trim(),
      notes: form.notes.trim(),
    };

    let result;
    if (editingMileageId) {
      result = await supabase
        .from("daily_mileage")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", editingMileageId);
    } else {
      result = await supabase.from("daily_mileage").insert([payload]);
    }

    if (result.error) {
      setMessage(result.error.message);
    } else {
      setMessage(editingMileageId ? "Mileage entry updated." : "Mileage entry saved.");
      resetMileageForm();
      loadEntries();
    }

    setSaving(false);
  }

  async function deleteCurrentMileage() {
    if (!editingMileageId) {
      setMessage("Choose a mileage entry to delete first.");
      return;
    }

    const entryToDelete = entries.find((e) => e.id === editingMileageId);
    if (!entryToDelete) {
      setMessage("That mileage entry could not be found.");
      return;
    }

    const ok = window.confirm(
      "Delete this mileage entry? It will move to Deleted so it can be restored later."
    );
    if (!ok) return;

    setDeleting(true);
    setMessage("");

    const deletedPayload = {
      original_mileage_id: entryToDelete.id,
      mileage_date: entryToDelete.mileage_date,
      mileage: entryToDelete.mileage,
      vehicle: entryToDelete.vehicle,
      notes: entryToDelete.notes,
    };

    const archiveResult = await supabase
      .from("deleted_daily_mileage")
      .insert([deletedPayload]);

    if (archiveResult.error) {
      setMessage(archiveResult.error.message);
      setDeleting(false);
      return;
    }

    const deleteResult = await supabase
      .from("daily_mileage")
      .delete()
      .eq("id", editingMileageId);

    if (deleteResult.error) {
      setMessage(deleteResult.error.message);
      setDeleting(false);
      return;
    }

    setMessage("Mileage entry moved to Deleted.");
    resetMileageForm();
    loadEntries();
    setDeleting(false);
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={pageTitle}>Mileage</h1>

      <form onSubmit={saveEntry} style={formCardStyle}>
        <div style={betweenRow}>
          <div style={sectionTitle}>
            {editingMileageId ? "Edit Mileage" : "Add Mileage"}
          </div>
          {editingMileageId ? (
            <button
              type="button"
              onClick={resetMileageForm}
              style={secondaryButtonStyle}
            >
              Cancel Edit
            </button>
          ) : null}
        </div>

        <div style={grid2}>
          <input
            type="date"
            value={form.mileage_date}
            onChange={(e) => updateField("mileage_date", e.target.value)}
            style={inputStyle}
          />
          <input
            type="number"
            step="0.1"
            placeholder="Mileage"
            value={form.mileage}
            onChange={(e) => updateField("mileage", e.target.value)}
            style={inputStyle}
          />
        </div>

        <input
          placeholder="Vehicle"
          value={form.vehicle}
          onChange={(e) => updateField("vehicle", e.target.value)}
          style={inputStyle}
        />

        <input
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => updateField("notes", e.target.value)}
          style={inputStyle}
        />

        <div style={grid2}>
          <button type="submit" disabled={saving} style={buttonStyle}>
            {saving
              ? "Saving..."
              : editingMileageId
              ? "Save Mileage Changes"
              : "Save Mileage"}
          </button>

          {editingMileageId ? (
            <button
              type="button"
              onClick={deleteCurrentMileage}
              disabled={deleting}
              style={dangerButtonStyle}
            >
              {deleting ? "Deleting..." : "Delete Mileage"}
            </button>
          ) : null}
        </div>

        {message ? <div style={{ fontWeight: 700 }}>{message}</div> : null}
      </form>

      <div style={{ display: "grid", gap: 12 }}>
        {loading ? <div>Loading mileage...</div> : null}
        {!loading && entries.length === 0 ? <div>No mileage entries yet.</div> : null}
        {entries.map((entry) => {
          const isEditing = editingMileageId === entry.id;
          return (
            <div
              key={entry.id}
              style={{
                ...cardStyle,
                cursor: "pointer",
                borderColor: isEditing ? "#1e1b18" : "#d0ccc4",
              }}
              onClick={() => startEditMileage(entry)}
            >
              <div style={itemTitle}>{entry.mileage_date}</div>
              <div style={{ marginTop: 8 }}>{cleanNumber(entry.mileage)} km</div>
              <div style={mutedText}>
                {entry.vehicle || ""} {entry.notes ? `| ${entry.notes}` : ""}
              </div>
              <div style={{ ...mutedText, fontWeight: 700 }}>
                {isEditing ? "Editing this mileage entry" : "Tap to edit"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportsPage() {
  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [dailyMileage, setDailyMileage] = useState([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState("all");
  const [clientId, setClientId] = useState("");
  const [reportType, setReportType] = useState("month");
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [actionMessage, setActionMessage] = useState("");
  const [reportPreview, setReportPreview] = useState(null);

  useEffect(() => {
    async function loadReportData() {
      setLoading(true);
      setMessage("");

      try {
        const [clientsRes, jobsRes, mileageRes, settingsRes] = await Promise.all([
          supabase.from("clients").select("*").order("name", { ascending: true }),
          supabase
            .from("jobs")
            .select("*, clients(name)")
            .order("job_date", { ascending: false })
            .order("created_at", { ascending: false }),
          supabase
            .from("daily_mileage")
            .select("*")
            .order("mileage_date", { ascending: false })
            .order("created_at", { ascending: false }),
          supabase
            .from("business_settings")
            .select("*")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);

        if (clientsRes.error) throw clientsRes.error;
        if (jobsRes.error) throw jobsRes.error;
        if (mileageRes.error) throw mileageRes.error;
        if (settingsRes.error) throw settingsRes.error;

        setClients(clientsRes.data || []);
        setJobs(jobsRes.data || []);
        setDailyMileage(mileageRes.data || []);
        setSettings(settingsRes.data ? normalizeSettings(settingsRes.data) : defaultSettings);
      } catch (error) {
        setMessage(error.message);
      }

      setLoading(false);
    }

    loadReportData();
  }, []);

  const dateRange = useMemo(
    () => getDateRange(reportType, month, year),
    [reportType, month, year]
  );

  const filteredJobs = jobs.filter((job) => {
    const jobDate = new Date(job.job_date);
    if (jobDate < dateRange.start || jobDate > dateRange.end) return false;
    if (scope === "client" && clientId && job.client_id !== clientId) return false;
    return true;
  });

  const filteredDailyMileage = dailyMileage.filter((entry) => {
    const d = new Date(entry.mileage_date);
    return d >= dateRange.start && d <= dateRange.end;
  });

  const totals = sumJobs(filteredJobs);
  const dailyMileageTotal = filteredDailyMileage.reduce(
    (sum, entry) => sum + Number(entry.mileage || 0),
    0
  );

  const rankingMap = {};
  filteredJobs.forEach((job) => {
    const key = job.client_id || "unknown";
    if (!rankingMap[key]) {
      rankingMap[key] = {
        clientName: job.clients?.name || "Unknown",
        service: 0,
        hours: 0,
        jobs: 0,
      };
    }
    rankingMap[key].service += Number(job.service_amount || 0);
    rankingMap[key].hours += Number(job.hours || 0);
    rankingMap[key].jobs += 1;
  });

  const rankings = Object.values(rankingMap)
    .map((row) => ({
      ...row,
      valuePerHour: row.hours ? row.service / row.hours : 0,
      valuePerJob: row.jobs ? row.service / row.jobs : 0,
    }))
    .sort((a, b) => b.valuePerHour - a.valuePerHour);

  const selectedClient = clients.find((client) => client.id === clientId) || null;
  const scopeLabel = scope === "client"
    ? selectedClient?.name || "Selected Customer"
    : "All Customers";

  const reportData = {
    scope,
    scopeLabel,
    client: selectedClient,
    range: dateRange,
    jobs: filteredJobs,
    totals,
    dailyMileageTotal,
    rankings,
  };

  function handlePreviewReport() {
    setReportPreview(reportData);
    setActionMessage("Report print preview opened. Use Print / Save PDF at the top.");
  }

  function handleEmailReport() {
    const email = buildReportEmail(reportData, settings);
    if (!email.to) {
      setActionMessage("No default email or business email is saved in settings.");
      return;
    }

    openMailto(email.to, email.subject, email.body);
    setActionMessage("Report email draft was requested from your device email app.");
  }

  return (
    <div style={{ paddingTop: 10 }}>
      <div style={cardStyle}>
        <div style={sectionTitle}>Reports</div>

        <div style={{ display: "grid", gap: 12 }}>
          <select value={scope} onChange={(e) => setScope(e.target.value)} style={inputStyle}>
            <option value="all">All Customers</option>
            <option value="client">Single Customer</option>
          </select>

          {scope === "client" ? (
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              style={inputStyle}
            >
              <option value="">Choose customer</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          ) : null}

          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            style={inputStyle}
          >
            <option value="month">Selected Month</option>
            <option value="mtd">MTD</option>
            <option value="ytd">YTD</option>
            <option value="year">Selected Year</option>
          </select>

          {reportType === "month" ? (
            <select value={month} onChange={(e) => setMonth(e.target.value)} style={inputStyle}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {i + 1}
                </option>
              ))}
            </select>
          ) : null}

          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={cardStyle}>
        <div style={sectionTitle}>Report Actions</div>
        <div style={grid2}>
          <button type="button" onClick={handlePreviewReport} style={buttonStyle}>
            Preview Report
          </button>
          <button type="button" onClick={handleEmailReport} style={buttonStyle}>
            Email Report
          </button>
        </div>

        {actionMessage ? <div style={{ marginTop: 14, fontWeight: 700 }}>{actionMessage}</div> : null}
      </div>

      {message ? <div style={cardStyle}>{message}</div> : null}

      <div style={cardStyle}>
        <div style={sectionTitle}>Report Preview</div>

        {loading ? <div>Loading report...</div> : null}

        {!loading ? (
          <>
            <div style={statsGrid}>
              <StatCard label="Service" value={money(totals.service)} />
              <StatCard label="Supplies" value={money(totals.supplies)} />
              <StatCard label="GST" value={money(totals.gst)} />
              <StatCard label="Total" value={money(totals.total)} />
              <StatCard label="Hours" value={cleanNumber(totals.hours)} />
              <StatCard label="Combined KM" value={cleanNumber(totals.mileage + dailyMileageTotal)} />
            </div>

            <div style={innerCardStyle}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Mileage Breakdown</div>
              <div style={mutedText}>
                Job mileage: {cleanNumber(totals.mileage)} km
                <br />
                Daily mileage: {cleanNumber(dailyMileageTotal)} km
              </div>
            </div>

            <div style={{ marginTop: 18, fontSize: 22, fontWeight: 900 }}>
              Customer Rankings
            </div>

            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
              {rankings.length === 0 ? (
                <div>No jobs in this report range.</div>
              ) : (
                rankings.map((row, idx) => (
                  <div key={idx} style={innerCardStyle}>
                    <div style={{ fontSize: 20, fontWeight: 900 }}>{row.clientName}</div>
                    <div style={mutedText}>
                      Service only: {money(row.service)} | Hours: {cleanNumber(row.hours)} | Jobs: {row.jobs}
                    </div>
                    <div style={mutedText}>
                      $ / Hour: {money(row.valuePerHour)} | $ / Job: {money(row.valuePerJob)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>

      {reportPreview ? (
        <PrintPreviewOverlay
          title="Report Print Preview"
          onClose={() => setReportPreview(null)}
        >
          <ReportDocument preview={reportPreview} settings={settings} />
        </PrintPreviewOverlay>
      ) : null}
    </div>
  );
}

function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [settingsId, setSettingsId] = useState(null);
  const [form, setForm] = useState(defaultSettingsForm);

  async function loadSettings() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("business_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (data) {
      setSettingsId(data.id);
      setForm({
        business_name: data.business_name || "",
        business_phone: data.business_phone || "",
        business_email: data.business_email || "",
        default_email: data.default_email || "",
        tax_number: data.tax_number || "",
        business_notes: data.business_notes || "",
        charge_gst: !!data.charge_gst,
        gst_rate: String(data.gst_rate ?? 5),
      });
    }

    setLoading(false);
  }

  useEffect(() => {
    loadSettings();
  }, []);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveSettings(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const payload = {
      business_name: form.business_name.trim(),
      business_phone: form.business_phone.trim(),
      business_email: form.business_email.trim(),
      default_email: form.default_email.trim(),
      tax_number: form.tax_number.trim(),
      business_notes: form.business_notes.trim(),
      charge_gst: !!form.charge_gst,
      gst_rate: Number(form.gst_rate || 0),
      updated_at: new Date().toISOString(),
    };

    const result = settingsId
      ? await supabase.from("business_settings").update(payload).eq("id", settingsId)
      : await supabase.from("business_settings").insert([payload]).select().single();

    if (result.error) {
      setMessage(result.error.message);
    } else {
      if (!settingsId && result.data?.id) setSettingsId(result.data.id);
      setMessage("Settings saved.");
    }

    setSaving(false);
  }

  return (
    <div style={{ paddingTop: 10 }}>
      <form onSubmit={saveSettings} style={formCardStyle}>
        <div style={sectionTitle}>Settings</div>
        {loading ? <div>Loading settings...</div> : null}

        <input
          placeholder="Business name"
          value={form.business_name}
          onChange={(e) => updateField("business_name", e.target.value)}
          style={inputStyle}
        />

        <div style={grid2}>
          <input
            placeholder="Business phone"
            value={form.business_phone}
            onChange={(e) => updateField("business_phone", e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Business email"
            value={form.business_email}
            onChange={(e) => updateField("business_email", e.target.value)}
            style={inputStyle}
          />
        </div>

        <input
          placeholder="Default email"
          value={form.default_email}
          onChange={(e) => updateField("default_email", e.target.value)}
          style={inputStyle}
        />

        <input
          placeholder="Tax number"
          value={form.tax_number}
          onChange={(e) => updateField("tax_number", e.target.value)}
          style={inputStyle}
        />

        <textarea
          placeholder="Business notes"
          value={form.business_notes}
          onChange={(e) => updateField("business_notes", e.target.value)}
          style={{ ...inputStyle, minHeight: 100, resize: "vertical" }}
        />

        <label style={{ fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={form.charge_gst}
            onChange={(e) => updateField("charge_gst", e.target.checked)}
            style={{ marginRight: 10 }}
          />
          Charge GST on service and supplies
        </label>

        <input
          type="number"
          step="0.01"
          placeholder="GST rate"
          value={form.gst_rate}
          onChange={(e) => updateField("gst_rate", e.target.value)}
          style={inputStyle}
        />

        <button type="submit" disabled={saving} style={buttonStyle}>
          {saving ? "Saving..." : "Save Settings"}
        </button>

        {message ? <div style={{ fontWeight: 700 }}>{message}</div> : null}
      </form>
    </div>
  );
}

function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);
  const [message, setMessage] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientStatusFilter, setClientStatusFilter] = useState("all");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [editingClientId, setEditingClientId] = useState("");
  const [docMessage, setDocMessage] = useState("");
  const [statementType, setStatementType] = useState("month");
  const [statementMonth, setStatementMonth] = useState(
    String(new Date().getMonth() + 1)
  );
  const [statementYear, setStatementYear] = useState(
    String(new Date().getFullYear())
  );
  const [statementPreview, setStatementPreview] = useState(null);
  const [monthlyInvoicePreview, setMonthlyInvoicePreview] = useState(null);
  const [form, setForm] = useState(defaultClientForm);

  const [showClientForm, setShowClientForm] = useState(true);
  const [showClientActions, setShowClientActions] = useState(true);
  const [showClientList, setShowClientList] = useState(true);
  const [showClientSearchSection, setShowClientSearchSection] = useState(true);
  const [showStatementMenu, setShowStatementMenu] = useState(false);
  const [showInvoiceMenu, setShowInvoiceMenu] = useState(false);
  const [clientsViewMode, setClientsViewMode] = useState("create");

  async function loadAll() {
    setLoading(true);
    setMessage("");

    try {
      const [clientsRes, jobsRes, settingsRes] = await Promise.all([
        supabase.from("clients").select("*").order("created_at", { ascending: true }),
        supabase
          .from("jobs")
          .select("*, clients(name,address,phone,invoice_email)")
          .order("job_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("business_settings")
          .select("*")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (clientsRes.error) throw clientsRes.error;
      if (jobsRes.error) throw jobsRes.error;
      if (settingsRes.error) throw settingsRes.error;

      setClients(clientsRes.data || []);
      setJobs(jobsRes.data || []);
      setSettings(settingsRes.data ? normalizeSettings(settingsRes.data) : defaultSettings);
    } catch (error) {
      setMessage(error.message);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetClientForm() {
    setForm(defaultClientForm);
    setEditingClientId("");
    setClientsViewMode("create");
  }

  function startEditClient(client) {
    setSelectedClientId(client.id);
    setEditingClientId(client.id);
    setShowClientForm(true);
    setShowClientActions(true);
    setClientsViewMode("create");
    setForm({
      name: client.name || "",
      address: client.address || "",
      phone: client.phone || "",
      frequency: client.frequency || "",
      hourly_rate: client.hourly_rate ?? "",
      mileage: client.mileage ?? "",
      notes: client.notes || "",
      hours_mode: client.hours_mode || "manual",
      default_hours: client.default_hours ?? "",
      pay_mode: client.pay_mode || "hourly",
      mileage_mode: client.mileage_mode || "client_default",
      invoice_email: client.invoice_email || "",
      track_paid_status: !!client.track_paid_status,
    });
    setMessage(`Editing ${client.name}`);
  }

  function selectedClient() {
    return clients.find((client) => client.id === selectedClientId) || null;
  }

  function getSelectedClientJobsForRange() {
    const client = selectedClient();
    if (!client) return null;

    const range = getDateRange(statementType, statementMonth, statementYear);

    const clientJobs = jobs.filter((job) => {
      const d = new Date(job.job_date);
      return job.client_id === client.id && d >= range.start && d <= range.end;
    });

    return {
      client,
      jobs: clientJobs,
      range,
      totals: sumJobs(clientJobs),
    };
  }

  function buildStatementPreview() {
    const data = getSelectedClientJobsForRange();
    if (!data) {
      setDocMessage("Choose a client for document actions.");
      return;
    }

    setMonthlyInvoicePreview(null);
    setStatementPreview(data);
    setDocMessage("Statement print preview opened. Use Print / Save PDF at the top.");
  }

  function buildMonthlyInvoicePreview() {
    const data = getSelectedClientJobsForRange();
    if (!data) {
      setDocMessage("Choose a client for document actions.");
      return;
    }

    setStatementPreview(null);
    setMonthlyInvoicePreview(data);
    setDocMessage("Monthly invoice print preview opened. Use Print / Save PDF at the top.");
  }

  function handleEmailStatement() {
    const preview = getSelectedClientJobsForRange();
    if (!preview) {
      setDocMessage("Choose a client for document actions.");
      return;
    }

    const email = buildClientStatementEmail(preview, settings);
    if (!email.to) {
      setDocMessage("No client invoice email or default email is saved in settings.");
      return;
    }

    openMailto(email.to, email.subject, email.body);
    setDocMessage("Statement email draft was requested from your device email app.");
  }

  function handleEmailMonthlyInvoice() {
    const preview = getSelectedClientJobsForRange();
    if (!preview) {
      setDocMessage("Choose a client for document actions.");
      return;
    }

    const email = buildClientMonthlyInvoiceEmail(preview, settings);
    if (!email.to) {
      setDocMessage("No client invoice email or default email is saved in settings.");
      return;
    }

    openMailto(email.to, email.subject, email.body);
    setDocMessage("Monthly invoice email draft was requested from your device email app.");
  }

  async function saveClient(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const payload = {
      name: form.name.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      frequency: form.frequency.trim(),
      hourly_rate: Number(form.hourly_rate || 0),
      mileage: Number(form.mileage || 0),
      notes: form.notes.trim(),
      hours_mode: form.hours_mode,
      default_hours:
        form.default_hours === "" ? null : Number(form.default_hours),
      pay_mode: form.pay_mode,
      mileage_mode: form.mileage_mode,
      invoice_email: form.invoice_email.trim(),
      track_paid_status: !!form.track_paid_status,
    };

    let result;
    if (editingClientId) {
      result = await supabase
        .from("clients")
        .update(payload)
        .eq("id", editingClientId);
    } else {
      result = await supabase.from("clients").insert([payload]);
    }

    if (result.error) {
      setMessage(result.error.message);
    } else {
      setMessage(editingClientId ? "Client updated." : "Client saved.");
      resetClientForm();
      loadAll();
    }

    setSaving(false);
  }

  async function deleteCurrentClient() {
    if (!editingClientId) {
      setMessage("Choose a client to delete first.");
      return;
    }

    const clientToDelete = clients.find((c) => c.id === editingClientId);
    if (!clientToDelete) {
      setMessage("That client could not be found.");
      return;
    }

    const liveJobCount = jobs.filter((job) => job.client_id === editingClientId).length;
    if (liveJobCount > 0) {
      setMessage(
        `This client still has ${liveJobCount} live job(s). Delete or move those jobs first, then delete the client.`
      );
      return;
    }

    const ok = window.confirm(
      "Delete this client? It will move to Deleted so it can be restored later."
    );
    if (!ok) return;

    setDeletingClient(true);
    setMessage("");

    const deletedPayload = {
      original_client_id: clientToDelete.id,
      name: clientToDelete.name,
      address: clientToDelete.address,
      phone: clientToDelete.phone,
      frequency: clientToDelete.frequency,
      hourly_rate: clientToDelete.hourly_rate,
      mileage: clientToDelete.mileage,
      notes: clientToDelete.notes,
      hours_mode: clientToDelete.hours_mode,
      default_hours: clientToDelete.default_hours,
      pay_mode: clientToDelete.pay_mode,
      mileage_mode: clientToDelete.mileage_mode,
      invoice_email: clientToDelete.invoice_email,
      track_paid_status: clientToDelete.track_paid_status,
    };

    const archiveResult = await supabase.from("deleted_clients").insert([deletedPayload]);
    if (archiveResult.error) {
      setMessage(archiveResult.error.message);
      setDeletingClient(false);
      return;
    }

    const deleteResult = await supabase.from("clients").delete().eq("id", editingClientId);
    if (deleteResult.error) {
      setMessage(deleteResult.error.message);
      setDeletingClient(false);
      return;
    }

    setMessage("Client moved to Deleted.");
    resetClientForm();
    setSelectedClientId("");
    setStatementPreview(null);
    setMonthlyInvoicePreview(null);
    await loadAll();
    setDeletingClient(false);
  }

  const currentClient = selectedClient();
  const currentClientJobCount = currentClient
    ? jobs.filter((job) => job.client_id === currentClient.id).length
    : 0;

  const clientsWithCounts = clients.map((client) => {
    const clientJobs = jobs.filter((job) => job.client_id === client.id);
    const unpaidTrackedCount = clientJobs.filter(
      (job) => client.track_paid_status && !job.is_paid
    ).length;

    return {
      ...client,
      job_count: clientJobs.length,
      unpaid_tracked_count: unpaidTrackedCount,
    };
  });

  const filteredClients = clientsWithCounts.filter((client) => {
    if (
      !matchesSearch(
        [
          client.name,
          client.address,
          client.phone,
          client.frequency,
          client.invoice_email,
          client.notes,
        ],
        clientSearch
      )
    ) {
      return false;
    }

    if (clientStatusFilter === "tracked_only" && !client.track_paid_status) {
      return false;
    }
    if (clientStatusFilter === "with_unpaid" && client.unpaid_tracked_count <= 0) {
      return false;
    }
    if (clientStatusFilter === "with_jobs" && client.job_count <= 0) {
      return false;
    }

    return true;
  });

  return (
    <div style={{ padding: 24 }}>
      <h1 style={pageTitle}>Clients</h1>

      <ModeTabs
        mode={clientsViewMode}
        onChange={setClientsViewMode}
        createLabel={editingClientId ? "Edit / Create" : "Create"}
        manageLabel="Manage"
      />

      {clientsViewMode === "create" ? (
        <>
          {editingClientId ? (
            <div style={selectedPanelStyle}>
              <div>
                <div style={selectedPanelLabelStyle}>Editing Client</div>
                <div style={selectedPanelTitleStyle}>{form.name || "Selected client"}</div>
                <div style={mutedTextCompact}>{form.invoice_email || "No invoice email"}</div>
              </div>
              <button type="button" onClick={resetClientForm} style={secondaryButtonStyle}>
                Cancel
              </button>
            </div>
          ) : null}

          <SectionCard
            title={editingClientId ? "Edit Client" : "Add Client"}
            subtitle={editingClientId ? "Update the selected client." : "Create a new client."}
            isOpen={showClientForm}
            onToggle={() => setShowClientForm((v) => !v)}
          >
            <form onSubmit={saveClient} style={compactFormStyle}>
              <input
                placeholder="Client name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                required
                style={inputStyle}
              />
              <input
                placeholder="Address"
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                style={inputStyle}
              />
              <input
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                style={inputStyle}
              />
              <input
                placeholder="Frequency"
                value={form.frequency}
                onChange={(e) => updateField("frequency", e.target.value)}
                style={inputStyle}
              />

              <div style={grid2}>
                <input
                  placeholder="Hourly rate"
                  type="number"
                  value={form.hourly_rate}
                  onChange={(e) => updateField("hourly_rate", e.target.value)}
                  style={inputStyle}
                />
                <input
                  placeholder="Mileage"
                  type="number"
                  value={form.mileage}
                  onChange={(e) => updateField("mileage", e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={grid2}>
                <select
                  value={form.hours_mode}
                  onChange={(e) => updateField("hours_mode", e.target.value)}
                  style={inputStyle}
                >
                  <option value="manual">Hours entered manually</option>
                  <option value="client_default">Use default hours</option>
                </select>
                <input
                  placeholder="Default hours"
                  type="number"
                  value={form.default_hours}
                  onChange={(e) => updateField("default_hours", e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={grid2}>
                <select
                  value={form.pay_mode}
                  onChange={(e) => updateField("pay_mode", e.target.value)}
                  style={inputStyle}
                >
                  <option value="hourly">Hourly</option>
                  <option value="manual_total">Manual total</option>
                </select>
                <select
                  value={form.mileage_mode}
                  onChange={(e) => updateField("mileage_mode", e.target.value)}
                  style={inputStyle}
                >
                  <option value="client_default">Use client mileage</option>
                  <option value="manual">Enter manually per job</option>
                  <option value="ignore">Ignore mileage</option>
                </select>
              </div>

              <input
                placeholder="Invoice email"
                value={form.invoice_email}
                onChange={(e) => updateField("invoice_email", e.target.value)}
                style={inputStyle}
              />

              <textarea
                placeholder="Notes"
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                style={{ ...inputStyle, minHeight: 100, resize: "vertical" }}
              />

              <label style={{ fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={form.track_paid_status}
                  onChange={(e) => updateField("track_paid_status", e.target.checked)}
                  style={{ marginRight: 10 }}
                />
                Track paid status on jobs
              </label>

              <div style={grid2}>
                <button type="submit" disabled={saving} style={buttonStyle}>
                  {saving
                    ? "Saving..."
                    : editingClientId
                    ? "Save Client Changes"
                    : "Save Client"}
                </button>

                {editingClientId ? (
                  <button
                    type="button"
                    onClick={deleteCurrentClient}
                    disabled={deletingClient}
                    style={dangerButtonStyle}
                  >
                    {deletingClient ? "Deleting..." : "Delete Client"}
                  </button>
                ) : (
                  <button type="button" onClick={resetClientForm} style={secondaryButtonStyle}>
                    Clear Form
                  </button>
                )}
              </div>

              {message ? <div style={{ fontWeight: 700 }}>{message}</div> : null}
            </form>
          </SectionCard>
        </>
      ) : (
        <>
          <div style={statsGrid}>
            <StatCard label="All Clients" value={String(clients.length)} />
            <StatCard
              label="Clients With Unpaid"
              value={String(clientsWithCounts.filter((c) => c.unpaid_tracked_count > 0).length)}
            />
          </div>

          {currentClient ? (
            <div style={selectedPanelStyle}>
              <div>
                <div style={selectedPanelLabelStyle}>Selected Client</div>
                <div style={selectedPanelTitleStyle}>{currentClient.name}</div>
                <div style={mutedTextCompact}>
                  {money(currentClient.hourly_rate)} | {cleanNumber(currentClient.mileage)} km | {currentClientJobCount} job(s)
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedClientId("");
                  setShowStatementMenu(false);
                  setShowInvoiceMenu(false);
                }}
                style={secondaryButtonStyle}
              >
                Clear
              </button>
            </div>
          ) : null}

          <SectionCard
            title="Selected Client Actions"
            subtitle={currentClient ? "Choose statement or invoice, then choose what to do with it." : "Select a client below to use actions."}
            isOpen={showClientActions}
            onToggle={() => setShowClientActions((v) => !v)}
          >
            {currentClient ? (
              <div style={compactFormStyle}>
                <select
                  value={statementType}
                  onChange={(e) => setStatementType(e.target.value)}
                  style={inputStyle}
                >
                  <option value="month">Selected Month</option>
                  <option value="mtd">MTD</option>
                  <option value="ytd">YTD</option>
                  <option value="year">Selected Year</option>
                </select>

                {statementType === "month" ? (
                  <select
                    value={statementMonth}
                    onChange={(e) => setStatementMonth(e.target.value)}
                    style={inputStyle}
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={String(i + 1)}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                ) : null}

                <input
                  type="number"
                  value={statementYear}
                  onChange={(e) => setStatementYear(e.target.value)}
                  style={inputStyle}
                />

                <ActionMenu
                  title="Statement"
                  subtitle="Preview, print, or email a client statement."
                  isOpen={showStatementMenu}
                  onToggle={() => {
                    setShowStatementMenu((v) => !v);
                    if (!showStatementMenu) setShowInvoiceMenu(false);
                  }}
                >
                  <div style={grid3}>
                    <button type="button" onClick={buildStatementPreview} style={buttonStyle}>
                      Preview
                    </button>
                    <button type="button" onClick={buildStatementPreview} style={secondaryButtonStyle}>
                      Print / PDF
                    </button>
                    <button type="button" onClick={handleEmailStatement} style={secondaryButtonStyle}>
                      Email
                    </button>
                  </div>
                </ActionMenu>

                <ActionMenu
                  title="Invoice"
                  subtitle="Preview, print, or email a monthly invoice."
                  isOpen={showInvoiceMenu}
                  onToggle={() => {
                    setShowInvoiceMenu((v) => !v);
                    if (!showInvoiceMenu) setShowStatementMenu(false);
                  }}
                >
                  <div style={grid3}>
                    <button type="button" onClick={buildMonthlyInvoicePreview} style={buttonStyle}>
                      Preview
                    </button>
                    <button type="button" onClick={buildMonthlyInvoicePreview} style={secondaryButtonStyle}>
                      Print / PDF
                    </button>
                    <button type="button" onClick={handleEmailMonthlyInvoice} style={secondaryButtonStyle}>
                      Email
                    </button>
                  </div>
                </ActionMenu>

                {docMessage ? <div style={{ fontWeight: 700 }}>{docMessage}</div> : null}
              </div>
            ) : (
              <div style={mutedText}>No client selected.</div>
            )}
          </SectionCard>

          <SectionCard
            title="Search and Filters"
            subtitle="Search clients and narrow the list."
            isOpen={showClientSearchSection}
            onToggle={() => setShowClientSearchSection((v) => !v)}
          >
            <div style={compactFormStyle}>
              <input
                placeholder="Search by name, phone, email, notes..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                style={inputStyle}
              />
              <select
                value={clientStatusFilter}
                onChange={(e) => setClientStatusFilter(e.target.value)}
                style={inputStyle}
              >
                <option value="all">All Clients</option>
                <option value="tracked_only">Paid Tracking Enabled</option>
                <option value="with_unpaid">With Unpaid Jobs</option>
                <option value="with_jobs">With Any Jobs</option>
              </select>
            </div>
          </SectionCard>

          <SectionCard
            title="Existing Clients"
            subtitle="Tap a card to select it. Use Edit to load it into the create tab."
            isOpen={showClientList}
            onToggle={() => setShowClientList((v) => !v)}
            countText={String(filteredClients.length)}
          >
            <div style={{ display: "grid", gap: 12 }}>
              {loading ? <div>Loading clients...</div> : null}
              {!loading && filteredClients.length === 0 ? <div>No clients found.</div> : null}

              {filteredClients.map((client) => {
                const isSelected = selectedClientId === client.id;

                return (
                  <div
                    key={client.id}
                    style={{
                      ...simpleCardStyle,
                      borderColor: isSelected ? "#1e1b18" : "#d0ccc4",
                      background: isSelected ? "#f6f1e8" : "#fff",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClientId(client.id);
                        setShowStatementMenu(false);
                        setShowInvoiceMenu(false);
                        setDocMessage(`Selected ${client.name}.`);
                      }}
                      style={simpleCardButtonStyle}
                    >
                      <div style={simpleCardMainRowStyle}>
                        <div style={simpleCardTitleStyle}>{client.name}</div>
                        <div style={simpleCardAmountStyle}>{money(client.hourly_rate)}</div>
                      </div>
                      <div style={simpleCardSubRowStyle}>
                        <span>{cleanNumber(client.mileage)} km</span>
                        <span>{client.frequency || "No frequency"}</span>
                      </div>
                      <div style={mutedTextCompact}>
                        Jobs: {client.job_count}
                        {client.track_paid_status ? ` | Unpaid: ${client.unpaid_tracked_count}` : ""}
                      </div>
                    </button>

                    {isSelected ? (
                      <div style={simpleCardActionsStyle}>
                        <button
                          type="button"
                          onClick={() => startEditClient(client)}
                          style={secondaryMiniButtonStyle}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClientId(client.id);
                            setShowStatementMenu(true);
                            setShowInvoiceMenu(false);
                            const range = getDateRange(statementType, statementMonth, statementYear);
                            const clientJobs = jobs.filter((job) => {
                              const d = new Date(job.job_date);
                              return job.client_id === client.id && d >= range.start && d <= range.end;
                            });
                            setMonthlyInvoicePreview(null);
                            setStatementPreview({
                              client,
                              jobs: clientJobs,
                              range,
                              totals: sumJobs(clientJobs),
                            });
                            setDocMessage("Statement print preview opened. Use Print / Save PDF at the top.");
                          }}
                          style={miniButtonStyle}
                        >
                          Statement
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClientId(client.id);
                            setShowInvoiceMenu(true);
                            setShowStatementMenu(false);
                            const range = getDateRange(statementType, statementMonth, statementYear);
                            const clientJobs = jobs.filter((job) => {
                              const d = new Date(job.job_date);
                              return job.client_id === client.id && d >= range.start && d <= range.end;
                            });
                            setStatementPreview(null);
                            setMonthlyInvoicePreview({
                              client,
                              jobs: clientJobs,
                              range,
                              totals: sumJobs(clientJobs),
                            });
                            setDocMessage("Monthly invoice print preview opened. Use Print / Save PDF at the top.");
                          }}
                          style={miniButtonStyle}
                        >
                          Invoice
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </>
      )}

      {statementPreview ? (
        <PrintPreviewOverlay
          title="Statement Print Preview"
          onClose={() => setStatementPreview(null)}
        >
          <ClientStatementDocument preview={statementPreview} settings={settings} />
        </PrintPreviewOverlay>
      ) : null}

      {monthlyInvoicePreview ? (
        <PrintPreviewOverlay
          title="Monthly Invoice Print Preview"
          onClose={() => setMonthlyInvoicePreview(null)}
        >
          <ClientMonthlyInvoiceDocument
            preview={monthlyInvoicePreview}
            settings={settings}
          />
        </PrintPreviewOverlay>
      ) : null}
    </div>
  );
}

function DeletedPage() {
  const [deletedJobs, setDeletedJobs] = useState([]);
  const [deletedClients, setDeletedClients] = useState([]);
  const [deletedMileage, setDeletedMileage] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringJobId, setRestoringJobId] = useState("");
  const [restoringClientId, setRestoringClientId] = useState("");
  const [restoringMileageId, setRestoringMileageId] = useState("");
  const [message, setMessage] = useState("");

  const clientMap = useMemo(() => {
    const map = {};
    clients.forEach((client) => {
      map[client.id] = client;
    });
    return map;
  }, [clients]);

  async function loadDeleted() {
    setLoading(true);
    setMessage("");

    try {
      const [deletedJobsRes, deletedClientsRes, deletedMileageRes, clientsRes] =
        await Promise.all([
          supabase
            .from("deleted_jobs")
            .select("*")
            .order("deleted_at", { ascending: false }),
          supabase
            .from("deleted_clients")
            .select("*")
            .order("deleted_at", { ascending: false }),
          supabase
            .from("deleted_daily_mileage")
            .select("*")
            .order("deleted_at", { ascending: false }),
          supabase.from("clients").select("*"),
        ]);

      if (deletedJobsRes.error) throw deletedJobsRes.error;
      if (deletedClientsRes.error) throw deletedClientsRes.error;
      if (deletedMileageRes.error) throw deletedMileageRes.error;
      if (clientsRes.error) throw clientsRes.error;

      setDeletedJobs(deletedJobsRes.data || []);
      setDeletedClients(deletedClientsRes.data || []);
      setDeletedMileage(deletedMileageRes.data || []);
      setClients(clientsRes.data || []);
    } catch (error) {
      setMessage(error.message);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadDeleted();
  }, []);

  async function restoreJob(job) {
    const liveClientExists = clients.some((client) => client.id === job.client_id);

    if (!liveClientExists) {
      setMessage(
        "This job cannot be restored yet because its client is not in the live clients list. Restore the client first, then restore the job."
      );
      return;
    }

    const ok = window.confirm("Restore this deleted job?");
    if (!ok) return;

    setRestoringJobId(job.id);
    setMessage("");

    const insertPayload = {
      client_id: job.client_id,
      job_date: job.job_date,
      hours: job.hours,
      hourly_rate: job.hourly_rate,
      service_amount: job.service_amount,
      supplies_amount: job.supplies_amount,
      supplies_notes: job.supplies_notes,
      gst_amount: job.gst_amount,
      total_value: job.total_value,
      mileage: job.mileage,
      notes: job.notes,
      hours_mode: job.hours_mode,
      pay_mode: job.pay_mode,
      mileage_mode: job.mileage_mode,
      is_paid: job.is_paid,
    };

    const restoreResult = await supabase.from("jobs").insert([insertPayload]);
    if (restoreResult.error) {
      setMessage(restoreResult.error.message);
      setRestoringJobId("");
      return;
    }

    const removeResult = await supabase.from("deleted_jobs").delete().eq("id", job.id);
    if (removeResult.error) {
      setMessage(removeResult.error.message);
      setRestoringJobId("");
      return;
    }

    setMessage("Job restored.");
    await loadDeleted();
    setRestoringJobId("");
  }

  async function restoreClientInternal(client, restoreAllJobsToo) {
    const targetId = client.original_client_id || client.id;
    const alreadyExists = clients.some((c) => c.id === targetId);

    if (alreadyExists) {
      setMessage(
        "A live client with that original id already exists. This deleted client cannot be restored again."
      );
      return;
    }

    const confirmText = restoreAllJobsToo
      ? "Restore this client using its original id and restore all deleted jobs for this client too?"
      : "Restore this deleted client using its original client id?";

    const ok = window.confirm(confirmText);
    if (!ok) return;

    setRestoringClientId(client.id);
    setMessage("");

    const targetJobs = deletedJobs.filter((job) => job.client_id === targetId);

    const insertClientPayload = {
      id: targetId,
      name: client.name,
      address: client.address,
      phone: client.phone,
      frequency: client.frequency,
      hourly_rate: client.hourly_rate,
      mileage: client.mileage,
      notes: client.notes,
      hours_mode: client.hours_mode,
      default_hours: client.default_hours,
      pay_mode: client.pay_mode,
      mileage_mode: client.mileage_mode,
      invoice_email: client.invoice_email,
      track_paid_status: client.track_paid_status,
    };

    const restoreClientResult = await supabase.from("clients").insert([insertClientPayload]);
    if (restoreClientResult.error) {
      setMessage(restoreClientResult.error.message);
      setRestoringClientId("");
      return;
    }

    if (restoreAllJobsToo) {
      for (const job of targetJobs) {
        const insertJobPayload = {
          client_id: targetId,
          job_date: job.job_date,
          hours: job.hours,
          hourly_rate: job.hourly_rate,
          service_amount: job.service_amount,
          supplies_amount: job.supplies_amount,
          supplies_notes: job.supplies_notes,
          gst_amount: job.gst_amount,
          total_value: job.total_value,
          mileage: job.mileage,
          notes: job.notes,
          hours_mode: job.hours_mode,
          pay_mode: job.pay_mode,
          mileage_mode: job.mileage_mode,
          is_paid: job.is_paid,
        };

        const restoreJobResult = await supabase.from("jobs").insert([insertJobPayload]);
        if (restoreJobResult.error) {
          setMessage(
            `Client restored, but a job could not be restored: ${restoreJobResult.error.message}`
          );
          setRestoringClientId("");
          await loadDeleted();
          return;
        }

        const removeDeletedJobResult = await supabase
          .from("deleted_jobs")
          .delete()
          .eq("id", job.id);

        if (removeDeletedJobResult.error) {
          setMessage(removeDeletedJobResult.error.message);
          setRestoringClientId("");
          await loadDeleted();
          return;
        }
      }
    }

    const removeDeletedClientResult = await supabase
      .from("deleted_clients")
      .delete()
      .eq("id", client.id);

    if (removeDeletedClientResult.error) {
      setMessage(removeDeletedClientResult.error.message);
      setRestoringClientId("");
      return;
    }

    setMessage(
      restoreAllJobsToo
        ? `Client restored with original id. ${targetJobs.length} deleted job(s) restored too.`
        : "Client restored with original id. Deleted jobs for this client can now be restored directly."
    );

    await loadDeleted();
    setRestoringClientId("");
  }

  function restoreClientOnly(client) {
    restoreClientInternal(client, false);
  }

  function restoreClientAndAllJobs(client) {
    restoreClientInternal(client, true);
  }

  async function restoreMileage(entry) {
    const ok = window.confirm("Restore this deleted mileage entry?");
    if (!ok) return;

    setRestoringMileageId(entry.id);
    setMessage("");

    const insertPayload = {
      mileage_date: entry.mileage_date,
      mileage: entry.mileage,
      vehicle: entry.vehicle,
      notes: entry.notes,
    };

    const restoreResult = await supabase.from("daily_mileage").insert([insertPayload]);
    if (restoreResult.error) {
      setMessage(restoreResult.error.message);
      setRestoringMileageId("");
      return;
    }

    const removeResult = await supabase
      .from("deleted_daily_mileage")
      .delete()
      .eq("id", entry.id);

    if (removeResult.error) {
      setMessage(removeResult.error.message);
      setRestoringMileageId("");
      return;
    }

    setMessage("Mileage entry restored.");
    await loadDeleted();
    setRestoringMileageId("");
  }

  return (
    <div style={{ paddingTop: 10 }}>
      <div style={cardStyle}>
        <div style={sectionTitle}>Deleted</div>

        {message ? <div style={{ marginBottom: 12, fontWeight: 700 }}>{message}</div> : null}
        {loading ? <div>Loading deleted items...</div> : null}

        <div style={{ display: "grid", gap: 12 }}>
          {deletedJobs.map((job) => {
            const client = clientMap[job.client_id];
            const canRestore = clients.some((c) => c.id === job.client_id);

            return (
              <div key={`job-${job.id}`} style={innerCardStyle}>
                <div style={{ fontWeight: 900 }}>Deleted Job</div>
                <div>{client?.name || "Unknown client"}</div>
                <div style={mutedText}>
                  {job.job_date ? formatDate(job.job_date) : "-"} | Total {money(job.total_value)}
                </div>
                {!canRestore ? (
                  <div style={{ ...mutedText, fontWeight: 700 }}>
                    Restore the client first.
                  </div>
                ) : null}
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => restoreJob(job)}
                    disabled={restoringJobId === job.id || !canRestore}
                    style={buttonStyle}
                  >
                    {restoringJobId === job.id ? "Restoring..." : "Restore Job"}
                  </button>
                </div>
              </div>
            );
          })}

          {deletedClients.map((client) => {
            const targetId = client.original_client_id || client.id;
            const deletedJobCount = deletedJobs.filter(
              (job) => job.client_id === targetId
            ).length;

            return (
              <div key={`client-${client.id}`} style={innerCardStyle}>
                <div style={{ fontWeight: 900 }}>Deleted Client</div>
                <div>{client.name || "Unnamed client"}</div>
                <div style={mutedText}>
                  Original id: {client.original_client_id || "-"} | Deleted jobs: {deletedJobCount}
                </div>
                <div style={{ ...grid2, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => restoreClientOnly(client)}
                    disabled={restoringClientId === client.id}
                    style={secondaryButtonStyle}
                  >
                    {restoringClientId === client.id ? "Restoring..." : "Restore Client Only"}
                  </button>

                  <button
                    type="button"
                    onClick={() => restoreClientAndAllJobs(client)}
                    disabled={restoringClientId === client.id}
                    style={buttonStyle}
                  >
                    {restoringClientId === client.id ? "Restoring..." : "Restore Client + All Jobs"}
                  </button>
                </div>
              </div>
            );
          })}

          {deletedMileage.map((entry) => (
            <div key={`mileage-${entry.id}`} style={innerCardStyle}>
              <div style={{ fontWeight: 900 }}>Deleted Mileage</div>
              <div>{entry.mileage_date || "-"}</div>
              <div style={mutedText}>{cleanNumber(entry.mileage)} km</div>
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => restoreMileage(entry)}
                  disabled={restoringMileageId === entry.id}
                  style={buttonStyle}
                >
                  {restoringMileageId === entry.id ? "Restoring..." : "Restore Mileage"}
                </button>
              </div>
            </div>
          ))}

          {!loading &&
          deletedJobs.length === 0 &&
          deletedClients.length === 0 &&
          deletedMileage.length === 0 ? (
            <div>No deleted items.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InvoiceDocument({ job, settings }) {
  const clientName = job.clients?.name || "Client";
  const invoiceNumber = `INV-${String(job.id).slice(0, 8).toUpperCase()}`;

  return (
    <div style={documentPaperStyle}>
      <DocumentHeader
        title="INVOICE"
        documentNumber={invoiceNumber}
        dateLabel={`Date: ${formatDate(job.job_date)}`}
        settings={settings}
      />

      <div style={documentSection}>
        <div style={documentSectionTitle}>Bill To</div>
        <div>{clientName}</div>
        <div style={mutedText}>{job.clients?.address || ""}</div>
        <div style={mutedText}>{job.clients?.phone || ""}</div>
        <div style={mutedText}>{job.clients?.invoice_email || ""}</div>
      </div>

      <div style={documentSection}>
        <div style={documentSectionTitle}>Service Details</div>
        <div>Service date: {formatDate(job.job_date)}</div>
        <div style={mutedText}>Notes: {job.notes || "-"}</div>
        <div style={mutedText}>
          Hours: {job.hours == null ? "-" : cleanNumber(job.hours)}
        </div>
      </div>

      <DocumentAmountTable
        rows={[
          ["Service", job.service_amount],
          [
            job.supplies_notes
              ? `Supplies (${job.supplies_notes})`
              : "Supplies",
            job.supplies_amount,
          ],
          ["GST", job.gst_amount],
          ["Total", job.total_value, true],
        ]}
      />

      <DocumentFooter settings={settings} />
    </div>
  );
}

function ClientStatementDocument({ preview, settings }) {
  const { client, jobs, range, totals } = preview;
  const statementNumber = `STMT-${String(client.id).slice(0, 8).toUpperCase()}`;

  return (
    <div style={documentPaperStyle}>
      <DocumentHeader
        title="STATEMENT"
        documentNumber={statementNumber}
        dateLabel={`Period: ${formatDate(range.start)} to ${formatDate(range.end)}`}
        settings={settings}
      />

      <div style={documentSection}>
        <div style={documentSectionTitle}>Client</div>
        <div>{client.name}</div>
        <div style={mutedText}>{client.address || ""}</div>
        <div style={mutedText}>{client.phone || ""}</div>
        <div style={mutedText}>{client.invoice_email || ""}</div>
      </div>

      <div style={documentSection}>
        <div style={documentSectionTitle}>Summary</div>
        <div style={previewGrid}>
          <PreviewBox label="Service" value={money(totals.service)} />
          <PreviewBox label="Supplies" value={money(totals.supplies)} />
          <PreviewBox label="GST" value={money(totals.gst)} />
          <PreviewBox label="Total" value={money(totals.total)} />
          <PreviewBox label="Hours" value={cleanNumber(totals.hours)} />
        </div>
      </div>

      <div style={documentSection}>
        <div style={documentSectionTitle}>Jobs Included</div>

        {jobs.length === 0 ? (
          <div>No jobs found for this client and period.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {jobs.map((job) => (
              <div key={job.id} style={innerCardStyle}>
                <div style={{ fontWeight: 900 }}>{formatDate(job.job_date)}</div>
                <div style={mutedText}>
                  Service: {money(job.service_amount)} | Supplies:{" "}
                  {money(job.supplies_amount)} | GST: {money(job.gst_amount)} | Total:{" "}
                  {money(job.total_value)}
                </div>
                <div style={mutedText}>
                  Hours: {job.hours == null ? "-" : cleanNumber(job.hours)}
                </div>
                <div style={mutedText}>{job.notes || ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DocumentFooter settings={settings} />
    </div>
  );
}

function ClientMonthlyInvoiceDocument({ preview, settings }) {
  const { client, jobs, range, totals } = preview;
  const invoiceNumber = `MINV-${String(client.id).slice(0, 8).toUpperCase()}-${range.label
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9-]/g, "")}`;

  return (
    <div style={documentPaperStyle}>
      <DocumentHeader
        title="MONTHLY INVOICE"
        documentNumber={invoiceNumber}
        dateLabel={`Period: ${formatDate(range.start)} to ${formatDate(range.end)}`}
        settings={settings}
      />

      <div style={documentSection}>
        <div style={documentSectionTitle}>Bill To</div>
        <div>{client.name}</div>
        <div style={mutedText}>{client.address || ""}</div>
        <div style={mutedText}>{client.phone || ""}</div>
        <div style={mutedText}>{client.invoice_email || ""}</div>
      </div>

      <div style={documentSection}>
        <div style={documentSectionTitle}>Invoice Summary</div>
        <div style={previewGrid}>
          <PreviewBox label="Service" value={money(totals.service)} />
          <PreviewBox label="Supplies" value={money(totals.supplies)} />
          <PreviewBox label="GST" value={money(totals.gst)} />
          <PreviewBox label="Total" value={money(totals.total)} />
          <PreviewBox label="Hours" value={cleanNumber(totals.hours)} />
        </div>
      </div>

      <div style={documentSection}>
        <div style={documentSectionTitle}>Included Service Dates</div>

        {jobs.length === 0 ? (
          <div>No jobs found for this client and period.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {jobs.map((job) => (
              <div key={job.id} style={innerCardStyle}>
                <div style={{ fontWeight: 900 }}>{formatDate(job.job_date)}</div>
                <div style={mutedText}>
                  Service: {money(job.service_amount)} | Supplies:{" "}
                  {money(job.supplies_amount)} | GST: {money(job.gst_amount)} | Total:{" "}
                  {money(job.total_value)}
                </div>
                <div style={mutedText}>
                  Hours: {job.hours == null ? "-" : cleanNumber(job.hours)}
                </div>
                <div style={mutedText}>{job.notes || ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DocumentAmountTable
        rows={[
          ["Service", totals.service],
          ["Supplies", totals.supplies],
          ["GST", totals.gst],
          ["Total Due", totals.total, true],
        ]}
      />

      <DocumentFooter settings={settings} />
    </div>
  );
}

function ReportDocument({ preview, settings }) {
  const { scopeLabel, range, totals, dailyMileageTotal, rankings } = preview;
  const reportNumber = `RPT-${range.label.replace(/\s+/g, "").replace(/[^A-Za-z0-9-]/g, "")}`;

  return (
    <div style={documentPaperStyle}>
      <DocumentHeader
        title="REPORT"
        documentNumber={reportNumber}
        dateLabel={`Period: ${formatDate(range.start)} to ${formatDate(range.end)}`}
        settings={settings}
      />

      <div style={documentSection}>
        <div style={documentSectionTitle}>Scope</div>
        <div>{scopeLabel}</div>
      </div>

      <div style={documentSection}>
        <div style={documentSectionTitle}>Summary</div>
        <div style={previewGrid}>
          <PreviewBox label="Service" value={money(totals.service)} />
          <PreviewBox label="Supplies" value={money(totals.supplies)} />
          <PreviewBox label="GST" value={money(totals.gst)} />
          <PreviewBox label="Total" value={money(totals.total)} />
          <PreviewBox label="Hours" value={cleanNumber(totals.hours)} />
          <PreviewBox label="Combined KM" value={cleanNumber(totals.mileage + dailyMileageTotal)} />
        </div>
      </div>

      <div style={documentSection}>
        <div style={documentSectionTitle}>Mileage Breakdown</div>
        <div style={mutedText}>Job mileage: {cleanNumber(totals.mileage)} km</div>
        <div style={mutedText}>Daily mileage: {cleanNumber(dailyMileageTotal)} km</div>
      </div>

      <div style={documentSection}>
        <div style={documentSectionTitle}>Customer Rankings</div>
        {rankings.length === 0 ? (
          <div>No jobs in this report range.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {rankings.map((row, idx) => (
              <div key={idx} style={innerCardStyle}>
                <div style={{ fontWeight: 900 }}>{row.clientName}</div>
                <div style={mutedText}>
                  Service: {money(row.service)} | Hours: {cleanNumber(row.hours)} | Jobs: {row.jobs}
                </div>
                <div style={mutedText}>
                  $ / Hour: {money(row.valuePerHour)} | $ / Job: {money(row.valuePerJob)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DocumentFooter settings={settings} />
    </div>
  );
}

function DocumentHeader({ title, documentNumber, dateLabel, settings }) {
  return (
    <div style={documentHeaderRow}>
      <div>
        <div style={documentBusinessNameStyle}>
          {settings.business_name || "Your Business Name"}
        </div>
        <div style={mutedText}>{settings.business_phone || ""}</div>
        <div style={mutedText}>{settings.business_email || ""}</div>
        <div style={mutedText}>
          {settings.tax_number ? `Tax #: ${settings.tax_number}` : ""}
        </div>
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={documentTitleStyle}>{title}</div>
        <div style={mutedText}>#{documentNumber}</div>
        <div style={mutedText}>{dateLabel}</div>
      </div>
    </div>
  );
}

function DocumentAmountTable({ rows }) {
  return (
    <div style={documentTableStyle}>
      <div style={documentTableHeaderStyle}>Item</div>
      <div style={documentTableHeaderStyle}>Amount</div>

      {rows.map(([label, amount, strong], idx) => (
        <div key={idx} style={{ display: "contents" }}>
          <div style={{ ...documentTableCellStyle, fontWeight: strong ? 900 : 400 }}>
            {label}
          </div>
          <div style={{ ...documentTableCellRightStyle, fontWeight: strong ? 900 : 400 }}>
            {money(amount)}
          </div>
        </div>
      ))}
    </div>
  );
}

function DocumentFooter({ settings }) {
  return (
    <div style={documentFooterStyle}>
      <div style={mutedText}>
        {settings.business_notes || "Thank you for your business."}
      </div>
    </div>
  );
}

function PreviewBox({ label, value }) {
  return (
    <div style={previewCard}>
      <div style={previewLabel}>{label}</div>
      <div style={previewValue}>{value}</div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={statCardStyle}>
      <div style={statLabelStyle}>{label}</div>
      <div style={statValueStyle}>{value}</div>
    </div>
  );
}

function OfficePage() {
  const [officeTab, setOfficeTab] = useState("reports");
  const [adminTab, setAdminTab] = useState("settings");

  return (
    <div style={{ padding: 24 }}>
      <h1 style={pageTitle}>Office</h1>

      <SubTabs
        value={officeTab}
        onChange={setOfficeTab}
        tabs={[
          { value: "reports", label: "Reports" },
          { value: "admin", label: "Admin" },
        ]}
      />

      {officeTab === "reports" ? <ReportsPage /> : null}

      {officeTab === "admin" ? (
        <div>
          <SubTabs
            value={adminTab}
            onChange={setAdminTab}
            tabs={[
              { value: "settings", label: "Settings" },
              { value: "deleted", label: "Deleted" },
            ]}
          />
          {adminTab === "settings" ? <SettingsPage /> : null}
          {adminTab === "deleted" ? <DeletedPage /> : null}
        </div>
      ) : null}
    </div>
  );
}

const pageTitle = {
  fontSize: 32,
  marginBottom: 12,
};

const sectionTitle = {
  fontSize: 24,
  fontWeight: 900,
  marginBottom: 12,
};

const itemTitle = {
  fontSize: 28,
  fontWeight: 900,
};

const mutedText = {
  color: "#6c6760",
  marginTop: 6,
};

const mutedTextCompact = {
  color: "#6c6760",
  marginTop: 4,
  fontSize: 15,
};

const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 12,
  border: "2px solid #d0ccc4",
  fontSize: 18,
  boxSizing: "border-box",
};

const buttonStyle = {
  padding: "14px 18px",
  borderRadius: 12,
  border: "2px solid #1e1b18",
  background: "#1e1b18",
  color: "#fff",
  fontWeight: 800,
  fontSize: 18,
};

const secondaryButtonStyle = {
  padding: "14px 18px",
  borderRadius: 12,
  border: "2px solid #1e1b18",
  background: "#fff",
  color: "#1e1b18",
  fontWeight: 800,
  fontSize: 18,
};

const dangerButtonStyle = {
  padding: "14px 18px",
  borderRadius: 12,
  border: "2px solid #8b1e1e",
  background: "#8b1e1e",
  color: "#fff",
  fontWeight: 800,
  fontSize: 18,
};

const miniButtonStyle = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "2px solid #1e1b18",
  background: "#1e1b18",
  color: "#fff",
  fontWeight: 800,
  fontSize: 15,
};

const secondaryMiniButtonStyle = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "2px solid #1e1b18",
  background: "#fff",
  color: "#1e1b18",
  fontWeight: 800,
  fontSize: 15,
};

const cardStyle = {
  background: "#fff",
  border: "2px solid #d0ccc4",
  borderRadius: 18,
  padding: 18,
  marginBottom: 20,
};

const formCardStyle = {
  background: "#fff",
  border: "2px solid #d0ccc4",
  borderRadius: 18,
  padding: 20,
  marginBottom: 20,
  display: "grid",
  gap: 12,
};

const sectionCardStyle = {
  background: "#fff",
  border: "2px solid #d0ccc4",
  borderRadius: 18,
  padding: 16,
  marginBottom: 18,
};

const sectionHeaderButtonStyle = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "pointer",
};

const sectionChevronStyle = {
  width: 36,
  height: 36,
  borderRadius: 999,
  border: "2px solid #d0ccc4",
  display: "grid",
  placeItems: "center",
  fontSize: 22,
  fontWeight: 900,
  color: "#1e1b18",
};

const pillStyle = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "#f4f0e8",
  border: "2px solid #d0ccc4",
  fontWeight: 800,
  fontSize: 14,
};

const compactFormStyle = {
  display: "grid",
  gap: 12,
};

const innerCardStyle = {
  background: "#f8f5ef",
  border: "2px solid #d0ccc4",
  borderRadius: 14,
  padding: 14,
};

const menuWrapStyle = {
  border: "2px solid #d0ccc4",
  borderRadius: 16,
  overflow: "hidden",
  background: "#fcfaf6",
};

const menuMainButtonStyle = {
  width: "100%",
  border: "none",
  background: "transparent",
  padding: 16,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  cursor: "pointer",
  textAlign: "left",
};

const menuTitleStyle = {
  fontSize: 22,
  fontWeight: 900,
};

const menuChevronStyle = {
  width: 36,
  height: 36,
  borderRadius: 999,
  border: "2px solid #d0ccc4",
  display: "grid",
  placeItems: "center",
  fontSize: 22,
  fontWeight: 900,
};

const menuBodyStyle = {
  borderTop: "2px solid #d0ccc4",
  padding: 14,
};

const modeTabsWrapStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginBottom: 18,
};

const modeTabStyle = {
  padding: "14px 18px",
  borderRadius: 14,
  border: "2px solid #d0ccc4",
  background: "#fff",
  color: "#1e1b18",
  fontWeight: 800,
  fontSize: 18,
};

const modeTabActiveStyle = {
  padding: "14px 18px",
  borderRadius: 14,
  border: "2px solid #1e1b18",
  background: "#1e1b18",
  color: "#fff",
  fontWeight: 800,
  fontSize: 18,
};

const subTabsWrapStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 10,
  marginBottom: 18,
};

const subTabStyle = {
  padding: "12px 16px",
  borderRadius: 14,
  border: "2px solid #d0ccc4",
  background: "#fff",
  color: "#1e1b18",
  fontWeight: 800,
  fontSize: 16,
};

const subTabActiveStyle = {
  padding: "12px 16px",
  borderRadius: 14,
  border: "2px solid #1e1b18",
  background: "#1e1b18",
  color: "#fff",
  fontWeight: 800,
  fontSize: 16,
};

const simpleCardStyle = {
  border: "2px solid #d0ccc4",
  borderRadius: 16,
  overflow: "hidden",
};

const simpleCardButtonStyle = {
  width: "100%",
  border: "none",
  background: "transparent",
  padding: 14,
  textAlign: "left",
  cursor: "pointer",
};

const simpleCardMainRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const simpleCardSubRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  color: "#6c6760",
  marginTop: 8,
  fontSize: 15,
};

const simpleCardTitleStyle = {
  fontSize: 22,
  fontWeight: 900,
};

const simpleCardAmountStyle = {
  fontSize: 18,
  fontWeight: 900,
};

const simpleCardActionsStyle = {
  borderTop: "2px solid #d0ccc4",
  padding: 12,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const selectedPanelStyle = {
  background: "#f6f1e8",
  border: "2px solid #1e1b18",
  borderRadius: 18,
  padding: 16,
  marginBottom: 18,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const selectedPanelLabelStyle = {
  fontSize: 13,
  fontWeight: 800,
  color: "#6c6760",
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const selectedPanelTitleStyle = {
  fontSize: 24,
  fontWeight: 900,
  marginTop: 4,
};

const grid2 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const grid3 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 12,
};

const previewGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 12,
};

const previewCard = {
  background: "#f7f4ee",
  border: "2px solid #d0ccc4",
  borderRadius: 14,
  padding: 14,
};

const previewLabel = {
  fontSize: 14,
  color: "#6c6760",
  fontWeight: 800,
  marginBottom: 8,
};

const previewValue = {
  fontSize: 22,
  fontWeight: 900,
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
  marginBottom: 20,
};

const statCardStyle = {
  background: "#fff",
  border: "2px solid #d0ccc4",
  borderRadius: 18,
  padding: 18,
};

const statLabelStyle = {
  fontSize: 18,
  color: "#6c6760",
  fontWeight: 800,
  marginBottom: 12,
};

const statValueStyle = {
  fontSize: 32,
  fontWeight: 900,
};

const betweenRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  marginBottom: 16,
};

const documentPaperStyle = {
  background: "#fffdf9",
  border: "2px solid #d0ccc4",
  borderRadius: 16,
  padding: 20,
};

const documentHeaderRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  marginBottom: 20,
};

const documentBusinessNameStyle = {
  fontSize: 28,
  fontWeight: 900,
  marginBottom: 8,
};

const documentTitleStyle = {
  fontSize: 30,
  fontWeight: 900,
  marginBottom: 8,
};

const documentSection = {
  marginBottom: 20,
};

const documentSectionTitle = {
  fontSize: 18,
  fontWeight: 900,
  marginBottom: 8,
};

const documentTableStyle = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 10,
  borderTop: "2px solid #d0ccc4",
  paddingTop: 14,
};

const documentTableHeaderStyle = {
  fontWeight: 900,
  paddingBottom: 6,
};

const documentTableCellStyle = {
  padding: "4px 0",
};

const documentTableCellRightStyle = {
  padding: "4px 0",
  textAlign: "right",
};

const documentFooterStyle = {
  marginTop: 20,
  paddingTop: 14,
  borderTop: "2px solid #d0ccc4",
};

const printOverlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "#f4f0e8",
  overflow: "auto",
  padding: 18,
};

const printToolbarStyle = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "14px 16px",
  background: "#f4f0e8",
  border: "2px solid #d0ccc4",
  borderRadius: 16,
  marginBottom: 16,
};

const printPaperWrapStyle = {
  maxWidth: 980,
  margin: "0 auto",
};

function Layout() {
  const navStyle = ({ isActive }) => ({
    padding: "14px 18px",
    borderRadius: 14,
    textDecoration: "none",
    fontWeight: 700,
    color: isActive ? "#fff" : "#1e1b18",
    background: isActive ? "#1e1b18" : "#fff",
    border: "2px solid #d0ccc4",
    textAlign: "center",
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f0e8",
        color: "#1e1b18",
        paddingBottom: 110,
      }}
    >
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 42, margin: 0, fontWeight: 900 }}>
          Cleaning Tracker
        </h1>
        <p style={{ fontSize: 22, color: "#6c6760", marginTop: 10 }}>
          New shared app version.
        </p>
      </div>

      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/mileage" element={<MileagePage />} />
        <Route path="/office" element={<OfficePage />} />
      </Routes>

      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 8,
          padding: 12,
          background: "#f4f0e8",
          borderTop: "2px solid #d0ccc4",
        }}
      >
        <NavLink to="/" style={navStyle}>Home</NavLink>
        <NavLink to="/jobs" style={navStyle}>Jobs</NavLink>
        <NavLink to="/clients" style={navStyle}>Clients</NavLink>
        <NavLink to="/mileage" style={navStyle}>Mileage</NavLink>
        <NavLink to="/office" style={navStyle}>Office</NavLink>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}