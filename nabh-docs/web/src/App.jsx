import { useEffect, useMemo, useState, Fragment } from "react";
import {
  Building2,
  FileSearch,
  FolderOpen,
  Search,
  ArrowUp,
  ArrowDown,
  Pencil,
  History,
  Check,
  X,
  Eye,
  Download,
  Upload,
  Users,
  X as Close,
  ClipboardList,
  FilePenLine,
  RefreshCw,
  Save,
  RotateCcw,
  Calendar,
  Filter,
  AlertCircle,
  House,
} from "lucide-react";
import hospitalLogo from "./assets/nabh-readiness-system.png";
import AdminWorkspace from "./AdminWorkspace.jsx";
import LoginGate from "./LoginGate.jsx";
import RegisterHospital from "./RegisterHospital.jsx";
import SetPassword from "./SetPassword.jsx";
import PlatformWorkspace from "./PlatformWorkspace.jsx";
import SuperAdminWorkspace from "./SuperAdminWorkspace.jsx";
import SuperAdminUserManagement from "./SuperAdminUserManagement.jsx";
import SuperAdminHome from "./SuperAdminHome.jsx";
import TemplateLibrary from "./TemplateLibrary.jsx";
import RoleManagement from "./RoleManagement.jsx";

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };

// Must match NABH_WORKSPACE_CATEGORIES in services/shared/documentCategoryService.js.
const NABH_WORKSPACE_CATEGORIES = [
  "Manuals",
  "Policies",
  "Standard Operating Procedures",
  "Forms and Formats",
  "Registers",
  "Department Manuals",
  "Checklists",
  "Training Requirements",
  "Records and Evidence",
];

const READINESS_STATUSES = [
  "not_started",
  "information_required",
  "draft_generated",
  "under_review",
  "approved",
  "implemented",
  "evidence_available",
];
const READINESS_LABELS = {
  not_started: "Not Started",
  information_required: "Information Required",
  draft_generated: "Draft Generated",
  under_review: "Under Review",
  approved: "Approved",
  implemented: "Implemented",
  evidence_available: "Evidence Available",
};

function confidenceClass(confidence) {
  return `badge badge-${confidence}`;
}

function toFileUrl(filePath) {
  return `file://${filePath.split("/").map(encodeURIComponent).join("/")}`;
}

function docKey(doc) {
  return doc.id;
}

function isAacPolicy(doc) {
  return doc.documentId === "JPH/NABH/D-14A/Rev 00";
}

function isApprovedDocument(doc) {
  if (!doc) return false;
  if (doc.approved === true) return true;
  if (doc.approved === false) return false;
  if (Array.isArray(doc.history) && doc.history.length > 0) {
    return doc.history.some(
      (entry) =>
        entry.action &&
        entry.action !== "matched" &&
        entry.action !== "template baseline",
    );
  }
  return Boolean(doc.version && doc.version > 1);
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    category: params.get("cat") || null,
    documentSearch: params.get("q") || "",
    confidenceFilter: params.get("conf") || "all",
    readinessStatusFilter: params.get("status") || "all",
    onlyInactive: params.get("onlyInactive") === "1",
    sortColumn: params.get("sort") || null,
    sortDirection: params.get("dir") || "asc",
  };
}

function documentDraft(doc) {
  return (
    doc.content ||
    `${doc.documentName}\n\nDocument ID: ${doc.documentId}\n\nThis is an editable prototype preview of the source ${doc.matchedFilePath?.match(/\.[^.]+$/)?.[0].toUpperCase() || "document"}.\n\nUse this workspace to draft changes, then check in a new controlled version.`
  );
}

