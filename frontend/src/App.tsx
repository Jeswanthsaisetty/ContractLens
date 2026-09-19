import { useEffect, useMemo, useState } from "react";
import axios from "axios";

import {
  AlertTriangle,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  GitCompare,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Upload,
  XCircle,
} from "lucide-react";

import "./App.css";

const API = "http://127.0.0.1:8000/api";

/* ============================================================
   TYPES
   ============================================================ */

type Party =
  | string
  | {
    name?: string | null;
    role?: string | null;
    [key: string]: any;
  };

type HumanReviewFlag =
  | string
  | {
    issue?: string | null;
    reason?: string | null;
    source_section?: string | null;
    [key: string]: any;
  };

type Obligation = {
  id: number;
  contract_id?: string;
  title?: string | null;
  description?: string | null;
  responsible_party?: string | null;
  due_date?: string | null;
  source_section?: string | null;
  status?: string | null;
};

type Reminder = {
  id: number;
  contract_id?: string;
  title?: string | null;
  description?: string | null;
  reminder_date?: string | null;
  status?: string | null;
};

type ContractSummary = {
  contract_id: string;
  filename?: string | null;
  title?: string | null;
  parties?: Party[];
  effective_date?: string | null;
  expiration_date?: string | null;
  obligation_count?: number;
  pending_obligations?: number;
  completed_obligations?: number;
  overdue_obligations?: number;
  created_at?: string | null;
};

type ContractData = {
  contract_id: string;
  filename?: string | null;
  title?: string | null;
  parties?: Party[];
  effective_date?: string | null;
  expiration_date?: string | null;
  renewal?: Record<string, any>;
  payment_terms?: Record<string, any>;
  termination?: Record<string, any>;
  important_clauses?: any[];
  human_review_flags?: HumanReviewFlag[];
};

type ContractVersion = {
  id?: number;
  version?: number;
  version_number?: number;
  filename?: string;
  file_name?: string;
  created_at?: string;
  uploaded_at?: string;
  [key: string]: any;
};

type ComparisonChange = {
  type?: string;
  change_type?: string;
  section?: string;
  source_section?: string;
  old_text?: string | null;
  new_text?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  [key: string]: any;
};

type ComparisonResult = {
  contract_id?: string;
  old_version?: number;
  new_version?: number;

  comparison?: {
    total_changes?: number;
    changes?: ComparisonChange[];
  };
};

type DashboardData = {
  contract: ContractData;

  statistics: {
    total_obligations: number;
    pending_obligations: number;
    completed_obligations: number;
    overdue_obligations: number;
    total_reminders: number;
    pending_reminders: number;
    contract_versions: number;
  };

  obligations: Obligation[];
  reminders: Reminder[];
  versions: ContractVersion[];
};

type AssistantToolResult = {
  tool?: string;
  arguments?: Record<string, any>;
  result?: any;
};

type AssistantResponse = {
  status?: string;
  contract_id?: string;
  question?: string;
  answer?: string | null;
  tools_used?: string[];
  tool_count?: number;
  tool_results?: AssistantToolResult[];
  confidence?: string;
};

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  toolResults?: AssistantToolResult[];
  confidence?: string;
};

/* ============================================================
   HELPERS
   ============================================================ */

function safeText(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getPartyName(party: Party): string {
  if (typeof party === "string") {
    return party;
  }

  return party?.name || "Unknown party";
}

function getPartyRole(party: Party): string {
  if (typeof party === "string") {
    return "";
  }

  return party?.role || "";
}

function getReviewIssue(flag: HumanReviewFlag): string {
  if (typeof flag === "string") {
    return flag;
  }

  return (
    flag?.issue ||
    flag?.reason ||
    "Human review required"
  );
}

function getReviewSource(
  flag: HumanReviewFlag
): string {
  if (typeof flag === "string") {
    return "";
  }

  return flag?.source_section || "";
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "—";
  }

  return value;
}

function getErrorMessage(error: any): string {
  return (
    error?.response?.data?.detail ||
    error?.response?.data?.message ||
    error?.message ||
    "Something went wrong."
  );
}

/* ============================================================
   APP
   ============================================================ */

