import { useCallback, useEffect, useState } from "react";
import {
  HiOutlineLink,
  HiOutlineTrash,
  HiOutlineRefresh,
  HiOutlineCheckCircle,
  HiOutlineExclamation,
  HiOutlineExternalLink
} from "react-icons/hi";
import toast from "react-hot-toast";
import facebookSettingsApiService from "../../features/settings/services/facebookSettingsApi.service";
function ConnectionStatus({ conn }) {
  if (conn.has_credentials) {
    return /* @__PURE__ */ React.createElement("span", { className: "inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700" }, /* @__PURE__ */ React.createElement("span", { className: "h-1.5 w-1.5 rounded-full bg-green-500" }), "\u0110\xE3 k\u1EBFt n\u1ED1i");
  }
  return /* @__PURE__ */ React.createElement("span", { className: "inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700" }, /* @__PURE__ */ React.createElement("span", { className: "h-1.5 w-1.5 rounded-full bg-amber-500" }), "Token thi\u1EBFu");
}
export default function FacebookSettings() {
  const { t } = { t: (k) => k };
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const loadConnections = useCallback(async () => {
    try {
      const res = await facebookSettingsApiService.listConnections();
      setConnections(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.warn("[FacebookSettings] listConnections:", err.message);
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "success") {
      toast.success(`\u0110\xE3 k\u1EBFt n\u1ED1i ${params.get("page_count") || ""} Fanpage th\xE0nh c\xF4ng!`);
      const url = new URL(window.location.href);
      url.searchParams.delete("oauth");
      url.searchParams.delete("page_count");
      window.history.replaceState({}, "", url.toString());
    } else if (params.get("oauth") === "error") {
      toast.error("K\u1EBFt n\u1ED1i Facebook th\u1EA5t b\u1EA1i: " + params.get("reason"));
      const url = new URL(window.location.href);
      url.searchParams.delete("oauth");
      url.searchParams.delete("error");
      url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.toString());
    }
    loadConnections();
  }, [loadConnections]);
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await facebookSettingsApiService.initOAuth();
      if (res.auth_url) {
        const popup = window.open(res.auth_url, "facebook_oauth", "width=600,height=700,scrollbars=yes");
        if (!popup) {
          toast.error("Tr\xECnh duy\u1EC7t ch\u1EB7n popup. Vui l\xF2ng cho ph\xE9p popup cho trang n\xE0y.");
          return;
        }
        const poll = setInterval(() => {
          if (popup.closed) {
            clearInterval(poll);
            loadConnections();
          }
        }, 1e3);
      }
    } catch (err) {
      toast.error(err.message || "Kh\xF4ng th\u1EC3 kh\u1EDFi t\u1EA1o OAuth.");
    } finally {
      setConnecting(false);
    }
  };
  const handleRefresh = async (id) => {
    setRefreshingId(id);
    try {
      await facebookSettingsApiService.refreshToken(id);
      toast.success("\u0110\xE3 l\xE0m m\u1EDBi token th\xE0nh c\xF4ng.");
      loadConnections();
    } catch (err) {
      toast.error(err.message || "L\xE0m m\u1EDBi token th\u1EA5t b\u1EA1i.");
    } finally {
      setRefreshingId(null);
    }
  };
  const handleDelete = async (id, pageName) => {
    if (!window.confirm(`Ng\u1EAFt k\u1EBFt n\u1ED1i Fanpage "${pageName}"? C\xE1c chatbot \u0111ang d\xF9ng Fanpage n\xE0y s\u1EBD ng\u1EEBng nh\u1EADn tin.`)) {
      return;
    }
    setDeletingId(id);
    try {
      await facebookSettingsApiService.disconnect(id);
      toast.success("\u0110\xE3 ng\u1EAFt k\u1EBFt n\u1ED1i.");
      setConnections((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      toast.error(err.message || "Ng\u1EAFt k\u1EBFt n\u1ED1i th\u1EA5t b\u1EA1i.");
    } finally {
      setDeletingId(null);
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "space-y-5" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-semibold text-gray-900" }, "Facebook Pages"), /* @__PURE__ */ React.createElement("p", { className: "mt-1 text-sm text-gray-500" }, "K\u1EBFt n\u1ED1i Fanpage \u0111\u1EC3 chatbot t\u1EF1 \u0111\u1ED9ng tr\u1EA3 l\u1EDDi tin nh\u1EAFn Messenger.")), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: handleConnect,
      disabled: connecting,
      className: "inline-flex items-center gap-2 shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
    },
    /* @__PURE__ */ React.createElement(HiOutlineLink, { className: "w-4 h-4" }),
    connecting ? "\u0110ang m\u1EDF..." : "K\u1EBFt n\u1ED1i t\xE0i kho\u1EA3n Facebook"
  )), /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4" }, /* @__PURE__ */ React.createElement(HiOutlineExclamation, { className: "w-5 h-5 text-indigo-500 shrink-0 mt-0.5" }), /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-700" }, /* @__PURE__ */ React.createElement("p", { className: "font-medium text-indigo-800" }, "C\xE1ch ho\u1EA1t \u0111\u1ED9ng"), /* @__PURE__ */ React.createElement("ol", { className: "mt-1 space-y-0.5 text-slate-600 list-decimal list-inside" }, /* @__PURE__ */ React.createElement("li", null, "B\u1EA5m ", /* @__PURE__ */ React.createElement("strong", null, '"K\u1EBFt n\u1ED1i t\xE0i kho\u1EA3n Facebook"'), " \u0111\u1EC3 \u1EE7y quy\u1EC1n v\u1EDBi Meta."), /* @__PURE__ */ React.createElement("li", null, "Ch\u1ECDn c\xE1c Fanpage b\u1EA1n mu\u1ED1n k\u1EBFt n\u1ED1i."), /* @__PURE__ */ React.createElement("li", null, "Quay l\u1EA1i ", /* @__PURE__ */ React.createElement("strong", null, "Chatbot Studio \u2192 tab Tri\u1EC3n khai"), " \u0111\u1EC3 b\u1EADt AI cho t\u1EEBng Fanpage.")))), loading ? /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center py-12 text-slate-400 text-sm" }, /* @__PURE__ */ React.createElement(HiOutlineRefresh, { className: "w-4 h-4 animate-spin mr-2" }), "\u0110ang t\u1EA3i...") : connections.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "text-center py-12 rounded-xl border border-dashed border-slate-200" }, /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3" }, /* @__PURE__ */ React.createElement("span", { className: "text-xl font-bold text-slate-400" }, "f")), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-slate-600" }, "Ch\u01B0a c\xF3 Fanpage n\xE0o \u0111\u01B0\u1EE3c k\u1EBFt n\u1ED1i"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400 mt-1" }, 'B\u1EA5m n\xFAt "K\u1EBFt n\u1ED1i t\xE0i kho\u1EA3n Facebook" \u1EDF tr\xEAn \u0111\u1EC3 b\u1EAFt \u0111\u1EA7u.')) : /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, connections.map((conn) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: conn.id,
      className: "flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors"
    },
    /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-base shrink-0" }, "f"),
    /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-w-0" }, /* @__PURE__ */ React.createElement("p", { className: "text-sm font-semibold text-gray-900 truncate" }, conn.fb_page_name || conn.display_name || "Facebook Page"), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 font-mono" }, "ID: ", conn.fb_page_id || conn.external_channel_id)),
    /* @__PURE__ */ React.createElement("div", { className: "shrink-0" }, /* @__PURE__ */ React.createElement(ConnectionStatus, { conn })),
    /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1 shrink-0" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => handleRefresh(conn.id),
        disabled: refreshingId === conn.id,
        title: "L\xE0m m\u1EDBi token",
        className: "p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
      },
      /* @__PURE__ */ React.createElement(HiOutlineRefresh, { className: `w-4 h-4 ${refreshingId === conn.id ? "animate-spin" : ""}` })
    ), conn.fb_page_id && /* @__PURE__ */ React.createElement(
      "a",
      {
        href: `https://www.facebook.com/${conn.fb_page_id}`,
        target: "_blank",
        rel: "noreferrer",
        title: "M\u1EDF Fanpage",
        className: "p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
      },
      /* @__PURE__ */ React.createElement(HiOutlineExternalLink, { className: "w-4 h-4" })
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => handleDelete(conn.id, conn.fb_page_name || conn.display_name),
        disabled: deletingId === conn.id,
        title: "Ng\u1EAFt k\u1EBFt n\u1ED1i",
        className: "p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
      },
      /* @__PURE__ */ React.createElement(HiOutlineTrash, { className: "w-4 h-4" })
    ))
  ))), connections.length > 0 && /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400" }, "Token Facebook c\xF3 hi\u1EC7u l\u1EF1c ~60 ng\xE0y. B\u1EA5m n\xFAt", " ", /* @__PURE__ */ React.createElement(HiOutlineRefresh, { className: "inline w-3 h-3" }), " ", "\u0111\u1EC3 l\xE0m m\u1EDBi tr\u01B0\u1EDBc khi h\u1EBFt h\u1EA1n."));
}