function OnlyOfficeEditor({ document, department, onClose }) {
  const [editorName, setEditorName] = useState("");
  const [checkInNote, setCheckInNote] = useState("");
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const editorId = `onlyoffice-editor-${document.id}`;

  useEffect(() => {
    if (!config) return undefined;
    const scriptId = "onlyoffice-docs-api";
    const initialize = () => {
      if (!window.DocsAPI) {
        setError("OnlyOffice editor API could not be loaded.");
        return;
      }
      const editor = new window.DocsAPI.DocEditor(editorId, {
        ...config.config,
        events: {
          onDocumentStateChange: (event) => {
            if (saving && !event.data) onClose();
          },
          onRequestClose: onClose,
        },
      });
      window[editorId] = editor;
    };
    let script = window.document.getElementById(scriptId);
    if (script) initialize();
    else {
      script = window.document.createElement("script");
      script.id = scriptId;
      script.src = `${config.documentServerUrl}/web-apps/apps/api/documents/api.js`;
      script.onload = initialize;
      script.onerror = () =>
        setError(
          "Unable to load OnlyOffice. Check ONLYOFFICE_DOCUMENT_SERVER_URL.",
        );
      window.document.head.appendChild(script);
    }
    return () => {
      window[editorId]?.destroyEditor?.();
      delete window[editorId];
    };
  }, [config, editorId, onClose, saving]);

  async function openEditor() {
    if (!editorName.trim()) {
      setError("Enter the editor name before opening the controlled document.");
      return;
    }
    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(department)}/${encodeURIComponent(document.id)}/onlyoffice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            editor: editorName.trim(),
            checkInNote: checkInNote.trim() || "Inline document update",
          }),
        },
      );
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(
          responseText || "The document service returned an invalid response.",
        );
      }
      if (!response.ok)
        throw new Error(result.error || "Unable to open OnlyOffice.");
      setConfig(result);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="preview-backdrop" role="presentation" onClick={onClose}>
      <section
        className="document-editor-dialog onlyoffice-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${document.documentName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="preview-header">
          <div>
            <p className="eyebrow">Controlled document editor</p>
            <h2>{document.documentName}</h2>
            <p className="editor-file-name">
              {document.relativeFilePath || document.matchedFilePath}
            </p>
          </div>
          <button
            className="icon-button"
            title="Close editor"
            onClick={onClose}
          >
            <Close size={18} />
          </button>
        </div>
        {!config ? (
          <div className="onlyoffice-setup">
            <p>
              Open this controlled file in OnlyOffice. Saving in the editor
              creates the next immutable version and audit event.
            </p>
            <label>
              Edited by
              <input
                value={editorName}
                onChange={(event) => setEditorName(event.target.value)}
                placeholder="Name or initials"
              />
            </label>
            <label>
              Check-in note
              <input
                value={checkInNote}
                onChange={(event) => setCheckInNote(event.target.value)}
                placeholder="Describe this revision"
              />
            </label>
            {error && <p className="status error">{error}</p>}
            <button className="primary-button" onClick={openEditor}>
              <FilePenLine size={16} /> Open in OnlyOffice
            </button>
          </div>
        ) : (
          <>
            <div id={editorId} className="onlyoffice-frame" />
            {error && <p className="status error">{error}</p>}
            <div className="checkin-panel">
              <span>
                Save your changes in OnlyOffice, then check in the controlled
                version.
              </span>
              <button
                className="primary-button"
                onClick={() => {
                  setSaving(true);
                  window[editorId]?.requestSave?.();
                }}
              >
                <Save size={16} /> {saving ? "Saving..." : "Save and check in"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function MasterListWorkspace({
  hospitalId,
  hospitalName,
  hospitalLogoPath,
  permissions,
  onCheckIn,
  onGoToAccreditation,
}) {
  const initialUrlState = useMemo(readUrlState, []);
  const [departments, setDepartments] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [accreditationRequired, setAccreditationRequired] = useState(null);
  const [documentSearch, setDocumentSearch] = useState(
    initialUrlState.documentSearch,
  );
  const [confidenceFilter, setConfidenceFilter] = useState(
    initialUrlState.confidenceFilter,
  );
  const [readinessStatusFilter, setReadinessStatusFilter] = useState(
    initialUrlState.readinessStatusFilter,
  );
  const [onlyInactive, setOnlyInactive] = useState(
    initialUrlState.onlyInactive,
  );
  const [sortColumn, setSortColumn] = useState(initialUrlState.sortColumn);
  const [sortDirection, setSortDirection] = useState(
    initialUrlState.sortDirection,
  );
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [previewAacPolicy, setPreviewAacPolicy] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [openDocument, setOpenDocument] = useState(null);
  const [documentContent, setDocumentContent] = useState("");
  const [checkInNote, setCheckInNote] = useState("");
  const [checkInEditor, setCheckInEditor] = useState("");
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [repositoryStatus, setRepositoryStatus] = useState(null);
  const [approvalDocument, setApprovalDocument] = useState(null);
  const [approvalFile, setApprovalFile] = useState(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [approving, setApproving] = useState(false);
  const [questionnaire, setQuestionnaire] = useState(null);
  const [questionAnswers, setQuestionAnswers] = useState({});
  const [questionError, setQuestionError] = useState("");
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState(null);
  const canEdit = permissions.includes("edit");

  async function openQuestionnaire(doc) {
    setQuestionError("");
    setGeneratedDraft(null);
    const templatePath = doc.relativeFilePath || doc.matchedFilePath || "";
    const response = await fetch(`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/document-questions?documentId=${encodeURIComponent(doc.id)}&documentName=${encodeURIComponent(doc.documentName)}&templatePath=${encodeURIComponent(templatePath)}`);
    const data = await response.json();
    if (!response.ok) return setQuestionError(data.error || "Unable to load document questions.");
    setQuestionnaire({ ...data, document: doc });
    setQuestionAnswers(Object.fromEntries((data.questions || []).map((question) => [question.id, question.value || ""])));
  }

  async function generatePersonalizedDraft() {
    if (!questionnaire) return;
    setGeneratingDraft(true);
    setQuestionError("");
    const response = await fetch(`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/document-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: questionnaire.document.id, documentName: questionnaire.document.documentName, templatePath: questionnaire.document.relativeFilePath || questionnaire.document.matchedFilePath || "", answers: questionAnswers })
    });
    const data = await response.json();
    setGeneratingDraft(false);
    if (!response.ok) return setQuestionError(data.error || "Unable to generate the personalized draft.");
    setGeneratedDraft(data.draft);
    setQuestionnaire((current) => ({ ...current, questions: data.questionnaire.questions }));
    setDepartments((current) => current ? Object.fromEntries(Object.entries(current).map(([category, documents]) => [category, documents.map((item) => item.id === questionnaire.document.id ? { ...item, readinessStatus: "draft_generated" } : item)])) : current);
  }

  const pollSyncStatus = (initialMsg) => {
    setSyncingTemplates(true);
    if (initialMsg) setSyncMessage(initialMsg);
    const poll = async () => {
      try {
        const statusResponse = await fetch(
          `/api/admin/hospitals/${encodeURIComponent(hospitalId)}/client-repository/status`,
        );
        const status = await statusResponse.json();
        setRepositoryStatus(status);
        if (status.job?.status === "running") {
          window.setTimeout(poll, 1500);
          return;
        }
        setSyncingTemplates(false);
        if (status.job?.status === "complete") {
          setSyncMessage(
            `${status.job.copied || 0} template(s) synchronized and customized with your hospital logo.`,
          );
          fetch(
            `/api/admin/hospitals/${encodeURIComponent(hospitalId)}/documents`,
          )
            .then(async (res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data?.departments) {
                setDepartments(data.departments);
                if (!selected) setSelected(NABH_WORKSPACE_CATEGORIES[0]);
              }
            });
        } else if (status.job?.status === "failed") {
          setSyncMessage(
            status.job.error ||
              "Template synchronization failed or was incomplete.",
          );
        }
      } catch (err) {
        setSyncingTemplates(false);
        setSyncMessage(err.message || "Unable to check sync status.");
      }
    };
    window.setTimeout(poll, 500);
  };

  useEffect(() => {
    fetch(
      `/api/admin/hospitals/${encodeURIComponent(hospitalId)}/accreditation`,
    )
      .then((response) => response.json())
      .then((accreditation) => {
        if (!accreditation?.selection?.programme) {
          setAccreditationRequired(
            "Select and accept an NABH accreditation programme before the document workspace is available.",
          );
          return null;
        }
        return fetch(
          `/api/admin/hospitals/${encodeURIComponent(hospitalId)}/client-repository/status`,
        );
      })
      .then(async (response) => {
        if (!response) return null;
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || "Unable to check the hospital document repository.",
          );
        return result;
      })
      .then((data) => {
        if (!data) return null;
        setRepositoryStatus(data);
        if (data.job?.status === "running") {
          pollSyncStatus(
            "Template synchronization is currently in progress...",
          );
        } else if (data.job?.status === "failed") {
          setSyncMessage(
            data.job.error ||
              "Previous template synchronization failed or was incomplete.",
          );
        }
        if (!data.repository.exists) return null;
        return fetch(
          `/api/admin/hospitals/${encodeURIComponent(hospitalId)}/documents`,
        ).then(async (response) => {
          const result = await response.json();
          if (
            response.status === 400 &&
            result.reason === "accreditation_required"
          ) {
            setAccreditationRequired(result.error);
            return null;
          }
          if (response.status === 404) {
            setRepositoryStatus({
              repository: {
                mode: result.repository?.mode || "r2",
                exists: false,
                status: "missing",
                ...result.repository,
              },
              job: result.job || null,
            });
            return null;
          }
          if (!response.ok)
            throw new Error(
              result.error ||
                "Unable to load the hospital document repository.",
            );
          return result;
        });
      })
      .then((data) => {
        if (!data) return;
        setDepartments(data.departments);
        const wanted = initialUrlState.category;
        setSelected(
          wanted && NABH_WORKSPACE_CATEGORIES.includes(wanted)
            ? wanted
            : NABH_WORKSPACE_CATEGORIES[0],
        );
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalId, initialUrlState.category]);

  // Keep the URL query string in sync so a view can be bookmarked/shared and survives a refresh.
  useEffect(() => {
    if (!departments) return;
    const params = new URLSearchParams();
    if (selected) params.set("cat", selected);
    if (documentSearch) params.set("q", documentSearch);
    if (confidenceFilter !== "all") params.set("conf", confidenceFilter);
    if (readinessStatusFilter !== "all") params.set("status", readinessStatusFilter);
    if (onlyInactive) params.set("onlyInactive", "1");
    if (sortColumn) {
      params.set("sort", sortColumn);
      params.set("dir", sortDirection);
    }
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      query ? `?${query}` : window.location.pathname,
    );
  }, [
    departments,
    selected,
    documentSearch,
    confidenceFilter,
    readinessStatusFilter,
    onlyInactive,
    sortColumn,
    sortDirection,
  ]);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [selected]);

  const categories = useMemo(() => {
    const map = Object.fromEntries(
      NABH_WORKSPACE_CATEGORIES.map((category) => [category, []]),
    );
    if (departments) {
      for (const [department, docs] of Object.entries(departments)) {
        for (const doc of docs) {
          const category = NABH_WORKSPACE_CATEGORIES.includes(doc.category)
            ? doc.category
            : "Department Manuals";
          map[category].push({ ...doc, department });
        }
      }
    }
    return map;
  }, [departments]);

  const documents = useMemo(
    () => (selected ? categories[selected] || [] : []),
    [selected, categories],
  );

  const confidenceCounts = useMemo(() => {
    const counts = { all: documents.length, high: 0, medium: 0, low: 0 };
    for (const doc of documents) counts[doc.confidence]++;
    return counts;
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const query = documentSearch.trim().toLowerCase();
    let result = documents;
    if (confidenceFilter !== "all")
      result = result.filter((doc) => doc.confidence === confidenceFilter);
    if (readinessStatusFilter !== "all")
      result = result.filter(
        (doc) => (doc.readinessStatus || "not_started") === readinessStatusFilter,
      );
    if (onlyInactive) result = result.filter((doc) => !doc.active);
    if (query) {
      result = result.filter(
        (doc) =>
          doc.documentName.toLowerCase().includes(query) ||
          doc.documentId.toLowerCase().includes(query) ||
          (doc.department || "").toLowerCase().includes(query) ||
          (doc.matchedFilePath || "").toLowerCase().includes(query),
      );
    }
    if (sortColumn) {
      const direction = sortDirection === "desc" ? -1 : 1;
      result = [...result].sort((a, b) => {
        if (sortColumn === "confidence")
          return (
            (CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]) *
            direction
          );
        return a.documentId.localeCompare(b.documentId) * direction;
      });
    }
    return result;
  }, [
    documents,
    documentSearch,
    confidenceFilter,
    readinessStatusFilter,
    onlyInactive,
    sortColumn,
    sortDirection,
  ]);

  const totals = useMemo(() => {
    if (!departments) return null;
    const counts = {
      departments: Object.keys(departments).length,
      documents: 0,
      high: 0,
      medium: 0,
      low: 0,
      active: 0,
      inactive: 0,
    };
    for (const docs of Object.values(departments)) {
      counts.documents += docs.length;
      for (const doc of docs) {
        counts[doc.confidence]++;
        counts[doc.active ? "active" : "inactive"]++;
      }
    }
    return counts;
  }, [departments]);

  const readinessCounts = useMemo(() => {
    const counts = Object.fromEntries(
      READINESS_STATUSES.map((status) => [status, 0]),
    );
    if (!departments) return counts;
    for (const docs of Object.values(departments))
      for (const doc of docs) counts[doc.readinessStatus || "not_started"]++;
    return counts;
  }, [departments]);

  const categoryTotals = useMemo(() => {
    const active = documents.filter((doc) => doc.active).length;
    return { active, inactive: documents.length - active };
  }, [documents]);

  function persistActive(doc, nextActive) {
    fetch(
      `/api/document-matches/${encodeURIComponent(doc.department)}/active`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: doc.id, active: nextActive }),
      },
    ).catch((err) => setError(err.message));
  }

  function setReadinessStatus(doc, nextStatus) {
    setDepartments((current) => ({
      ...current,
      [doc.department]: current[doc.department].map((d) =>
        d.id === doc.id ? { ...d, readinessStatus: nextStatus } : d,
      ),
    }));
    fetch(
      `/api/admin/hospitals/${encodeURIComponent(hospitalId)}/document-status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.id,
          status: nextStatus,
          updatedBy: hospitalName || "Hospital",
        }),
      },
    ).catch((err) => setError(err.message));
  }

  async function runDocumentAction(doc, action) {
    try {
      const response = await fetch(
        `/api/admin/hospitals/${encodeURIComponent(hospitalId)}/documents/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: doc.id,
            action,
            updatedBy: hospitalName || "Hospital",
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to update document status.");
      setDepartments((current) => ({
        ...current,
        [doc.department]: current[doc.department].map((d) =>
          d.id === doc.id ? { ...d, readinessStatus: data.entry.status } : d,
        ),
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleActive(doc) {
    const nextActive = !doc.active;
    setDepartments((current) => ({
      ...current,
      [doc.department]: current[doc.department].map((d) =>
        d.id === doc.id ? { ...d, active: nextActive } : d,
      ),
    }));
    persistActive(doc, nextActive);
  }

  function setSort(column) {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection("asc");
      return;
    }
    if (sortDirection === "asc") {
      setSortDirection("desc");
      return;
    }
    setSortColumn(null);
    setSortDirection("asc");
  }

  function toggleSelectAll() {
    setSelectedKeys((current) => {
      if (filteredDocuments.every((doc) => current.has(docKey(doc))))
        return new Set();
      return new Set(filteredDocuments.map(docKey));
    });
  }

  function toggleSelectOne(doc) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      const key = docKey(doc);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function bulkSetActive(nextActive) {
    const targets = documents.filter((doc) => selectedKeys.has(docKey(doc)));
    setDepartments((current) => {
      const next = { ...current };
      for (const doc of targets)
        next[doc.department] = next[doc.department].map((d) =>
          d.id === doc.id ? { ...d, active: nextActive } : d,
        );
      return next;
    });
    for (const doc of targets) persistActive(doc, nextActive);
    setSelectedKeys(new Set());
  }

  async function syncNewTemplates() {
    setSyncingTemplates(true);
    setSyncMessage("");
    try {
      const response = await fetch(
        `/api/admin/hospitals/${encodeURIComponent(hospitalId)}/client-repository/sync`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to sync new templates.");
      pollSyncStatus(
        "Template synchronization started. Existing client files will not be changed.",
      );
    } catch (syncError) {
      setSyncMessage(syncError.message);
      setSyncingTemplates(false);
    }
  }

  const allFilteredSelected =
    filteredDocuments.length > 0 &&
    filteredDocuments.every((doc) => selectedKeys.has(docKey(doc)));

  function sortIndicator(column) {
    if (sortColumn !== column) return null;
    return sortDirection === "asc" ? (
      <ArrowUp size={12} />
    ) : (
      <ArrowDown size={12} />
    );
  }

  function startEdit(doc) {
    setEditingId(doc.id);
    setEditDraft({
      documentName: doc.documentName,
      documentId: doc.documentId,
      matchedFilePath: doc.matchedFilePath || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  function checkInEdit(doc) {
    const editor = window.prompt(
      "Your name or initials, to record who made this change:",
    );
    if (!editor || !editor.trim()) return;

    fetch(`/api/document-matches/${encodeURIComponent(doc.department)}/edit`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: doc.id,
        editor: editor.trim(),
        fields: editDraft,
      }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to save changes.");
        return response.json();
      })
      .then((result) => {
        setDepartments((current) => ({
          ...current,
          [doc.department]: current[doc.department].map((d) =>
            d.id === doc.id ? result.document : d,
          ),
        }));
        setEditingId(null);
        setEditDraft(null);
      })
      .catch((err) => setError(err.message));
  }

  function toggleHistory(id) {
    setExpandedHistoryId((current) => (current === id ? null : id));
  }

  function startDocumentEdit(doc) {
    setOpenDocument(doc);
    setDocumentContent(documentDraft(doc));
    setCheckInNote("");
    setCheckInEditor("");
  }

  function checkInDocument() {
    if (!checkInEditor.trim()) {
      setError("Editor name is required to check in a document.");
      return;
    }
    const currentlyApproved = isApprovedDocument(openDocument);
    const nextVersion = currentlyApproved ? (openDocument.version || 1) + 1 : 1;
    const timestamp = new Date().toISOString();
    const fields = { content: documentContent };
    fetch(
      `/api/document-matches/${encodeURIComponent(openDocument.department)}/edit`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: openDocument.id,
          editor: checkInEditor.trim(),
          fields,
        }),
      },
    )
      .then((response) => {
        if (!response.ok) throw new Error("Unable to check in the document.");
        return response.json();
      })
      .then((result) => {
        const document = result.document
          ? { ...result.document, approved: true }
          : {
              ...openDocument,
              content: documentContent,
              version: nextVersion,
              approved: true,
              history: [
                ...(openDocument.history || []).filter(
                  (h) => h.action !== "matched",
                ),
                {
                  version: nextVersion,
                  timestamp,
                  editor: checkInEditor.trim(),
                  action: "document check-in",
                  changes: {
                    content: {
                      from: currentlyApproved ? "Previous version" : "Draft",
                      to: checkInNote.trim() || "Content updated",
                    },
                  },
                },
              ],
            };
        setDepartments((current) => ({
          ...current,
          [openDocument.department]: current[openDocument.department].map(
            (item) => (item.id === document.id ? document : item),
          ),
        }));
        onCheckIn({
          id: `${document.id}-${nextVersion}`,
          documentName: document.documentName,
          documentId: document.documentId,
          department: openDocument.department,
          version: document.version || nextVersion,
          editor: checkInEditor.trim(),
          note: checkInNote.trim() || "Content updated",
          timestamp,
        });
        setOpenDocument(null);
      })
      .catch((err) => setError(err.message));
  }

  async function approveUpload() {
    if (!approvalFile) {
      setApprovalError("Select the updated document file.");
      return;
    }
    setApproving(true);
    setApprovalError("");
    try {
      const response = await fetch(
        `/api/admin/hospitals/${encodeURIComponent(hospitalId)}/documents/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Document-Id": approvalDocument.documentId,
            "X-Document-Name": approvalDocument.documentName,
            "X-Department": approvalDocument.department,
            "X-Document-Path": approvalDocument.relativeFilePath,
            "X-File-Name": approvalFile.name,
            "X-Approved-By": hospitalName || "Hospital Administrator",
            "X-Approval-Note": approvalNote.trim(),
          },
          body: await approvalFile.arrayBuffer(),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to approve document version.");
      const nextVer =
        result.document?.currentVersion ||
        (isApprovedDocument(approvalDocument)
          ? (approvalDocument.version || 1) + 1
          : 1);
      setDepartments((current) => ({
        ...current,
        [approvalDocument.department]: current[approvalDocument.department].map(
          (document) =>
            document.id === approvalDocument.id
              ? {
                  ...document,
                  version: nextVer,
                  approved: true,
                  history: result.document?.history || document.history,
                }
              : document,
        ),
      }));
      setApprovalDocument(null);
      setApprovalFile(null);
      setApprovalNote("");
    } catch (uploadError) {
      setApprovalError(uploadError.message);
    } finally {
      setApproving(false);
    }
  }

  if (accreditationRequired) {
    return (
      <main>
        <header>
          <div className="brand">
            <img
              className={hospitalLogoPath ? "hospital-brand-logo" : ""}
              src={hospitalLogoPath || hospitalLogo}
              alt={hospitalName || "NABH Docs"}
            />
            <div>
              <p className="eyebrow">NABH document workspace</p>
              <h1>{hospitalName} documents</h1>
            </div>
          </div>
        </header>
        <section className="document-panel repository-empty">
          <ClipboardList size={28} />
          <h2>Accreditation programme required</h2>
          <p>
            {accreditationRequired} Each programme has its own document
            templates, so the workspace can only be prepared once you know which
            one applies.
          </p>
          {onGoToAccreditation && (
            <button
              className="primary-button"
              type="button"
              onClick={onGoToAccreditation}
            >
              Go to Accreditation
            </button>
          )}
        </section>
      </main>
    );
  }

  if (repositoryStatus && !repositoryStatus.repository.exists) {
    const isRunning =
      syncingTemplates || repositoryStatus?.job?.status === "running";
    const isFailed = repositoryStatus?.job?.status === "failed";
    return (
      <main>
        <header>
          <div className="brand">
            <img
              className={hospitalLogoPath ? "hospital-brand-logo" : ""}
              src={hospitalLogoPath || hospitalLogo}
              alt={hospitalName || "NABH Docs"}
            />
            <div>
              <p className="eyebrow">NABH document workspace</p>
              <h1>{hospitalName} documents</h1>
            </div>
          </div>
          <p className="intro">
            Your hospital document repository is not initialized.
          </p>
        </header>
        <section className="document-panel repository-empty">
          <FolderOpen size={28} />
          <h2>Document repository</h2>
          <p>
            Sync global templates to create this hospital's private document
            repository. Existing hospital files are never overwritten.
          </p>

          {isRunning && (
            <div
              className="sync-banner status-in-progress"
              style={{ width: "100%" }}
            >
              <RefreshCw size={16} className="spin-icon" />
              <span>
                <strong>Synchronization in progress...</strong> Copying and
                customizing templates with your hospital logo.
              </span>
            </div>
          )}
          {isFailed && (
            <div className="sync-banner status-error" style={{ width: "100%" }}>
              <AlertCircle size={16} />
              <span>
                <strong>Synchronization incomplete or failed:</strong>{" "}
                {repositoryStatus.job?.error ||
                  syncMessage ||
                  "An error occurred during template sync."}
              </span>
            </div>
          )}

          <button
            className="primary-button"
            type="button"
            disabled={isRunning}
            onClick={syncNewTemplates}
          >
            <RefreshCw size={16} className={isRunning ? "spin-icon" : ""} />{" "}
            {isRunning ? "Syncing templates..." : "Sync templates"}
          </button>
          {syncMessage && !isRunning && !isFailed && (
            <p className="access-message">{syncMessage}</p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main>
      <header>
        <div className="brand">
          <img
            className={hospitalLogoPath ? "hospital-brand-logo" : ""}
            src={hospitalLogoPath || hospitalLogo}
            alt={hospitalName || "Janapriya Hospital"}
          />
          <div>
            <p className="eyebrow">NABH document workspace</p>
            <h1>
              {hospitalName
                ? `${hospitalName} documents`
                : "Master List of Documents"}
            </h1>
          </div>
        </div>
        {totals && (
          <p className="intro">
            {totals.departments} departments &middot; {totals.documents}{" "}
            documents &middot; {totals.high} high-confidence &middot;{" "}
            {totals.medium} medium &middot; {totals.low} flagged &middot;{" "}
            <span className="active-count">{totals.active} active</span>{" "}
            &middot;{" "}
            <span className="inactive-count">{totals.inactive} inactive</span>
          </p>
        )}
        {totals && (
          <p className="intro readiness-summary">
            <button
              type="button"
              className={`readiness-chip ${readinessStatusFilter === "all" ? "active" : ""}`}
              onClick={() => setReadinessStatusFilter("all")}
            >
              All: {Object.values(readinessCounts).reduce((total, count) => total + count, 0)}
            </button>
            {READINESS_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className={`readiness-chip readiness-${status} ${readinessStatusFilter === status ? "active" : ""}`}
                onClick={() => setReadinessStatusFilter(status)}
              >
                {READINESS_LABELS[status]}: {readinessCounts[status]}
              </button>
            ))}
          </p>
        )}
      </header>

      {error && <p className="status error">{error}</p>}

      {(syncingTemplates || repositoryStatus?.job?.status === "running") && (
        <div className="sync-banner status-in-progress">
          <RefreshCw size={16} className="spin-icon" />
          <span>
            <strong>Template Synchronization in Progress:</strong> Global
            templates are currently being copied and customized with your
            hospital logo. Document lists will update automatically upon
            completion.
          </span>
        </div>
      )}

      {repositoryStatus?.job?.status === "failed" && !syncingTemplates && (
        <div className="sync-banner status-error">
          <AlertCircle size={16} />
          <span>
            <strong>Template Synchronization Incomplete / Failed:</strong>{" "}
            {repositoryStatus.job?.error ||
              syncMessage ||
              "Template synchronization could not complete."}{" "}
            Click retry to synchronize remaining templates.
          </span>
          <button
            className="primary-button compact"
            type="button"
            disabled={syncingTemplates}
            onClick={syncNewTemplates}
          >
            <RefreshCw size={14} /> Retry Sync
          </button>
        </div>
      )}

      {syncMessage &&
        !syncingTemplates &&
        repositoryStatus?.job?.status !== "failed" && (
          <div className="sync-banner status-info">
            <Check size={16} />
            <span>{syncMessage}</span>
          </div>
        )}

      {departments && (
        <div className="layout">
          <nav className="department-list">
            {NABH_WORKSPACE_CATEGORIES.map((category) => {
              const docs = categories[category] || [];
              const activeCount = docs.filter((doc) => doc.active).length;
              return (
                <button
                  key={category}
                  className={category === selected ? "active" : ""}
                  onClick={() => setSelected(category)}
                >
                  <FolderOpen size={16} />
                  <span>{category}</span>
                  <span className="count-pill count-pill-active">
                    {activeCount}
                  </span>
                  <span className="count-pill count-pill-inactive">
                    {docs.length - activeCount}
                  </span>
                </button>
              );
            })}
          </nav>

          <section className="document-panel">
            <div className="panel-heading">
              <FileSearch size={18} />
              <h2>{selected}</h2>
              <span className="count">
                {filteredDocuments.length} of {documents.length} document(s)
              </span>
              <span className="active-count">
                {categoryTotals.active} active
              </span>
              <span className="inactive-count">
                {categoryTotals.inactive} inactive
              </span>
            </div>
            <label className="filter-box document-search">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search by document name, ID, department, or matched file"
                value={documentSearch}
                onChange={(event) => setDocumentSearch(event.target.value)}
              />
            </label>

            <div className="toolbar">
              <div className="confidence-chips">
                {["all", "high", "medium", "low"].map((level) => (
                  <button
                    key={level}
                    className={`chip ${level === confidenceFilter ? "chip-active" : ""}`}
                    onClick={() => setConfidenceFilter(level)}
                  >
                    {level === "all"
                      ? "All"
                      : level.charAt(0).toUpperCase() + level.slice(1)}{" "}
                    ({confidenceCounts[level]})
                  </button>
                ))}
              </div>
              <label className="only-inactive">
                <input
                  type="checkbox"
                  checked={onlyInactive}
                  onChange={(event) => setOnlyInactive(event.target.checked)}
                />
                Show only inactive
              </label>
              <button
                className="primary-button"
                type="button"
                disabled={syncingTemplates}
                onClick={syncNewTemplates}
              >
                <RefreshCw size={16} />{" "}
                {syncingTemplates
                  ? "Syncing templates..."
                  : "Sync new templates"}
              </button>
              <a className="secondary-button" href={`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/questionnaire-report.pdf`}><Download size={15} /> Export questionnaire report</a>
            </div>

            {syncMessage && <p className="access-message">{syncMessage}</p>}

            {selectedKeys.size > 0 && (
              <div className="bulk-bar">
                <span>{selectedKeys.size} selected</span>
                <button onClick={() => bulkSetActive(true)}>Mark Active</button>
                <button onClick={() => bulkSetActive(false)}>
                  Mark Inactive
                </button>
                <button
                  className="bulk-clear"
                  onClick={() => setSelectedKeys(new Set())}
                >
                  Clear
                </button>
              </div>
            )}

            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>Active</th>
                  <th
                    className="sortable"
                    onClick={() => setSort("documentId")}
                  >
                    Document ID {sortIndicator("documentId")}
                  </th>
                  <th>Document Name</th>
                  <th>Department</th>
                  <th>Matched File</th>
                  <th
                    className="sortable"
                    onClick={() => setSort("confidence")}
                  >
                    Confidence {sortIndicator("confidence")}
                  </th>
                  <th>Readiness</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((doc) => {
                  const isEditing = editingId === doc.id;
                  return (
                    <Fragment key={docKey(doc)}>
                      <tr
                        className={doc.active ? "doc-active" : "doc-inactive"}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(docKey(doc))}
                            onChange={() => toggleSelectOne(doc)}
                          />
                        </td>
                        <td>
                          {canEdit && (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={doc.active}
                              className={`toggle-switch ${doc.active ? "toggle-on" : "toggle-off"}`}
                              onClick={() => toggleActive(doc)}
                            >
                              <span className="toggle-thumb" />
                            </button>
                          )}
                          <span
                            className={`toggle-label ${doc.active ? "status-active" : "status-inactive"}`}
                          >
                            {doc.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="mono">
                          {isEditing ? (
                            <input
                              className="edit-input"
                              value={editDraft.documentId}
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  documentId: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            doc.documentId
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              className="edit-input"
                              value={editDraft.documentName}
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  documentName: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            doc.documentName
                          )}
                        </td>
                        <td className="dept-badge-cell">
                          <span className="dept-badge">{doc.department}</span>
                        </td>
                        <td
                          className="file-cell"
                          title={doc.matchedFilePath || ""}
                        >
                          {isEditing ? (
                            <input
                              className="edit-input"
                              value={editDraft.matchedFilePath}
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  matchedFilePath: event.target.value,
                                }))
                              }
                            />
                          ) : doc.matchedFilePath ? (
                            <span>
                              {(doc.relativeFilePath || doc.matchedFilePath)
                                .split("/")
                                .pop()}
                            </span>
                          ) : (
                            <span className="no-match">No file matched</span>
                          )}
                          {!isEditing && doc.reusedAcrossDocuments && (
                            <span className="reused">
                              {" "}
                              (reused x{doc.reusedAcrossDocuments})
                            </span>
                          )}
                          {!isEditing &&
                            (doc.relativeFilePath || doc.matchedFilePath) && (
                              <span className="policy-actions">
                                <button
                                  className="icon-button"
                                  title="Preview document as PDF"
                                  onClick={() => setPreviewDocument(doc)}
                                >
                                  <Eye size={14} />
                                </button>
                                <a
                                  className="icon-button"
                                  href={
                                    isAacPolicy(doc)
                                      ? "/api/documents/aac-policy/download"
                                      : `/api/admin/hospitals/${encodeURIComponent(hospitalId)}/documents/download?path=${encodeURIComponent(doc.relativeFilePath || doc.matchedFilePath)}`
                                  }
                                  title={`Download original file (${(doc.relativeFilePath || doc.matchedFilePath).split(".").pop().toUpperCase()})`}
                                >
                                  <Download size={14} />
                                </a>
                              </span>
                            )}
                          {canEdit && !isEditing && doc.matchedFilePath && (
                            <button
                              className="icon-button document-edit-button"
                              title="Open and edit document"
                              onClick={() => startDocumentEdit(doc)}
                            >
                              <FilePenLine size={14} />
                            </button>
                          )}
                          {canEdit && !isEditing && (
                            <button
                              className="icon-button document-edit-button"
                              title="Answer hospital questions and generate personalized draft"
                              onClick={() => openQuestionnaire(doc)}
                            >
                              <ClipboardList size={14} />
                            </button>
                          )}
                          {canEdit && doc.relativeFilePath && (
                            <button
                              className="icon-button document-edit-button"
                              title="Upload and approve new version"
                              onClick={() => {
                                setApprovalDocument(doc);
                                setApprovalFile(null);
                                setApprovalNote("");
                                setApprovalError("");
                              }}
                            >
                              <Upload size={14} />
                            </button>
                          )}
                        </td>
                        <td>
                          <span className={confidenceClass(doc.confidence)}>
                            {doc.confidence}
                          </span>
                        </td>
                        <td>
                          <select
                            className={`readiness-select readiness-${doc.readinessStatus || "not_started"}`}
                            value={doc.readinessStatus || "not_started"}
                            disabled={!canEdit}
                            onChange={(event) =>
                              setReadinessStatus(doc, event.target.value)
                            }
                          >
                            {READINESS_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {READINESS_LABELS[status]}
                              </option>
                            ))}
                          </select>
                          {canEdit && (
                            <span className="policy-actions">
                              {(doc.readinessStatus === "draft_generated" ||
                                doc.readinessStatus ===
                                  "information_required") && (
                                <button
                                  className="icon-button"
                                  title="Submit for review"
                                  onClick={() =>
                                    runDocumentAction(doc, "submit-for-review")
                                  }
                                >
                                  Submit
                                </button>
                              )}
                              {doc.readinessStatus === "under_review" && (
                                <button
                                  className="icon-button check"
                                  title="Approve"
                                  onClick={() =>
                                    runDocumentAction(doc, "approve")
                                  }
                                >
                                  <Check size={14} />
                                </button>
                              )}
                              {doc.readinessStatus === "under_review" && (
                                <button
                                  className="icon-button cancel"
                                  title="Request changes"
                                  onClick={() =>
                                    runDocumentAction(doc, "request-changes")
                                  }
                                >
                                  <X size={14} />
                                </button>
                              )}
                              {doc.readinessStatus === "approved" && (
                                <button
                                  className="icon-button"
                                  title="Mark implemented"
                                  onClick={() =>
                                    runDocumentAction(doc, "mark-implemented")
                                  }
                                >
                                  Implemented
                                </button>
                              )}
                              {doc.readinessStatus === "implemented" && (
                                <button
                                  className="icon-button"
                                  title="Mark evidence available"
                                  onClick={() =>
                                    runDocumentAction(
                                      doc,
                                      "mark-evidence-available",
                                    )
                                  }
                                >
                                  Evidence
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="version-cell">
                          {isEditing ? (
                            <span className="edit-actions">
                              <button
                                className="icon-button check"
                                title="Check in"
                                onClick={() => checkInEdit(doc)}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                className="icon-button cancel"
                                title="Cancel"
                                onClick={cancelEdit}
                              >
                                <X size={14} />
                              </button>
                            </span>
                          ) : (
                            <span className="version-actions">
                              {isApprovedDocument(doc) ? (
                                <button
                                  className="version-badge"
                                  title="View history"
                                  onClick={() => toggleHistory(doc.id)}
                                >
                                  <History size={12} /> v{doc.version || 1}
                                </button>
                              ) : (
                                <span
                                  className="unapproved-tag"
                                  title="Not yet approved"
                                >
                                  Not approved
                                </span>
                              )}
                              {canEdit && (
                                <button
                                  className="icon-button"
                                  title="Edit"
                                  onClick={() => startEdit(doc)}
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                      {expandedHistoryId === doc.id &&
                        isApprovedDocument(doc) && (
                          <tr className="history-row">
                            <td colSpan={9}>
                              <table className="history-table">
                                <thead>
                                  <tr>
                                    <th>Version</th>
                                    <th>When</th>
                                    <th>By</th>
                                    <th>Action</th>
                                    <th>Changes</th>
                                    <th>File</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[...(doc.history || [])]
                                    .reverse()
                                    .map((entry) => (
                                      <tr key={entry.version}>
                                        <td>v{entry.version}</td>
                                        <td>
                                          {new Date(
                                            entry.timestamp || entry.createdAt,
                                          ).toLocaleString()}
                                        </td>
                                        <td>
                                          {entry.approvedBy ||
                                            entry.editor ||
                                            "System"}
                                        </td>
                                        <td>{entry.action}</td>
                                        <td>
                                          {Object.keys(entry.changes || {})
                                            .length === 0
                                            ? "-"
                                            : Object.entries(entry.changes).map(
                                                ([field, change]) => (
                                                  <div key={field}>
                                                    <strong>{field}:</strong> "
                                                    {change.from}" &rarr; "
                                                    {change.to}"
                                                  </div>
                                                ),
                                              )}
                                        </td>
                                        <td>
                                          {entry.objectKey && (
                                            <span className="version-actions">
                                              <a
                                                className="icon-button"
                                                href={`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/documents/version/preview?key=${encodeURIComponent(entry.objectKey)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={`Preview v${entry.version} as PDF`}
                                              >
                                                <Eye size={14} />
                                              </a>
                                              <a
                                                className="icon-button"
                                                href={`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/documents/version/download?key=${encodeURIComponent(entry.objectKey)}`}
                                                title={`Download v${entry.version}`}
                                              >
                                                <Download size={14} />
                                              </a>
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                    </Fragment>
                  );
                })}
                {filteredDocuments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty">
                      No documents match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      )}
      {questionnaire && (
        <div className="preview-backdrop" role="presentation" onClick={() => setQuestionnaire(null)}>
          <section className="preview-dialog" role="dialog" aria-modal="true" aria-label="Generate personalized draft" onClick={(event) => event.stopPropagation()}>
            <div className="preview-header">
              <div>
                <p className="eyebrow">Hospital-specific document generation</p>
                <h2>{questionnaire.documentName}</h2>
                <p className="editor-file-name">Answer the questions configured for this template, then submit your responses.</p>
              </div>
              <button className="icon-button" title="Close questions" onClick={() => setQuestionnaire(null)}><Close size={18} /></button>
            </div>
            {!generatedDraft ? (
              <div className="profile-form">
                {questionnaire.questions.map((question) => (
                  <label key={question.id}>
                    {question.label}{question.required && " *"}
                    {question.type === "textarea" ? (
                      <textarea rows={3} value={questionAnswers[question.id] || ""} disabled={question.readOnly} onChange={(event) => setQuestionAnswers((current) => ({ ...current, [question.id]: event.target.value }))} />
                    ) : (
                      <input value={questionAnswers[question.id] || ""} readOnly={question.readOnly} onChange={(event) => setQuestionAnswers((current) => ({ ...current, [question.id]: event.target.value }))} />
                    )}
                  </label>
                ))}
                {questionError && <p className="status error">{questionError}</p>}
                <button className="primary-button" disabled={generatingDraft} onClick={generatePersonalizedDraft}>{generatingDraft ? "Submitting..." : "Submit answers and generate draft"}</button>
              </div>
            ) : (
              <div className="profile-form">
                <p className="access-message">Draft generated successfully. Review it before submitting the document for approval.</p>
                <textarea rows={18} value={generatedDraft.content || ""} readOnly />
                <button className="primary-button" onClick={() => setQuestionnaire(null)}>Done</button>
              </div>
            )}
          </section>
        </div>
      )}
      {previewDocument && (
        <div
          className="preview-backdrop"
          role="presentation"
          onClick={() => setPreviewDocument(null)}
        >
          <section
            className="preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Preview ${previewDocument.documentName}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="preview-header">
              <div>
                <p className="eyebrow">Controlled document preview</p>
                <h2>{previewDocument.documentName}</h2>
                <p className="editor-file-name">
                  {previewDocument.relativeFilePath ||
                    previewDocument.matchedFilePath ||
                    previewDocument.documentId}
                </p>
              </div>
              <div className="preview-actions">
                <a
                  className="download-button"
                  href={
                    isAacPolicy(previewDocument)
                      ? "/api/documents/aac-policy/download"
                      : `/api/admin/hospitals/${encodeURIComponent(hospitalId)}/documents/download?path=${encodeURIComponent(previewDocument.relativeFilePath || previewDocument.matchedFilePath)}`
                  }
                  title="Download original format"
                >
                  <Download size={15} /> Download original file
                </a>
                <button
                  className="icon-button"
                  title="Close preview"
                  onClick={() => setPreviewDocument(null)}
                >
                  <Close size={18} />
                </button>
              </div>
            </div>
            <iframe
              className="policy-preview"
              src={
                isAacPolicy(previewDocument)
                  ? "/api/documents/aac-policy/preview"
                  : `/api/admin/hospitals/${encodeURIComponent(hospitalId)}/documents/preview?path=${encodeURIComponent(previewDocument.relativeFilePath || previewDocument.matchedFilePath)}`
              }
              title={`${previewDocument.documentName} PDF preview`}
            />
          </section>
        </div>
      )}
      {previewAacPolicy && (
        <div
          className="preview-backdrop"
          role="presentation"
          onClick={() => setPreviewAacPolicy(false)}
        >
          <section
            className="preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="AAC policy preview"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="preview-header">
              <div>
                <p className="eyebrow">Original document preview</p>
                <h2>AAC Policy</h2>
              </div>
              <div className="preview-actions">
                <a
                  className="download-button"
                  href="/api/documents/aac-policy/download"
                >
                  <Download size={16} /> Download matching Word document
                </a>
                <button
                  className="icon-button"
                  title="Close preview"
                  onClick={() => setPreviewAacPolicy(false)}
                >
                  <Close size={18} />
                </button>
              </div>
            </div>
            <iframe
              className="policy-preview"
              src="/api/documents/aac-policy/preview"
              title="AAC policy PDF preview"
            />
          </section>
        </div>
      )}
      {openDocument &&
        (window.location.protocol === "file:" ? (
          <div
            className="preview-backdrop"
            role="presentation"
            onClick={() => setOpenDocument(null)}
          >
            <section
              className="document-editor-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={`Edit ${openDocument.documentName}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="preview-header">
                <div>
                  <p className="eyebrow">Controlled document editor</p>
                  <h2>{openDocument.documentName}</h2>
                  <p className="editor-file-name">
                    {openDocument.relativeFilePath ||
                      openDocument.matchedFilePath}
                  </p>
                </div>
                <button
                  className="icon-button"
                  title="Close editor"
                  onClick={() => setOpenDocument(null)}
                >
                  <Close size={18} />
                </button>
              </div>
              <div className="editor-toolbar">
                <span>File</span>
                <span>Edit</span>
                <span>Insert</span>
                <span>Format</span>
                <span>Review</span>
                <span className="editor-mode">Editing prototype</span>
              </div>
              <textarea
                className="document-editor"
                value={documentContent}
                onChange={(event) => setDocumentContent(event.target.value)}
                aria-label="Document content"
              />
              <div className="checkin-panel">
                <label>
                  Edited by
                  <input
                    value={checkInEditor}
                    onChange={(event) => setCheckInEditor(event.target.value)}
                    placeholder="Name or initials"
                  />
                </label>
                <label>
                  Check-in note
                  <input
                    value={checkInNote}
                    onChange={(event) => setCheckInNote(event.target.value)}
                    placeholder="Describe this revision"
                  />
                </label>
                <button className="primary-button" onClick={checkInDocument}>
                  <Save size={16} /> Check in v
                  {isApprovedDocument(openDocument)
                    ? (openDocument.version || 1) + 1
                    : 1}
                </button>
              </div>
            </section>
          </div>
        ) : (
          <OnlyOfficeEditor
            document={openDocument}
            department={openDocument.department}
            onClose={() => setOpenDocument(null)}
          />
        ))}
      {approvalDocument && (
        <div
          className="preview-backdrop"
          role="presentation"
          onClick={() => !approving && setApprovalDocument(null)}
        >
          <section
            className="document-editor-dialog approval-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Approve new version of ${approvalDocument.documentName}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="preview-header">
              <div>
                <p className="eyebrow">Controlled document approval</p>
                <h2>{approvalDocument.documentName}</h2>
                <p className="editor-file-name">
                  {isApprovedDocument(approvalDocument)
                    ? `Current version v${approvalDocument.version || 1}`
                    : "Not yet approved"}
                </p>
              </div>
              <button
                className="icon-button"
                title="Close"
                disabled={approving}
                onClick={() => setApprovalDocument(null)}
              >
                <Close size={18} />
              </button>
            </div>
            <div className="onlyoffice-setup">
              <label>
                Updated file
                <input
                  type="file"
                  accept=".docx,.xlsx,.pptx"
                  onChange={(event) =>
                    setApprovalFile(event.target.files[0] || null)
                  }
                />
              </label>
              {approvalFile && (
                <p className="editor-file-name">{approvalFile.name}</p>
              )}
              <label>
                Approval note
                <input
                  value={approvalNote}
                  onChange={(event) => setApprovalNote(event.target.value)}
                  placeholder="Describe the approved change"
                />
              </label>
              {approvalError && <p className="status error">{approvalError}</p>}
              <button
                className="primary-button"
                disabled={approving}
                onClick={approveUpload}
              >
                <Check size={16} />{" "}
                {approving
                  ? "Approving..."
                  : `Approve version v${isApprovedDocument(approvalDocument) ? (approvalDocument.version || 1) + 1 : 1}`}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

const CODE_TO_DEPARTMENT = {
  R: "Radiology",
  RAD: "Radiology",
  M: "Management related",
  NABH: "NABH policies",
  Q: "Quality",
  ND: "Nursing dept",
  AE: "A _ E",
  IPD: "IPD",
  OPD: "OPD",
  FO: "Front office",
  OT: "OT",
  ICU: "ICU",
  OBG: "OBG",
  PD: "Paediatrics",
  P: "Paediatrics",
  CL: "Clinical lab",
  D: "Dialysis",
  HR: "HR ",
  PUR: "Purchase",
  ACC: "Accounts",
  A: "Accounts",
  PH: "Pharmacy",
  MRD: "MRD",
  HK: "Housekeeping",
  S: "Security",
  HS: "Facility & safety",
  CSSD: "CSSD",
  LL: "Linen & laundry",
};

function AuditLog({ entries, hospitalId, hospitalName, hospitalLogoPath }) {
  const [query, setQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedAction, setSelectedAction] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [serverEntries, setServerEntries] = useState([]);

  useEffect(() => {
    fetch(
      hospitalId
        ? `/api/admin/hospitals/${encodeURIComponent(hospitalId)}/document-audit`
        : "/api/document-audit",
    )
      .then((response) => (response.ok ? response.json() : { entries: [] }))
      .then((result) => setServerEntries(result.entries || []))
      .catch(() => setServerEntries([]));
  }, [hospitalId]);

  const auditEntries = serverEntries.length ? serverEntries : entries;

  const getEntryDepartment = (entry) => {
    const isGeneric = (val) =>
      !val || val.trim().toLowerCase() === "department wise documents";

    if (!isGeneric(entry.department)) {
      return entry.department.trim();
    }

    if (entry.documentId) {
      const parts = entry.documentId.split("/");
      for (let i = 1; i < parts.length; i++) {
        const code = parts[i].trim().toUpperCase();
        if (CODE_TO_DEPARTMENT[code]) {
          return CODE_TO_DEPARTMENT[code];
        }
      }
    }

    const pathStr =
      entry.templatePath || entry.relativePath || entry.matchedFilePath || "";
    if (pathStr && pathStr.includes("/")) {
      const parts = pathStr.split("/");
      for (const segment of parts) {
        const trimmed = segment.trim();
        if (
          !isGeneric(trimmed) &&
          trimmed !== "Manuals" &&
          trimmed !== "SOPs" &&
          trimmed !== "Forms" &&
          trimmed !== "Registers" &&
          trimmed !== "HR letters"
        ) {
          return trimmed;
        }
      }
    }

    return isGeneric(entry.department) ? "" : entry.department || "";
  };

  const departments = useMemo(() => {
    const map = new Map();
    auditEntries.forEach((entry) => {
      const dept = getEntryDepartment(entry);
      if (dept) {
        const upper = dept.toUpperCase();
        if (!map.has(upper)) map.set(upper, dept);
      }
    });
    return Array.from(map.values()).sort();
  }, [auditEntries]);

  const actions = useMemo(() => {
    const set = new Set();
    auditEntries.forEach((entry) => {
      if (entry.action) set.add(entry.action);
    });
    return Array.from(set).sort();
  }, [auditEntries]);

  const visibleEntries = useMemo(() => {
    return auditEntries.filter((entry) => {
      const entryDept = getEntryDepartment(entry);
      const entryAction = entry.action || "approved upload";
      const entryUser = entry.approvedBy || entry.editor || "System";
      const entryNote = entry.note || "";
      const entryHash = entry.fileHash || entry.nextHash || "";

      if (query.trim()) {
        const text =
          `${entry.documentName || ""} ${entry.documentId || ""} ${entryDept} ${entryUser} ${entryAction} ${entryNote} ${entryHash}`.toLowerCase();
        if (!text.includes(query.toLowerCase().trim())) return false;
      }

      if (
        selectedDepartment !== "all" &&
        entryDept.toUpperCase() !== selectedDepartment.toUpperCase()
      ) {
        return false;
      }

      if (
        selectedAction !== "all" &&
        entryAction.toLowerCase() !== selectedAction.toLowerCase()
      ) {
        return false;
      }

      if (entry.timestamp) {
        const entryDate = new Date(entry.timestamp);
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (entryDate < start) return false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (entryDate > end) return false;
        }
      }

      return true;
    });
  }, [
    auditEntries,
    query,
    selectedDepartment,
    selectedAction,
    startDate,
    endDate,
  ]);

  const hasActiveFilters =
    query ||
    selectedDepartment !== "all" ||
    selectedAction !== "all" ||
    startDate ||
    endDate;

  const handleResetFilters = () => {
    setQuery("");
    setSelectedDepartment("all");
    setSelectedAction("all");
    setStartDate("");
    setEndDate("");
  };

  return (
    <main>
      <header>
        <div className="brand">
          <img
            className={hospitalLogoPath ? "hospital-brand-logo" : ""}
            src={hospitalLogoPath || hospitalLogo}
            alt={hospitalName || "NABH Docs"}
          />
          <div>
            <p className="eyebrow">Governance workspace</p>
            <h1>Document audit log</h1>
          </div>
        </div>
        <p className="intro">
          Immutable approval and version history for this hospital repository.
        </p>
      </header>
      <section className="document-panel">
        <div className="panel-heading">
          <ClipboardList size={18} />
          <h2>Approval activity</h2>
          <span className="count">{visibleEntries.length} entries</span>
        </div>
        <div className="audit-filters-bar">
          <label className="filter-box document-search audit-search-box">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search document name, ID, approver, note, or hash..."
            />
          </label>
          <div className="audit-filter-controls">
            <div className="audit-filter-item">
              <label className="filter-label">Department</label>
              <select
                className="audit-filter-select"
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
              >
                <option value="all">All departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div className="audit-filter-item">
              <label className="filter-label">Action</label>
              <select
                className="audit-filter-select"
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value)}
              >
                <option value="all">All actions</option>
                {actions.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>
            </div>

            <div className="audit-filter-item">
              <label className="filter-label">From Date</label>
              <input
                type="date"
                className="audit-date-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="audit-filter-item">
              <label className="filter-label">To Date</label>
              <input
                type="date"
                className="audit-date-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {hasActiveFilters && (
              <button
                className="reset-filters-button"
                onClick={handleResetFilters}
                title="Reset all search filters"
              >
                <RotateCcw size={14} /> Reset filters
              </button>
            )}
          </div>
        </div>
        {visibleEntries.length === 0 ? (
          <p className="empty">No matching audit log entries found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                {!hospitalId && <th>Scope</th>}
                <th>Document</th>
                <th>Department</th>
                <th>Version</th>
                <th>Approved by</th>
                <th>Action</th>
                <th>Approval note</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry) => {
                const dept = getEntryDepartment(entry) || "-";
                return (
                  <tr
                    key={
                      entry.id ||
                      entry.objectKey ||
                      `${entry.documentId}-${entry.version}-${entry.timestamp}`
                    }
                  >
                    <td>{new Date(entry.timestamp).toLocaleString()}</td>
                    {!hospitalId && (
                      <td>
                        {entry.scope === "template"
                          ? "Master template"
                          : entry.hospitalCode || "System"}
                      </td>
                    )}
                    <td>
                      <strong>{entry.documentName}</strong>
                      <br />
                      <span className="mono">{entry.documentId}</span>
                    </td>
                    <td>
                      <span className="dept-badge">{dept}</span>
                    </td>
                    <td>v{entry.version}</td>
                    <td>{entry.approvedBy || entry.editor || "System"}</td>
                    <td>{entry.action || "approved upload"}</td>
                    <td>{entry.note || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function App() {
  const [view, setView] = useState("home");
  const [hospitalStatusFilter, setHospitalStatusFilter] = useState("all");
  const [session, setSession] = useState(null);
  const [auditEntries, setAuditEntries] = useState([]);
  const [showRegister, setShowRegister] = useState(false);
  const setupToken = new URLSearchParams(window.location.search).get(
    "setPasswordToken",
  );
  if (!session) {
    if (setupToken) {
      return (
        <SetPassword
          token={setupToken}
          onComplete={(newSession) => {
            window.history.replaceState(null, "", window.location.pathname);
            setView("home");
            setSession(newSession);
          }}
        />
      );
    }
    if (showRegister)
      return <RegisterHospital onBackToLogin={() => setShowRegister(false)} />;
    return (
      <LoginGate
        onLogin={setSession}
        onShowRegister={() => setShowRegister(true)}
      />
    );
  }
  const isSuperAdmin = session.role === "Super Admin";
  const canViewDocuments = session.permissions?.includes("view");
  return (
    <>
      <div className="workspace-switcher">
        {session.hospitalLogoPath && (
          <img
            className="navigation-logo"
            src={session.hospitalLogoPath}
            alt={session.hospitalName}
          />
        )}
        <span>{session.hospitalName || session.role}</span>
        {isSuperAdmin ? (
          <>
            <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><House size={16} /> Home</button>
            <button
              className={view === "admin" ? "active" : ""}
              onClick={() => {
                setHospitalStatusFilter("all");
                setView("admin");
              }}
            >
              <Building2 size={16} /> Hospitals
            </button>
            <button
              className={view === "templates" ? "active" : ""}
              onClick={() => setView("templates")}
            >
              <FolderOpen size={16} /> Template library
            </button>
            <button
              className={view === "users" ? "active" : ""}
              onClick={() => setView("users")}
            >
              <Users size={16} /> User management
            </button>
          </>
        ) : (
          <>
            <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><House size={16} /> Home</button>
            <button
              className={view === "admin" ? "active" : ""}
              onClick={() => setView("admin")}
            >
              <Building2 size={16} /> User management
            </button>
            <button
              className={view === "roles" ? "active" : ""}
              onClick={() => setView("roles")}
            >
              <Users size={16} /> Roles
            </button>
            <button
              className={view === "platform" ? "active" : ""}
              onClick={() => setView("platform")}
            >
              <ClipboardList size={16} /> Readiness Platform
            </button>
            {canViewDocuments && (
              <button
                className={view === "master-list" ? "active" : ""}
                onClick={() => setView("master-list")}
              >
                <FileSearch size={16} /> Documents
              </button>
            )}
            <button
              className={view === "audit" ? "active" : ""}
              onClick={() => setView("audit")}
            >
              <ClipboardList size={16} /> Audit log
            </button>
          </>
        )}
        <button onClick={() => setSession(null)}>Sign out</button>
      </div>
      {isSuperAdmin ? (
        view === "home" ? (
          <SuperAdminHome onOpenHospitals={(status) => {
            setHospitalStatusFilter(status);
            setView("admin");
          }} onOpenUsers={() => setView("users")} />
        ) : view === "templates" ? (
          <TemplateLibrary />
        ) : view === "users" ? (
          <SuperAdminUserManagement />
        ) : (
          <SuperAdminWorkspace initialStatusFilter={hospitalStatusFilter} />
        )
      ) : view === "home" ? (
        <PlatformWorkspace hospitalId={session.hospitalId} hospitalName={session.hospitalName} homeOnly onNavigateToDocuments={(category, status) => { const params = new URLSearchParams({ cat: category, status }); window.history.replaceState(null, "", `?${params.toString()}`); setView("master-list"); }} />
      ) : view === "admin" ? (
        <AdminWorkspace
          hospitalId={session.hospitalId}
          hospitalName={session.hospitalName}
        />
      ) : view === "roles" ? (
        <RoleManagement
          hospitalId={session.hospitalId}
          hospitalName={session.hospitalName}
          hospitalLogoPath={session.hospitalLogoPath}
        />
      ) : view === "audit" ? (
        <AuditLog
          entries={auditEntries}
          hospitalId={session.hospitalId}
          hospitalName={session.hospitalName}
          hospitalLogoPath={session.hospitalLogoPath}
        />
      ) : view === "platform" ? (
        <PlatformWorkspace
          hospitalId={session.hospitalId}
          hospitalName={session.hospitalName}
          onNavigateToDocuments={(category, status) => {
            const params = new URLSearchParams({ cat: category, status });
            window.history.replaceState(null, "", `?${params.toString()}`);
            setView("master-list");
          }}
        />
      ) : canViewDocuments ? (
        <MasterListWorkspace
          hospitalId={session.hospitalId}
          hospitalName={session.hospitalName}
          hospitalLogoPath={session.hospitalLogoPath}
          permissions={session.permissions || []}
          onCheckIn={(entry) =>
            setAuditEntries((current) => [entry, ...current])
          }
          onGoToAccreditation={() => setView("platform")}
        />
      ) : (
        <AuditLog
          entries={auditEntries}
          hospitalId={session.hospitalId}
          hospitalName={session.hospitalName}
          hospitalLogoPath={session.hospitalLogoPath}
        />
      )}
    </>
  );
}

export default App;