function App() {
  /* ============================================================
     AI ASSISTANT
     ============================================================ */

  const askAssistant = async (questionOverride?: string) => {
    const question = (questionOverride ?? assistantInput).trim();

    if (!selectedContractId) {
      setError("Please select a contract before using the AI Assistant.");
      return;
    }

    if (!question || assistantLoading) {
      return;
    }

    const userMessage: AssistantMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: question,
    };

    setAssistantMessages((current) => [
      ...current,
      userMessage,
    ]);

    setAssistantInput("");
    setAssistantLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await axios.post<AssistantResponse>(
        `${API}/agent/${encodeURIComponent(selectedContractId)}/ask`,
        { question }
      );

      const data = response.data || {};

      const assistantMessage: AssistantMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content:
          data.answer ||
          "The agent completed the request but did not return a final answer.",
        toolsUsed: data.tools_used || [],
        toolResults: data.tool_results || [],
        confidence: data.confidence,
      };

      setAssistantMessages((current) => [
        ...current,
        assistantMessage,
      ]);

      // Refresh contract data after agent actions such as
      // updating an obligation or creating a reminder.
      await loadDashboard();
      await loadContracts(false);
    } catch (err) {
      console.error(err);

      setError(
        getErrorMessage(err) ||
        "Unable to get a response from the AI Assistant."
      );
    } finally {
      setAssistantLoading(false);
    }
  };

  const clearAssistantChat = () => {
    setAssistantMessages([]);
    setAssistantInput("");
    setError("");
    setMessage("");
  };

  const getToolResultPreview = (result: any): string => {
    if (result === null || result === undefined) {
      return "No result returned.";
    }

    if (typeof result === "string") {
      return result;
    }

    if (Array.isArray(result)) {
      return `${result.length} item${result.length === 1 ? "" : "s"} returned.`;
    }

    if (typeof result === "object") {
      if (result.matches && Array.isArray(result.matches)) {
        return `${result.matches.length} contract evidence match${result.matches.length === 1 ? "" : "es"} found.`;
      }

      if (result.success === true) {
        return "Action completed successfully.";
      }

      if (result.error) {
        return String(result.error);
      }

      return Object.entries(result)
        .slice(0, 4)
        .map(([key, value]) => `${key}: ${safeText(value)}`)
        .join(" • ");
    }

    return safeText(result);
  };

  /* ============================================================
     NAVIGATION
     ============================================================ */

  const [page, setPage] = useState<
    | "dashboard"
    | "contracts"
    | "obligations"
    | "reminders"
    | "compare"
    | "assistant"
  >("dashboard");

  /* ============================================================
     CONTRACTS
     ============================================================ */

  const [contracts, setContracts] = useState<
    ContractSummary[]
  >([]);

  const [selectedContractId, setSelectedContractId] =
    useState("");

  const [dashboard, setDashboard] =
    useState<DashboardData | null>(null);

  const [loadingContracts, setLoadingContracts] =
    useState(false);

  const [loadingDashboard, setLoadingDashboard] =
    useState(false);

  /* ============================================================
     GLOBAL UI
     ============================================================ */

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  /* ============================================================
     UPLOAD
     ============================================================ */

  const [contractFile, setContractFile] =
    useState<File | null>(null);

  const [uploadingContract, setUploadingContract] =
    useState(false);

  /* ============================================================
     OBLIGATIONS
     ============================================================ */

  const [updatingObligationId, setUpdatingObligationId] =
    useState<number | null>(null);

  /* ============================================================
     REMINDERS
     ============================================================ */

  const [showReminderForm, setShowReminderForm] =
    useState(false);

  const [reminderTitle, setReminderTitle] =
    useState("");

  const [reminderDescription, setReminderDescription] =
    useState("");

  const [reminderDate, setReminderDate] =
    useState("");

  const [creatingReminder, setCreatingReminder] =
    useState(false);

  const [updatingReminderId, setUpdatingReminderId] =
    useState<number | null>(null);

  /* ============================================================
     VERSION COMPARISON
     ============================================================ */

  const [versions, setVersions] =
    useState<ContractVersion[]>([]);

  const [comparison, setComparison] =
    useState<ComparisonResult | null>(null);

  const [loadingVersions, setLoadingVersions] =
    useState(false);

  const [comparingVersions, setComparingVersions] =
    useState(false);

  const [uploadingVersion, setUploadingVersion] =
    useState(false);

  const [versionFile, setVersionFile] =
    useState<File | null>(null);

  /* ============================================================
     AI ASSISTANT
     ============================================================ */

  const [assistantMessages, setAssistantMessages] =
    useState<AssistantMessage[]>([]);

  const [assistantInput, setAssistantInput] =
    useState("");

  const [assistantLoading, setAssistantLoading] =
    useState(false);

  /* ============================================================
     INITIAL LOAD
     ============================================================ */

  useEffect(() => {
    loadContracts();
  }, []);

  useEffect(() => {
    if (selectedContractId) {
      loadDashboard(selectedContractId);
      loadVersions(selectedContractId);
    }
  }, [selectedContractId]);

  /* ============================================================
     LOAD CONTRACTS
     ============================================================ */

  const loadContracts = async (
    selectFirst = true
  ) => {
    try {
      setLoadingContracts(true);
      setError("");

      const response = await axios.get(
        `${API}/contracts/`
      );

      const data = response.data;

      const items: ContractSummary[] =
        Array.isArray(data)
          ? data
          : data?.contracts || [];

      setContracts(items);

      if (
        selectFirst &&
        !selectedContractId &&
        items.length > 0
      ) {
        setSelectedContractId(
          items[0].contract_id
        );
      }
    } catch (err) {
      console.error(err);
      setError(
        getErrorMessage(err) ||
        "Unable to load contracts."
      );
    } finally {
      setLoadingContracts(false);
    }
  };

  /* ============================================================
     LOAD DASHBOARD
     ============================================================ */

  const loadDashboard = async (
    contractId = selectedContractId
  ) => {
    if (!contractId) {
      return;
    }

    try {
      setLoadingDashboard(true);

      const response = await axios.get(
        `${API}/contracts/${encodeURIComponent(
          contractId
        )}/dashboard`
      );

      setDashboard(response.data);
    } catch (err) {
      console.error(err);
      setError(
        getErrorMessage(err) ||
        "Unable to load contract dashboard."
      );
    } finally {
      setLoadingDashboard(false);
    }
  };

  /* ============================================================
     CONTRACT SELECTION
     ============================================================ */

  const handleContractChange = (
    contractId: string
  ) => {
    setSelectedContractId(contractId);

    setDashboard(null);
    setVersions([]);
    setComparison(null);

    setError("");
    setMessage("");

    setPage("dashboard");
  };

  /* ============================================================
     UPLOAD + ANALYZE CONTRACT
     ============================================================ */

  const uploadAndAnalyzeContract = async () => {
    if (!contractFile) {
      setError(
        "Please select a PDF contract first."
      );
      return;
    }

    if (
      !contractFile.name
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      setError(
        "Only PDF contracts are supported."
      );
      return;
    }

    try {
      setUploadingContract(true);
      setError("");
      setMessage("");

      const formData = new FormData();

      formData.append(
        "file",
        contractFile
      );

      const uploadResponse =
        await axios.post(
          `${API}/contracts/upload`,
          formData,
          {
            headers: {
              "Content-Type":
                "multipart/form-data",
            },
          }
        );

      const uploadedId =
        uploadResponse.data?.contract_id ||
        uploadResponse.data?.contract?.contract_id;

      if (!uploadedId) {
        throw new Error(
          "Upload succeeded but no contract ID was returned."
        );
      }

      await axios.post(
        `${API}/contracts/${encodeURIComponent(
          uploadedId
        )}/analyze`
      );

      setContractFile(null);

      setMessage(
        "Contract uploaded and analyzed successfully."
      );

      await loadContracts(false);

      setSelectedContractId(
        String(uploadedId)
      );

      await loadDashboard(
        String(uploadedId)
      );

      await loadVersions(
        String(uploadedId)
      );

      setPage("dashboard");
    } catch (err) {
      console.error(err);

      setError(
        getErrorMessage(err) ||
        "Unable to upload and analyze contract."
      );
    } finally {
      setUploadingContract(false);
    }
  };

  /* ============================================================
     UPDATE OBLIGATION STATUS
     ============================================================ */

  const updateObligationStatus = async (
    obligationId: number,
    status: string
  ) => {
    try {
      setUpdatingObligationId(
        obligationId
      );

      setError("");
      setMessage("");

      await axios.patch(
        `${API}/obligations/${obligationId}/status`,
        {
          status,
        }
      );

      setMessage(
        "Obligation status updated."
      );

      await loadDashboard();
      await loadContracts(false);
    } catch (err) {
      console.error(err);

      setError(
        getErrorMessage(err) ||
        "Unable to update obligation status."
      );
    } finally {
      setUpdatingObligationId(null);
    }
  };

  /* ============================================================
     CREATE REMINDER
     ============================================================ */

  const createReminder = async () => {
    if (!selectedContractId) {
      setError(
        "Please select a contract first."
      );
      return;
    }

    if (!reminderTitle.trim()) {
      setError(
        "Please enter a reminder title."
      );
      return;
    }

    if (!reminderDate) {
      setError(
        "Please select a reminder date."
      );
      return;
    }

    try {
      setCreatingReminder(true);

      setError("");
      setMessage("");

      await axios.post(
        `${API}/reminders/`,
        {
          contract_id:
            selectedContractId,

          title:
            reminderTitle.trim(),

          description:
            reminderDescription.trim(),

          reminder_date:
            reminderDate,
        }
      );

      setReminderTitle("");
      setReminderDescription("");
      setReminderDate("");

      setShowReminderForm(false);

      setMessage(
        "Reminder created successfully."
      );

      await loadDashboard();
    } catch (err) {
      console.error(err);

      setError(
        getErrorMessage(err) ||
        "Unable to create reminder."
      );
    } finally {
      setCreatingReminder(false);
    }
  };

  /* ============================================================
     UPDATE REMINDER STATUS
     ============================================================ */

  const updateReminderStatus = async (
    reminderId: number,
    status: string
  ) => {
    try {
      setUpdatingReminderId(
        reminderId
      );

      setError("");
      setMessage("");

      await axios.patch(
        `${API}/reminders/${reminderId}/status`,
        {
          status,
        }
      );

      setMessage(
        "Reminder status updated."
      );

      await loadDashboard();
    } catch (err) {
      console.error(err);

      setError(
        getErrorMessage(err) ||
        "Unable to update reminder status."
      );
    } finally {
      setUpdatingReminderId(null);
    }
  };

  /* ============================================================
     LOAD VERSIONS
     ============================================================ */

  const loadVersions = async (
    contractId = selectedContractId
  ) => {
    if (!contractId) {
      setVersions([]);
      return;
    }

    try {
      setLoadingVersions(true);

      const response = await axios.get(
        `${API}/compare/${encodeURIComponent(
          contractId
        )}/versions`
      );

      const data = response.data;

      const items: ContractVersion[] =
        Array.isArray(data)
          ? data
          : data?.versions || [];

      setVersions(items);
    } catch (err) {
      console.error(err);

      setError(
        getErrorMessage(err) ||
        "Unable to load contract versions."
      );
    } finally {
      setLoadingVersions(false);
    }
  };

  /* ============================================================
     UPLOAD CONTRACT VERSION
     ============================================================ */

  const uploadContractVersion = async () => {
    if (!selectedContractId) {
      setError(
        "Please select a contract first."
      );
      return;
    }

    if (!versionFile) {
      setError(
        "Please select a PDF version first."
      );
      return;
    }

    if (
      !versionFile.name
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      setError(
        "Only PDF versions are supported."
      );
      return;
    }

    try {
      setUploadingVersion(true);

      setError("");
      setMessage("");

      const formData = new FormData();

      formData.append(
        "file",
        versionFile
      );

      await axios.post(
        `${API}/compare/${encodeURIComponent(
          selectedContractId
        )}/upload-version`,
        formData,
        {
          headers: {
            "Content-Type":
              "multipart/form-data",
          },
        }
      );

      setVersionFile(null);
      setComparison(null);

      setMessage(
        "Contract version uploaded successfully."
      );

      await loadVersions();
      await loadDashboard();
    } catch (err) {
      console.error(err);

      setError(
        getErrorMessage(err) ||
        "Unable to upload contract version."
      );
    } finally {
      setUploadingVersion(false);
    }
  };

  /* ============================================================
     COMPARE LATEST VERSIONS
     ============================================================ */

  const compareLatestVersions = async () => {
    if (!selectedContractId) {
      setError(
        "Please select a contract first."
      );
      return;
    }

    try {
      setComparingVersions(true);

      setError("");
      setMessage("");

      const response = await axios.get(
        `${API}/compare/${encodeURIComponent(
          selectedContractId
        )}`
      );

      setComparison(response.data);

      setMessage(
        "Latest contract versions compared successfully."
      );
    } catch (err) {
      console.error(err);

      setError(
        getErrorMessage(err) ||
        "Unable to compare contract versions."
      );
    } finally {
      setComparingVersions(false);
    }
  };

  /* ============================================================
     NAVIGATION
     ============================================================ */

  const navigate = (
    target: typeof page
  ) => {
    setPage(target);

    setError("");
    setMessage("");

    if (
      target === "dashboard" &&
      selectedContractId
    ) {
      loadDashboard();
    }

    if (
      target === "compare" &&
      selectedContractId
    ) {
      loadVersions();
    }
  };

  /* ============================================================
     CURRENT CONTRACT
     ============================================================ */

  const selectedContract =
    useMemo(
      () =>
        contracts.find(
          (item) =>
            item.contract_id ===
            selectedContractId
        ),
      [
        contracts,
        selectedContractId,
      ]
    );

  /* ============================================================
     LAYOUT
     ============================================================ */

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <FileText size={23} />
          </div>

          <div>
            <h1>ContractLens</h1>

            <span>
              Contract Intelligence
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={
              page === "dashboard"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() =>
              navigate("dashboard")
            }
          >
            <LayoutDashboard size={19} />
            Dashboard
          </button>

          <button
            className={
              page === "contracts"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() =>
              navigate("contracts")
            }
          >
            <FileText size={19} />
            Contracts
          </button>

          <button
            className={
              page === "obligations"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() =>
              navigate("obligations")
            }
          >
            <ClipboardList size={19} />
            Obligations
          </button>

          <button
            className={
              page === "reminders"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() =>
              navigate("reminders")
            }
          >
            <Bell size={19} />
            Reminders
          </button>

          <button
            className={
              page === "compare"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() =>
              navigate("compare")
            }
          >
            <GitCompare size={19} />
            Compare Versions
          </button>

          <button
            className={
              page === "assistant"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() =>
              navigate("assistant")
            }
          >
            <Bot size={19} />
            AI Assistant
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="status-dot" />

          Backend connected
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h2>
              {page === "dashboard" &&
                "Contract Dashboard"}

              {page === "contracts" &&
                "Contract Library"}

              {page === "obligations" &&
                "Obligation Management"}

              {page === "reminders" &&
                "Reminder Management"}

              {page === "compare" &&
                "Contract Comparison"}

              {page === "assistant" &&
                "AI Contract Assistant"}
            </h2>

            <p>
              {selectedContract
                ? selectedContract.title ||
                selectedContract.filename ||
                selectedContract.contract_id
                : "Manage your contracts intelligently"}
            </p>
          </div>

          <div className="topbar-actions">
            <button
              className="icon-button"
              title="Refresh"
              onClick={async () => {
                await loadContracts(false);

                if (selectedContractId) {
                  await loadDashboard();
                  await loadVersions();
                }
              }}
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {(error || message) && (
          <div className="notification-area">
            {error && (
              <div className="notification error">
                <XCircle size={18} />

                <span>{error}</span>

                <button
                  onClick={() =>
                    setError("")
                  }
                >
                  ×
                </button>
              </div>
            )}

            {message && (
              <div className="notification success">
                <CheckCircle2
                  size={18}
                />

                <span>{message}</span>

                <button
                  onClick={() =>
                    setMessage("")
                  }
                >
                  ×
                </button>
              </div>
            )}
          </div>
        )}

        <div className="content-area">
          {page === "dashboard" &&
            renderDashboard()}

          {page === "contracts" &&
            renderContracts()}

          {page === "obligations" &&
            renderObligations()}

          {page === "reminders" &&
            renderReminders()}

          {page === "compare" &&
            renderVersionComparison()}

          {page === "assistant" &&
            renderAssistant()}
        </div>
      </main>
    </div>
  );

  /* ============================================================
     DASHBOARD
     ============================================================ */

  function renderDashboard() {
    if (loadingDashboard && !dashboard) {
      return (
        <LoadingPanel text="Loading contract dashboard..." />
      );
    }

    if (!selectedContractId) {
      return (
        <EmptyState
          icon={<FileText size={45} />}
          title="No contract selected"
          text="Upload a contract or select one from the contract library."
          buttonText="Open Contract Library"
          onClick={() =>
            navigate("contracts")
          }
        />
      );
    }

    if (!dashboard) {
      return (
        <EmptyState
          icon={<FileText size={45} />}
          title="Contract dashboard unavailable"
          text="Select a contract and refresh the dashboard."
          buttonText="Refresh"
          onClick={() =>
            loadDashboard()
          }
        />
      );
    }

    const contract =
      dashboard.contract;

    const stats =
      dashboard.statistics;

    return (
      <>
        <div className="page-heading">
          <div>
            <h1>
              {contract.title ||
                contract.filename ||
                "Contract"}
            </h1>

            <p>
              Contract ID:{" "}
              {contract.contract_id}
            </p>
          </div>

          <button
            className="secondary-button"
            onClick={() =>
              loadDashboard()
            }
          >
            <RefreshCw size={17} />
            Refresh
          </button>
        </div>

        <ContractSelector />

        <div className="stats-grid">
          <StatCard
            icon={
              <ClipboardList size={21} />
            }
            label="Total Obligations"
            value={
              stats.total_obligations
            }
          />

          <StatCard
            icon={
              <Clock size={21} />
            }
            label="Pending"
            value={
              stats.pending_obligations
            }
          />

          <StatCard
            icon={
              <CheckCircle2
                size={21}
              />
            }
            label="Completed"
            value={
              stats.completed_obligations
            }
          />

          <StatCard
            icon={
              <AlertTriangle
                size={21}
              />
            }
            label="Overdue"
            value={
              stats.overdue_obligations
            }
          />

          <StatCard
            icon={
              <Bell size={21} />
            }
            label="Reminders"
            value={
              stats.total_reminders
            }
          />

          <StatCard
            icon={
              <GitCompare size={21} />
            }
            label="Versions"
            value={
              stats.contract_versions
            }
          />
        </div>

        <div className="dashboard-grid">
          <section className="dashboard-card">
            <div className="card-title-row">
              <h2>
                <FileText size={19} />
                Contract Information
              </h2>
            </div>

            <div className="info-list">
              <InfoRow
                label="Filename"
                value={
                  contract.filename
                }
              />

              <InfoRow
                label="Effective Date"
                value={
                  contract.effective_date
                }
              />

              <InfoRow
                label="Expiration Date"
                value={
                  contract.expiration_date
                }
              />
            </div>
          </section>

          <section className="dashboard-card">
            <div className="card-title-row">
              <h2>
                <FileText size={19} />
                Parties
              </h2>
            </div>

            {contract.parties &&
              contract.parties.length > 0 ? (
              <div className="party-list">
                {contract.parties.map(
                  (
                    party,
                    index
                  ) => (
                    <div
                      className="party-item"
                      key={index}
                    >
                      <div className="party-avatar">
                        {getPartyName(
                          party
                        )
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div>
                        <strong>
                          {getPartyName(
                            party
                          )}
                        </strong>

                        {getPartyRole(
                          party
                        ) && (
                            <small>
                              {getPartyRole(
                                party
                              )}
                            </small>
                          )}
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <EmptyInline text="No party information available." />
            )}
          </section>
        </div>

        <section className="dashboard-card">
          <div className="card-title-row">
            <div>
              <h2>
                <AlertTriangle
                  size={19}
                />
                Human Review Flags
              </h2>

              <p>
                Items identified by the analysis
                that may require human/legal review.
              </p>
            </div>
          </div>

          {contract.human_review_flags &&
            contract.human_review_flags.length >
            0 ? (
            <div className="review-list">
              {contract.human_review_flags.map(
                (
                  flag,
                  index
                ) => (
                  <div
                    className="review-item"
                    key={index}
                  >
                    <AlertTriangle
                      size={19}
                    />

                    <div>
                      <strong>
                        {getReviewIssue(
                          flag
                        )}
                      </strong>

                      {getReviewSource(
                        flag
                      ) && (
                          <small>
                            Source:{" "}
                            {getReviewSource(
                              flag
                            )}
                          </small>
                        )}
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <EmptyInline text="No human review flags were returned." />
          )}
        </section>

        <div className="dashboard-grid">
          <section className="dashboard-card">
            <div className="card-title-row">
              <h2>
                <ClipboardList
                  size={19}
                />
                Recent Obligations
              </h2>

              <button
                className="text-button"
                onClick={() =>
                  navigate(
                    "obligations"
                  )
                }
              >
                View all
                <ChevronRight
                  size={16}
                />
              </button>
            </div>

            {dashboard.obligations
              .slice(0, 5)
              .map(
                (obligation) => (
                  <ObligationCompact
                    key={
                      obligation.id
                    }
                    obligation={
                      obligation
                    }
                  />
                )
              )}

            {dashboard.obligations
              .length === 0 && (
                <EmptyInline text="No obligations found." />
              )}
          </section>

          <section className="dashboard-card">
            <div className="card-title-row">
              <h2>
                <Bell size={19} />
                Recent Reminders
              </h2>

              <button
                className="text-button"
                onClick={() =>
                  navigate(
                    "reminders"
                  )
                }
              >
                View all
                <ChevronRight
                  size={16}
                />
              </button>
            </div>

            {dashboard.reminders
              .slice(0, 5)
              .map(
                (reminder) => (
                  <ReminderCompact
                    key={
                      reminder.id
                    }
                    reminder={
                      reminder
                    }
                  />
                )
              )}

            {dashboard.reminders
              .length === 0 && (
                <EmptyInline text="No reminders found." />
              )}
          </section>
        </div>
      </>
    );
  }

  /* ============================================================
     CONTRACTS
     ============================================================ */

  function renderContracts() {
    return (
      <>
        <div className="page-heading">
          <div>
            <h1>
              Contract Library
            </h1>

            <p>
              Upload, analyze and manage your
              contracts.
            </p>
          </div>

          <button
            className="secondary-button"
            onClick={() =>
              loadContracts(false)
            }
          >
            <RefreshCw size={17} />
            Refresh
          </button>
        </div>

        <section className="upload-card">
          <div className="upload-icon">
            <Upload size={27} />
          </div>

          <div className="upload-content">
            <h2>
              Upload Contract
            </h2>

            <p>
              Upload a PDF and ContractLens will
              extract and analyze the contract.
            </p>

            <div className="upload-controls">
              <input
                type="file"
                id="contract-upload"
                accept=".pdf"
                onChange={(event) =>
                  setContractFile(
                    event.target.files?.[0] ||
                    null
                  )
                }
              />

              <label
                htmlFor="contract-upload"
                className="file-picker"
              >
                <Upload size={18} />

                {contractFile
                  ? contractFile.name
                  : "Choose PDF"}
              </label>

              <button
                className="primary-button"
                disabled={
                  uploadingContract ||
                  !contractFile
                }
                onClick={
                  uploadAndAnalyzeContract
                }
              >
                {uploadingContract ? (
                  <>
                    <Loader2
                      className="spin"
                      size={18}
                    />

                    Analyzing...
                  </>
                ) : (
                  <>
                    <Search size={18} />
                    Upload & Analyze
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        <section className="library-section">
          <div className="section-heading">
            <div>
              <h2>
                Your Contracts
              </h2>

              <span>
                {contracts.length} contract
                {contracts.length === 1
                  ? ""
                  : "s"}
              </span>
            </div>
          </div>

          {loadingContracts ? (
            <LoadingPanel text="Loading contracts..." />
          ) : contracts.length ===
            0 ? (
            <EmptyState
              icon={
                <FileText size={45} />
              }
              title="No contracts yet"
              text="Upload your first contract to begin."
            />
          ) : (
            <div className="contract-grid">
              {contracts.map(
                (contract) => (
                  <button
                    className={
                      selectedContractId ===
                        contract.contract_id
                        ? "contract-card selected"
                        : "contract-card"
                    }
                    key={
                      contract.contract_id
                    }
                    onClick={() => {
                      setSelectedContractId(
                        contract.contract_id
                      );

                      setPage(
                        "dashboard"
                      );
                    }}
                  >
                    <div className="contract-card-top">
                      <div className="contract-icon">
                        <FileText
                          size={21}
                        />
                      </div>

                      <ChevronRight
                        size={18}
                      />
                    </div>

                    <h3>
                      {contract.title ||
                        contract.filename ||
                        contract.contract_id}
                    </h3>

                    <p>
                      {contract.filename}
                    </p>

                    <div className="contract-meta">
                      <span>
                        {contract.obligation_count ||
                          0}{" "}
                        obligations
                      </span>

                      <span>
                        {contract.completed_obligations ||
                          0}{" "}
                        completed
                      </span>
                    </div>
                  </button>
                )
              )}
            </div>
          )}
        </section>
      </>
    );
  }

  /* ============================================================
     OBLIGATIONS
     ============================================================ */

  function renderObligations() {
    if (!dashboard) {
      return (
        <LoadingPanel text="Loading obligations..." />
      );
    }

    return (
      <>
        <div className="page-heading">
          <div>
            <h1>
              Obligation Management
            </h1>

            <p>
              Track contractual obligations and
              update their status.
            </p>
          </div>

          <button
            className="secondary-button"
            onClick={() =>
              loadDashboard()
            }
          >
            <RefreshCw size={17} />
            Refresh
          </button>
        </div>

        <ContractSelector />

        <div className="stats-grid compact">
          <StatCard
            icon={
              <ClipboardList size={21} />
            }
            label="Total"
            value={
              dashboard.statistics
                .total_obligations
            }
          />

          <StatCard
            icon={
              <Clock size={21} />
            }
            label="Pending"
            value={
              dashboard.statistics
                .pending_obligations
            }
          />

          <StatCard
            icon={
              <CheckCircle2
                size={21}
              />
            }
            label="Completed"
            value={
              dashboard.statistics
                .completed_obligations
            }
          />

          <StatCard
            icon={
              <AlertTriangle
                size={21}
              />
            }
            label="Overdue"
            value={
              dashboard.statistics
                .overdue_obligations
            }
          />
        </div>

        <section className="dashboard-card">
          <div className="card-title-row">
            <div>
              <h2>
                <ClipboardList
                  size={19}
                />
                All Obligations
              </h2>
            </div>
          </div>

          {dashboard.obligations
            .length === 0 ? (
            <EmptyInline text="No obligations found for this contract." />
          ) : (
            <div className="obligation-list">
              {dashboard.obligations.map(
                (obligation) => (
                  <div
                    className="obligation-card"
                    key={
                      obligation.id
                    }
                  >
                    <div className="obligation-main">
                      <div className="obligation-icon">
                        <ClipboardList
                          size={19}
                        />
                      </div>

                      <div>
                        <h3>
                          {obligation.title ||
                            "Untitled obligation"}
                        </h3>

                        <p>
                          {obligation.description ||
                            "No description available."}
                        </p>

                        <div className="obligation-details">
                          <span>
                            Responsible:{" "}
                            {obligation.responsible_party ||
                              "—"}
                          </span>

                          <span>
                            Due:{" "}
                            {formatDate(
                              obligation.due_date
                            )}
                          </span>

                          <span>
                            Source:{" "}
                            {obligation.source_section ||
                              "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="obligation-actions">
                      <StatusBadge
                        status={
                          obligation.status
                        }
                      />

                      <select
                        value={
                          obligation.status ||
                          "pending"
                        }
                        disabled={
                          updatingObligationId ===
                          obligation.id
                        }
                        onChange={(event) =>
                          updateObligationStatus(
                            obligation.id,
                            event.target.value
                          )
                        }
                      >
                        <option value="pending">
                          Pending
                        </option>

                        <option value="in_progress">
                          In Progress
                        </option>

                        <option value="completed">
                          Completed
                        </option>

                        <option value="overdue">
                          Overdue
                        </option>
                      </select>

                      {updatingObligationId ===
                        obligation.id && (
                          <Loader2
                            className="spin"
                            size={17}
                          />
                        )}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>
      </>
    );
  }

  /* ============================================================
     REMINDERS
     ============================================================ */

  function renderReminders() {
    if (!dashboard) {
      return (
        <LoadingPanel text="Loading reminders..." />
      );
    }

    return (
      <>
        <div className="page-heading">
          <div>
            <h1>
              Reminder Management
            </h1>

            <p>
              Create and track contract-related
              reminders.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() =>
              setShowReminderForm(
                !showReminderForm
              )
            }
          >
            <Bell size={18} />
            {showReminderForm
              ? "Close"
              : "Create Reminder"}
          </button>
        </div>

        <ContractSelector />

        {showReminderForm && (
          <section className="dashboard-card reminder-form-card">
            <div className="card-title-row">
              <div>
                <h2>
                  <Bell size={19} />
                  New Reminder
                </h2>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label>
                  Title
                </label>

                <input
                  value={
                    reminderTitle
                  }
                  onChange={(event) =>
                    setReminderTitle(
                      event.target
                        .value
                    )
                  }
                  placeholder="e.g. Payment due"
                />
              </div>

              <div className="form-field">
                <label>
                  Reminder Date
                </label>

                <input
                  type="date"
                  value={
                    reminderDate
                  }
                  onChange={(event) =>
                    setReminderDate(
                      event.target
                        .value
                    )
                  }
                />
              </div>

              <div className="form-field full">
                <label>
                  Description
                </label>

                <textarea
                  value={
                    reminderDescription
                  }
                  onChange={(event) =>
                    setReminderDescription(
                      event.target
                        .value
                    )
                  }
                  placeholder="Describe what needs to be remembered..."
                  rows={4}
                />
              </div>
            </div>

            <div className="form-actions">
              <button
                className="secondary-button"
                onClick={() =>
                  setShowReminderForm(
                    false
                  )
                }
              >
                Cancel
              </button>

              <button
                className="primary-button"
                disabled={
                  creatingReminder
                }
                onClick={
                  createReminder
                }
              >
                {creatingReminder ? (
                  <>
                    <Loader2
                      className="spin"
                      size={18}
                    />

                    Creating...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Create Reminder
                  </>
                )}
              </button>
            </div>
          </section>
        )}

        <section className="dashboard-card">
          <div className="card-title-row">
            <div>
              <h2>
                <Bell size={19} />
                All Reminders
              </h2>

              <p>
                {dashboard.statistics
                  .pending_reminders}{" "}
                pending reminders
              </p>
            </div>
          </div>

          {dashboard.reminders
            .length === 0 ? (
            <EmptyState
              icon={
                <Bell size={40} />
              }
              title="No reminders"
              text="Create a reminder to track an upcoming contract event."
              buttonText="Create Reminder"
              onClick={() =>
                setShowReminderForm(
                  true
                )
              }
            />
          ) : (
            <div className="reminder-list">
              {dashboard.reminders.map(
                (reminder) => (
                  <div
                    className="reminder-card"
                    key={
                      reminder.id
                    }
                  >
                    <div className="reminder-icon">
                      <Bell size={19} />
                    </div>

                    <div className="reminder-content">
                      <div className="reminder-title-row">
                        <h3>
                          {reminder.title ||
                            "Untitled reminder"}
                        </h3>

                        <StatusBadge
                          status={
                            reminder.status
                          }
                        />
                      </div>

                      <p>
                        {reminder.description ||
                          "No description available."}
                      </p>

                      <span className="reminder-date">
                        <Clock
                          size={14}
                        />

                        {formatDate(
                          reminder.reminder_date
                        )}
                      </span>
                    </div>

                    <div className="reminder-actions">
                      <select
                        value={
                          reminder.status ||
                          "pending"
                        }
                        disabled={
                          updatingReminderId ===
                          reminder.id
                        }
                        onChange={(event) =>
                          updateReminderStatus(
                            reminder.id,
                            event.target.value
                          )
                        }
                      >
                        <option value="pending">
                          Pending
                        </option>

                        <option value="completed">
                          Completed
                        </option>

                        <option value="dismissed">
                          Dismissed
                        </option>
                      </select>

                      {updatingReminderId ===
                        reminder.id && (
                          <Loader2
                            className="spin"
                            size={17}
                          />
                        )}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>
      </>
    );
  }

  /* ============================================================
     VERSION COMPARISON
     ============================================================ */

  function renderVersionComparison() {
    if (!selectedContractId) {
      return (
        <EmptyState
          icon={
            <GitCompare size={45} />
          }
          title="No contract selected"
          text="Select a contract before comparing versions."
          buttonText="Open Contract Library"
          onClick={() =>
            navigate("contracts")
          }
        />
      );
    }

    const changes =
      comparison?.comparison
        ?.changes || [];

    const totalChanges =
      comparison?.comparison
        ?.total_changes ??
      changes.length;

    return (
      <>
        <div className="page-heading">
          <div>
            <h1>
              Contract Version Comparison
            </h1>

            <p>
              Upload and compare different
              versions of the selected contract.
            </p>
          </div>

          <button
            className="secondary-button"
            onClick={() => {
              loadVersions();
              setComparison(null);
            }}
          >
            <RefreshCw size={17} />
            Refresh
          </button>
        </div>

        <ContractSelector />

        <div className="stats-grid compact">
          <StatCard
            icon={
              <GitCompare size={21} />
            }
            label="Stored Versions"
            value={versions.length}
          />

          <StatCard
            icon={
              <FileText size={21} />
            }
            label="Old Version"
            value={
              comparison?.old_version ??
              "—"
            }
          />

          <StatCard
            icon={
              <FileText size={21} />
            }
            label="New Version"
            value={
              comparison?.new_version ??
              "—"
            }
          />

          <StatCard
            icon={
              <ClipboardList
                size={21}
              />
            }
            label="Total Changes"
            value={totalChanges}
          />
        </div>

        <section className="dashboard-card">
          <div className="card-title-row">
            <div>
              <h2>
                <Upload size={19} />
                Upload New Version
              </h2>

              <p>
                Upload another PDF version of
                this contract.
              </p>
            </div>
          </div>

          <div className="version-upload">
            <input
              type="file"
              id="version-upload"
              accept=".pdf"
              onChange={(event) =>
                setVersionFile(
                  event.target.files?.[0] ||
                  null
                )
              }
            />

            <label
              htmlFor="version-upload"
              className="file-picker"
            >
              <Upload size={18} />

              {versionFile
                ? versionFile.name
                : "Choose PDF version"}
            </label>

            <button
              className="primary-button"
              disabled={
                uploadingVersion ||
                !versionFile
              }
              onClick={
                uploadContractVersion
              }
            >
              {uploadingVersion ? (
                <>
                  <Loader2
                    className="spin"
                    size={18}
                  />

                  Uploading...
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Upload Version
                </>
              )}
            </button>
          </div>
        </section>

        <section className="dashboard-card">
          <div className="card-title-row">
            <div>
              <h2>
                <FileText size={19} />
                Stored Versions
              </h2>

              <p>
                Versions currently stored for
                this contract.
              </p>
            </div>
          </div>

          {loadingVersions ? (
            <LoadingPanel text="Loading versions..." />
          ) : versions.length === 0 ? (
            <EmptyInline text="No stored versions found." />
          ) : (
            <div className="versions-list">
              {versions.map(
                (
                  version,
                  index
                ) => {
                  const number =
                    version.version ??
                    version.version_number ??
                    index + 1;

                  const filename =
                    version.filename ??
                    version.file_name ??
                    `Version ${number}`;

                  return (
                    <div
                      className="version-row"
                      key={
                        version.id ??
                        `${number}-${filename}`
                      }
                    >
                      <div className="version-number">
                        V{number}
                      </div>

                      <div className="version-info">
                        <strong>
                          {filename}
                        </strong>

                        {(version.created_at ||
                          version.uploaded_at) && (
                            <small>
                              Uploaded:{" "}
                              {version.created_at ||
                                version.uploaded_at}
                            </small>
                          )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </section>

        <section className="comparison-action">
          <div>
            <h2>
              Compare Latest Versions
            </h2>

            <p>
              Compare the two latest stored
              versions of this contract.
            </p>
          </div>

          <button
            className="primary-button"
            disabled={
              comparingVersions ||
              versions.length < 2
            }
            onClick={
              compareLatestVersions
            }
          >
            {comparingVersions ? (
              <>
                <Loader2
                  className="spin"
                  size={18}
                />

                Comparing...
              </>
            ) : (
              <>
                <GitCompare size={18} />
                Compare Versions
              </>
            )}
          </button>
        </section>

        {comparison && (
          <section className="dashboard-card">
            <div className="card-title-row">
              <div>
                <h2>
                  <GitCompare size={19} />
                  Comparison Result
                </h2>

                <p>
                  Version{" "}
                  {comparison.old_version ??
                    "—"}{" "}
                  → Version{" "}
                  {comparison.new_version ??
                    "—"}
                </p>
              </div>

              <span
                className={
                  totalChanges === 0
                    ? "change-count no-changes"
                    : "change-count"
                }
              >
                {totalChanges}{" "}
                {totalChanges === 1
                  ? "change"
                  : "changes"}
              </span>
            </div>

            {totalChanges === 0 ? (
              <EmptyState
                icon={
                  <CheckCircle2
                    size={45}
                  />
                }
                title="No changes detected"
                text="The latest two contract versions contain no detected differences."
              />
            ) : (
              <div className="change-list">
                {changes.map(
                  (
                    change,
                    index
                  ) => {
                    const type =
                      change.type ||
                      change.change_type ||
                      "modified";

                    const section =
                      change.section ||
                      change.source_section ||
                      "Contract";

                    return (
                      <div
                        className="change-card"
                        key={index}
                      >
                        <div className="change-header">
                          <span className="change-type">
                            {safeText(
                              type
                            )}
                          </span>

                          <strong>
                            {safeText(
                              section
                            )}
                          </strong>
                        </div>

                        {change.old_text && (
                          <div className="change-block old">
                            <span>
                              Previous
                            </span>

                            <p>
                              {safeText(
                                change.old_text
                              )}
                            </p>
                          </div>
                        )}

                        {change.new_text && (
                          <div className="change-block new">
                            <span>
                              New
                            </span>

                            <p>
                              {safeText(
                                change.new_text
                              )}
                            </p>
                          </div>
                        )}

                        {change.old_value && (
                          <div className="change-block old">
                            <span>
                              Previous
                            </span>

                            <p>
                              {safeText(
                                change.old_value
                              )}
                            </p>
                          </div>
                        )}

                        {change.new_value && (
                          <div className="change-block new">
                            <span>
                              New
                            </span>

                            <p>
                              {safeText(
                                change.new_value
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </section>
        )}
      </>
    );
  }

  /* ============================================================
     AI ASSISTANT
     ============================================================ */

  function renderAssistant() {
    if (!selectedContractId) {
      return (
        <EmptyState
          icon={<Bot size={45} />}
          title="No contract selected"
          text="Select a contract before using the AI Contract Assistant."
          buttonText="Open Contract Library"
          onClick={() => navigate("contracts")}
        />
      );
    }

    const suggestions = [
      "What are the consultant's main obligations?",
      "What are the payment terms?",
      "When does this contract expire?",
      "Show me the important contract clauses.",
    ];

    return (
      <div className="assistant-page">
        <section className="assistant-card">
          <div className="assistant-header">
            <div className="assistant-header-icon">
              <Bot size={24} />
            </div>

            <div className="assistant-header-copy">
              <h1>AI Contract Assistant</h1>
              <p>
                Ask questions or request actions for the selected contract.
              </p>
            </div>

            <button
              className="secondary-button assistant-clear-button"
              onClick={clearAssistantChat}
              disabled={assistantLoading || assistantMessages.length === 0}
            >
              Clear Chat
            </button>
          </div>

          <div className="assistant-contract-bar">
            <FileText size={17} />
            <span>
              {selectedContract?.title ||
                selectedContract?.filename ||
                selectedContractId}
            </span>
            <small>
              {selectedContractId}
            </small>
          </div>

          {assistantMessages.length === 0 ? (
            <div className="assistant-welcome">
              <div className="assistant-welcome-icon">
                <Bot size={38} />
              </div>

              <h2>Ask about your contract</h2>

              <p>
                ContractLens can search contract evidence, inspect obligations,
                update obligation status, and create reminders through its
                agentic tools.
              </p>

              <div className="assistant-suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    className="assistant-suggestion"
                    onClick={() => askAssistant(suggestion)}
                    disabled={assistantLoading}
                  >
                    <Search size={16} />
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="assistant-messages">
              {assistantMessages.map((item) => (
                <div
                  className={
                    item.role === "user"
                      ? "assistant-message user"
                      : "assistant-message agent"
                  }
                  key={item.id}
                >
                  <div className="assistant-message-avatar">
                    {item.role === "user" ? "You" : <Bot size={17} />}
                  </div>

                  <div className="assistant-message-body">
                    <div className="assistant-message-label">
                      {item.role === "user" ? "You" : "ContractLens AI"}
                    </div>

                    <div className="assistant-message-content">
                      {item.content}
                    </div>

                    {item.role === "assistant" && item.toolsUsed && item.toolsUsed.length > 0 && (
                      <div className="assistant-tool-panel">
                        <div className="assistant-tool-title">
                          <CheckCircle2 size={16} />
                          Tools used
                        </div>

                        <div className="assistant-tool-list">
                          {item.toolsUsed.map((tool, index) => (
                            <span className="assistant-tool-chip" key={`${tool}-${index}`}>
                              {tool}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {item.role === "assistant" && item.toolResults && item.toolResults.length > 0 && (
                      <div className="assistant-evidence">
                        <div className="assistant-evidence-title">
                          <Search size={16} />
                          Evidence / tool results
                        </div>

                        {item.toolResults.map((toolResult, index) => (
                          <div className="assistant-evidence-item" key={`${toolResult.tool || "tool"}-${index}`}>
                            <strong>{toolResult.tool || "Tool"}</strong>
                            <span>
                              {getToolResultPreview(toolResult.result)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {item.role === "assistant" && item.confidence && (
                      <div className="assistant-confidence">
                        Confidence: {item.confidence}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {assistantLoading && (
                <div className="assistant-message agent">
                  <div className="assistant-message-avatar">
                    <Bot size={17} />
                  </div>

                  <div className="assistant-message-body">
                    <div className="assistant-message-label">
                      ContractLens AI
                    </div>

                    <div className="assistant-thinking">
                      <Loader2 className="spin" size={17} />
                      Thinking and using contract tools...
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="assistant-composer">
            <textarea
              value={assistantInput}
              onChange={(event) => setAssistantInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  askAssistant();
                }
              }}
              placeholder="Ask about this contract or request an action..."
              rows={3}
              disabled={assistantLoading}
            />

            <div className="assistant-composer-footer">
              <span>
                Enter to send • Shift + Enter for a new line
              </span>

              <button
                className="primary-button"
                onClick={() => askAssistant()}
                disabled={assistantLoading || !assistantInput.trim()}
              >
                {assistantLoading ? (
                  <>
                    <Loader2 className="spin" size={17} />
                    Working...
                  </>
                ) : (
                  <>
                    <Send size={17} />
                    Send
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        <section className="dashboard-card assistant-capabilities">
          <div className="card-title-row">
            <div>
              <h2>
                <Bot size={19} />
                Agentic Capabilities
              </h2>
              <p>
                ContractLens can select and execute backend tools when your request requires them.
              </p>
            </div>
          </div>

          <div className="assistant-capability-grid">
            <div>
              <Search size={18} />
              <strong>Contract Search</strong>
              <span>Find relevant clauses and evidence.</span>
            </div>

            <div>
              <ClipboardList size={18} />
              <strong>Obligation Tracking</strong>
              <span>Find and update contract obligations.</span>
            </div>

            <div>
              <Bell size={18} />
              <strong>Reminders</strong>
              <span>Create contract-related reminders.</span>
            </div>

            <div>
              <GitCompare size={18} />
              <strong>Version Analysis</strong>
              <span>Compare stored contract versions from the comparison page.</span>
            </div>
          </div>
        </section>
      </div>
    );
  }

  /* ============================================================
     SHARED CONTRACT SELECTOR
     ============================================================ */

  function ContractSelector() {
    return (
      <div className="contract-selector">
        <div>
          <label>
            Selected Contract
          </label>

          <span>
            Choose which contract to manage.
          </span>
        </div>

        <select
          value={
            selectedContractId
          }
          onChange={(event) =>
            handleContractChange(
              event.target.value
            )
          }
        >
          {contracts.length ===
            0 ? (
            <option value="">
              No contracts
            </option>
          ) : (
            contracts.map(
              (contract) => (
                <option
                  key={
                    contract.contract_id
                  }
                  value={
                    contract.contract_id
                  }
                >
                  {contract.title ||
                    contract.filename ||
                    contract.contract_id}
                </option>
              )
            )
          )}
        </select>
      </div>
    );
  }
}

/* ============================================================
   COMPONENTS
   ============================================================ */

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">
        {icon}
      </div>

      <div className="stat-content">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value?: any;
}) {
  return (
    <div className="info-row">
      <span>{label}</span>

      <strong>
        {value || "—"}
      </strong>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status?: string | null;
}) {
  const normalized =
    status || "pending";

  return (
    <span
      className={`status-badge ${normalized}`}
    >
      {normalized
        .replaceAll("_", " ")
        .replace(
          /^\w/,
          (character) =>
            character.toUpperCase()
        )}
    </span>
  );
}

function ObligationCompact({
  obligation,
}: {
  obligation: Obligation;
}) {
  return (
    <div className="compact-row">
      <div className="compact-icon">
        <ClipboardList
          size={17}
        />
      </div>

      <div className="compact-content">
        <strong>
          {obligation.title ||
            "Untitled obligation"}
        </strong>

        <small>
          Due:{" "}
          {formatDate(
            obligation.due_date
          )}
        </small>
      </div>

      <StatusBadge
        status={obligation.status}
      />
    </div>
  );
}

function ReminderCompact({
  reminder,
}: {
  reminder: Reminder;
}) {
  return (
    <div className="compact-row">
      <div className="compact-icon reminder">
        <Bell size={17} />
      </div>

      <div className="compact-content">
        <strong>
          {reminder.title ||
            "Untitled reminder"}
        </strong>

        <small>
          {formatDate(
            reminder.reminder_date
          )}
        </small>
      </div>

      <StatusBadge
        status={reminder.status}
      />
    </div>
  );
}

function LoadingPanel({
  text,
}: {
  text: string;
}) {
  return (
    <div className="loading-panel">
      <Loader2
        size={30}
        className="spin"
      />

      <p>{text}</p>
    </div>
  );
}

function EmptyInline({
  text,
}: {
  text: string;
}) {
  return (
    <div className="empty-inline">
      {text}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
  buttonText,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  buttonText?: string;
  onClick?: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        {icon}
      </div>

      <h3>{title}</h3>

      <p>{text}</p>

      {buttonText && onClick && (
        <button
          className="primary-button"
          onClick={onClick}
        >
          {buttonText}
        </button>
      )}
    </div>
  );
}

export default App;